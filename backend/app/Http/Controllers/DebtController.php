<?php

namespace App\Http\Controllers;

use App\Models\Debt;
use App\Models\DebtPayment;
use App\Models\ActivityLog;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;

class DebtController extends Controller
{
    /**
     * Get list of all debts.
     */
    public function index(Request $request)
    {
        $user = $request->user();
        $query = Debt::with(['sale.product.branch', 'sale.shift.user.branch', 'branch', 'user']);

        // Cashiers can only see debts for their own branch
        if ($user && $user->role === 'cashier') {
            $query->where(function ($q) use ($user) {
                $q->whereHas('sale.product', function ($sq) use ($user) {
                    $sq->where('branch_id', $user->branch_id);
                })->orWhere('branch_id', $user->branch_id);
            });
        }

        // Optional status filtering
        if ($request->has('status') && in_array($request->status, ['pending', 'paid', 'pending_approval', 'rejected'])) {
            $query->where('status', $request->status);
        }

        $debts = $query->orderBy('created_at', 'desc')->get()->map(function ($d) {
            return [
                'id' => $d->id,
                'customer_name' => $d->customer_name,
                'customer_phone' => $d->customer_phone,
                'total_amount' => floatval($d->total_amount),
                'paid_amount' => floatval($d->paid_amount),
                'remaining_amount' => floatval($d->total_amount - $d->paid_amount),
                'due_date' => $d->due_date,
                'status' => $d->status,
                'created_at' => $d->created_at->toIso8601String(),
                'product_name' => $d->product_name ?: ($d->sale->product->model_name ?? 'Noma\'lum mahsulot'),
                'quantity' => intval($d->quantity ?? 1),
                'installment_months' => $d->installment_months ? intval($d->installment_months) : null,
                'monthly_payment' => $d->monthly_payment ? floatval($d->monthly_payment) : null,
                'branch_name' => $d->branch->name ?? ($d->sale->product->branch->name ?? 'Asosiy Ofis'),
                'cashier_name' => $d->user->name ?? ($d->sale->shift->user->name ?? 'Kassir'),
                'passport_series_number' => $d->passport_series_number,
                'passport_pinfl' => $d->passport_pinfl,
                'customer_address' => $d->customer_address,
            ];
        });

        return response()->json($debts, 200);
    }

    /**
     * Log a repayment amount for a specific debt.
     */
    public function repay(Request $request, $id)
    {
        $validator = Validator::make($request->all(), [
            'amount' => 'required|numeric|min:0.01',
            'payment_method' => 'required|string|in:cash,click',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $debt = Debt::with('sale')->findOrFail($id);

        if ($debt->status === 'paid') {
            return response()->json(['message' => 'Ushbu qarz allaqachon to\'liq to\'langan.'], 400);
        }

        $amount = floatval($request->input('amount'));
        $remaining = floatval($debt->total_amount - $debt->paid_amount);

        if ($amount > $remaining) {
            return response()->json(['message' => "To'lov summasi qoldiq qarzdan ko'p bo'lishi mumkin emas (Qoldiq: \${$remaining})"], 400);
        }

        try {
            DB::transaction(function () use ($debt, $amount, $request) {
                // Update debt paid amount
                $debt->paid_amount += $amount;
                
                // If fully paid, change status
                if ($debt->paid_amount >= $debt->total_amount) {
                    $debt->status = 'paid';
                    
                    // Also update sales table payment status
                    if ($debt->sale) {
                        $debt->sale->payment_status = 'paid';
                        $debt->sale->save();
                    }
                }
                
                $debt->save();

                // Create repayment log
                DebtPayment::create([
                    'debt_id' => $debt->id,
                    'amount' => $amount,
                    'payment_method' => $request->input('payment_method'),
                ]);

                // Create activity log
                ActivityLog::create([
                    'user_id' => $request->user()->id ?? null,
                    'user_name' => ($request->user()->name ?? 'Tizim') . ($request->user() ? ' (' . $request->user()->role . ')' : ''),
                    'action_type' => 'repayment',
                    'description' => "[Nasiya To'lovi: {$debt->customer_name}] \$" . number_format($amount, 2) . " miqdorida qarz to'lovi qabul qilindi. (Qoldiq: \$" . number_format($debt->total_amount - $debt->paid_amount, 2) . ")",
                ]);
            });

            return response()->json([
                'message' => 'To\'lov muvaffaqiyatli qabul qilindi.',
                'debt' => [
                    'id' => $debt->id,
                    'paid_amount' => floatval($debt->paid_amount),
                    'remaining_amount' => floatval($debt->total_amount - $debt->paid_amount),
                    'status' => $debt->status
                ]
            ], 200);

        } catch (\Exception $e) {
            return response()->json(['message' => 'To\'lovni amalga oshirishda xatolik: ' . $e->getMessage()], 400);
        }
    }

    /**
     * Get payment history for a specific debt.
     */
    public function payments($id)
    {
        $payments = DebtPayment::where('debt_id', $id)
            ->orderBy('created_at', 'desc')
            ->get()
            ->map(function ($p) {
                return [
                    'id' => $p->id,
                    'amount' => floatval($p->amount),
                    'payment_method' => $p->payment_method,
                    'created_at' => $p->created_at->toIso8601String(),
                ];
            });

        return response()->json($payments, 200);
    }

    /**
     * Store a manually created debt installment.
     */
    public function store(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'customer_name' => 'required|string|max:255',
            'customer_phone' => 'required|string|max:50',
            'passport_series_number' => 'required|string|max:30',
            'passport_pinfl' => 'nullable|string|size:14',
            'customer_address' => 'required|string|max:1000',
            'product_name' => 'required|string|max:255',
            'quantity' => 'required|integer|min:1',
            'total_amount' => 'required|numeric|min:0',
            'paid_amount' => 'nullable|numeric|min:0',
            'installment_months' => 'required|integer|min:1',
            'monthly_payment' => 'required|numeric|min:0',
            'due_date' => 'nullable|date',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        try {
            return DB::transaction(function () use ($request) {
                $paidAmount = floatval($request->input('paid_amount', 0));
                $totalAmount = floatval($request->input('total_amount'));
                $user = $request->user();
                $activeShift = null;
                if ($user) {
                    $activeShift = \App\Models\Shift::where('user_id', $user->id)
                        ->where('status', 'active')
                        ->first();
                }

                $debt = Debt::create([
                    'customer_name' => $request->customer_name,
                    'customer_phone' => $request->customer_phone,
                    'passport_series_number' => $request->passport_series_number,
                    'passport_pinfl' => $request->passport_pinfl,
                    'customer_address' => $request->customer_address,
                    'product_name' => $request->product_name,
                    'quantity' => intval($request->quantity),
                    'total_amount' => $totalAmount,
                    'paid_amount' => $paidAmount,
                    'installment_months' => intval($request->installment_months),
                    'monthly_payment' => floatval($request->monthly_payment),
                    'due_date' => $request->due_date,
                    'status' => 'pending_approval',
                    'branch_id' => $user->branch_id ?? null,
                    'user_id' => $user->id ?? null,
                    'shift_id' => $activeShift->id ?? null,
                ]);

                // Log Activity
                ActivityLog::create([
                    'user_id' => $request->user()->id ?? null,
                    'user_name' => $request->user()->name ?? 'Kassir',
                    'action_type' => 'manual_debt_create',
                    'description' => "[Nasiya Kiritish: {$request->customer_name}] Qo'lda yangi qarz kiritildi (Tasdiqlash kutilmoqda). (Jami: \$" . number_format($totalAmount, 2) . ")",
                ]);

                return response()->json([
                    'message' => 'Nasiya muvaffaqiyatli qo\'shildi (Tasdiqlash kutilmoqda)',
                    'debt' => $debt
                ], 201);
            });
        } catch (\Exception $e) {
            return response()->json(['message' => 'Nasiyani saqlashda xatolik: ' . $e->getMessage()], 400);
        }
    }

    /**
     * Get a single debt record.
     */
    public function show($id)
    {
        $d = Debt::with(['sale.product.branch', 'sale.shift.user'])->find($id);
        if (!$d) {
            return response()->json(['message' => 'Nasiya topilmadi'], 404);
        }

        return response()->json([
            'id' => $d->id,
            'customer_name' => $d->customer_name,
            'customer_phone' => $d->customer_phone,
            'total_amount' => floatval($d->total_amount),
            'paid_amount' => floatval($d->paid_amount),
            'remaining_amount' => floatval($d->total_amount - $d->paid_amount),
            'due_date' => $d->due_date,
            'status' => $d->status,
            'created_at' => $d->created_at->toIso8601String(),
            'product_name' => $d->product_name ?: ($d->sale->product->model_name ?? 'Noma\'lum mahsulot'),
            'quantity' => intval($d->quantity ?? 1),
            'installment_months' => $d->installment_months ? intval($d->installment_months) : null,
            'monthly_payment' => $d->monthly_payment ? floatval($d->monthly_payment) : null,
            'branch_name' => $d->branch->name ?? ($d->sale->product->branch->name ?? 'Asosiy Ofis'),
            'cashier_name' => $d->user->name ?? ($d->sale->shift->user->name ?? 'Kassir'),
            'passport_series_number' => $d->passport_series_number,
            'passport_pinfl' => $d->passport_pinfl,
            'customer_address' => $d->customer_address,
        ], 200);
    }

    /**
     * Admin Endpoint: Approve a pending debt.
     */
    public function approve(Request $request, $id)
    {
        $user = $request->user();
        if ($user->role !== 'admin') {
            return response()->json(['message' => 'Faqatgina admin qarzni tasdiqlashi mumkin.'], 403);
        }

        try {
            return DB::transaction(function () use ($id) {
                $debt = Debt::findOrFail($id);
                if ($debt->status !== 'pending_approval') {
                    return response()->json(['message' => 'Ushbu qarz kutilayotgan holatda emas.'], 400);
                }

                // If down payment exists, log it now
                if (floatval($debt->paid_amount) > 0) {
                    DebtPayment::create([
                        'debt_id' => $debt->id,
                        'amount' => $debt->paid_amount,
                        'payment_method' => 'cash',
                    ]);

                    // Add to cashier's active shift if shift is still active
                    if ($debt->shift_id) {
                        $shift = \App\Models\Shift::find($debt->shift_id);
                        if ($shift && $shift->status === 'active') {
                            $shift->generated_revenue = floatval($shift->generated_revenue) + floatval($debt->paid_amount);
                            $shift->save();
                        }
                    }
                }

                // Update status
                $debt->status = floatval($debt->paid_amount) >= floatval($debt->total_amount) ? 'paid' : 'pending';
                $debt->save();

                // Log Activity
                ActivityLog::create([
                    'user_id' => auth()->id(),
                    'user_name' => auth()->user()->name ?? 'Admin',
                    'action_type' => 'debt_approve',
                    'description' => "[Nasiya Tasdiqlash: {$debt->customer_name}] Admin tomonidan qarz shartnomasi tasdiqlandi. (Jami: \$" . number_format($debt->total_amount, 2) . ")",
                ]);

                return response()->json([
                    'message' => 'Nasiya muvaffaqiyatli tasdiqlandi',
                    'debt' => $debt
                ], 200);
            });
        } catch (\Exception $e) {
            return response()->json(['message' => 'Nasiyani tasdiqlashda xatolik: ' . $e->getMessage()], 400);
        }
    }

    /**
     * Admin Endpoint: Reject a pending debt.
     */
    public function reject(Request $request, $id)
    {
        $user = $request->user();
        if ($user->role !== 'admin') {
            return response()->json(['message' => 'Faqatgina admin qarzni rad etishi mumkin.'], 403);
        }

        $debt = Debt::findOrFail($id);
        if ($debt->status !== 'pending_approval') {
            return response()->json(['message' => 'Ushbu qarz kutilayotgan holatda emas.'], 400);
        }

        $debt->status = 'rejected';
        $debt->save();

        // Log Activity
        ActivityLog::create([
            'user_id' => auth()->id(),
            'user_name' => auth()->user()->name ?? 'Admin',
            'action_type' => 'debt_reject',
            'description' => "[Nasiya Rad etish: {$debt->customer_name}] Admin tomonidan qarz shartnomasi rad etildi. (Jami: \$" . number_format($debt->total_amount, 2) . ")",
        ]);

        return response()->json([
            'message' => 'Nasiya muvaffaqiyatli rad etildi',
            'debt' => $debt
        ], 200);
    }
}
