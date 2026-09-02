<?php

namespace App\Http\Controllers;

use App\Models\Product;
use App\Models\Sale;
use App\Models\Shift;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;

class SaleController extends Controller
{
    /**
     * POS Checkout Workflow.
     */
    public function checkout(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'cart' => 'required|array|min:1',
            'cart.*.product_id' => 'required|uuid|exists:products,id',
            'cart.*.quantity' => 'required|integer|min:1',
            'payment_method' => 'sometimes|string|in:cash,click,debt',
            'debt_details' => 'required_if:payment_method,debt|array',
            'debt_details.customer_name' => 'required_if:payment_method,debt|string|max:255',
            'debt_details.customer_phone' => 'required_if:payment_method,debt|string|max:50',
            'debt_details.paid_amount' => 'nullable|numeric|min:0',
            'debt_details.due_date' => 'nullable|date',
            'debt_details.passport_series_number' => 'required_if:payment_method,debt|string|max:30',
            'debt_details.passport_pinfl' => 'nullable|string|size:14',
            'debt_details.customer_address' => 'required_if:payment_method,debt|string|max:1000',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        // Get current active shift for this specific cashier user
        $activeShift = Shift::where('user_id', $request->user()->id)->where('status', 'active')->first();
        if (!$activeShift) {
            return response()->json([
                'message' => 'Sotuvni amalga oshirish taqiqlangan. Sizda faol navbatchilik yo\'q. Iltimos PIN kod orqali kiring.'
            ], 403);
        }

        $salesInvoice = [];
        $grandTotal = 0.00;

        // Perform transaction to ensure data integrity
        try {
            DB::transaction(function () use ($request, $activeShift, &$salesInvoice, &$grandTotal) {
                $paymentMethod = $request->input('payment_method', 'cash');
                $paymentStatus = $paymentMethod === 'debt' ? 'pending_debt' : 'paid';

                foreach ($request->cart as $item) {
                    // Lock the row for update to prevent race conditions in stock check
                    $product = Product::lockForUpdate()->find($item['product_id']);

                    // Verify stock availability
                    if ($product->quantity < $item['quantity']) {
                        throw new \Exception("Omborda yetarli mahsulot yo'q: {$product->model_name} (Mavjud: {$product->quantity} dona)");
                    }

                    // Decrement stock levels
                    $product->quantity -= $item['quantity'];
                    $product->save();

                    // Calculate pricing
                    $itemTotal = $product->retail_price * $item['quantity'];
                    $grandTotal += $itemTotal;

                    // Create sale record
                    $sale = Sale::create([
                        'shift_id' => $activeShift->id,
                        'product_id' => $product->id,
                        'quantity' => $item['quantity'],
                        'total_price' => $itemTotal,
                        'payment_method' => $paymentMethod,
                        'payment_status' => $paymentStatus,
                        'timestamp' => now()
                    ]);

                    $salesInvoice[] = [
                        'sale_id' => $sale->id,
                        'product_name' => $product->model_name,
                        'qr_code' => $product->qr_code,
                        'quantity' => $item['quantity'],
                        'retail_price' => $product->retail_price,
                        'total_price' => $itemTotal
                    ];
                }

                // If payment method is debt, create the Debt record
                $actualRevenueGenerated = $grandTotal;
                if ($paymentMethod === 'debt') {
                    $debtDetails = $request->input('debt_details');
                    $paidAmount = floatval($debtDetails['paid_amount'] ?? 0.00);
                    $actualRevenueGenerated = 0.00; // Defer down payment revenue until Admin approval

                    $debt = \App\Models\Debt::create([
                        'sale_id' => $salesInvoice[0]['sale_id'], // Link to the first sale item
                        'customer_name' => $debtDetails['customer_name'],
                        'customer_phone' => $debtDetails['customer_phone'],
                        'total_amount' => $grandTotal,
                        'paid_amount' => $paidAmount,
                        'due_date' => $debtDetails['due_date'] ?? null,
                        'status' => 'pending_approval', // Sets status to pending_approval
                        'passport_series_number' => $debtDetails['passport_series_number'] ?? null,
                        'passport_pinfl' => $debtDetails['passport_pinfl'] ?? null,
                        'customer_address' => $debtDetails['customer_address'] ?? null,
                        'branch_id' => $request->user()->branch_id ?? null,
                        'user_id' => $request->user()->id ?? null,
                        'shift_id' => $activeShift->id ?? null,
                    ]);
                }

                // Increment shift specific revenue ledger by actual payment received
                $activeShift->generated_revenue += $actualRevenueGenerated;
                $activeShift->save();

                // Log activity
                $itemNames = collect($salesInvoice)->map(function($i) {
                    return $i['product_name'] . ' x ' . $i['quantity'];
                })->join(', ');
                
                $logDescription = "[Sotuv: {$itemNames}] Sotuv amalga oshirildi (Uslub: " . strtoupper($paymentMethod) . ", Jami: \$" . number_format($grandTotal, 2) . ")";
                if ($paymentMethod === 'debt') {
                    $logDescription .= " (Boshlang'ich to'lov: \$" . number_format($actualRevenueGenerated, 2) . ")";
                }

                \App\Models\ActivityLog::create([
                    'user_id' => $request->user()->id ?? null,
                    'user_name' => ($request->user()->name ?? 'Tizim') . ($request->user() ? ' (' . $request->user()->role . ')' : ''),
                    'action_type' => 'sale',
                    'description' => $logDescription,
                ]);
            });

            // Send real-time telemetry updates to Admin Dashboard via Node.js
            $this->emitSaleTelemetry($activeShift, $grandTotal, $salesInvoice);

            return response()->json([
                'message' => 'Sotuv muvaffaqiyatli yakunlandi',
                'invoice' => [
                    'shift_id' => $activeShift->id,
                    'cashier' => $activeShift->user->name ?? 'Kassir',
                    'items' => $salesInvoice,
                    'grand_total' => $grandTotal,
                    'timestamp' => now()->toIso8601String()
                ]
            ], 200);

        } catch (\Exception $e) {
            return response()->json([
                'message' => $e->getMessage()
            ], 400);
        }
    }

    /**
     * Send Sale event packet to the Node.js real-time service.
     */
    protected function emitSaleTelemetry(Shift $shift, $saleTotal, $items)
    {
        $url = env('REALTIME_SERVER_URL', 'http://localhost:3000') . '/api/telemetry';

        try {
            $ch = curl_init($url);
            $payload = json_encode([
                'event' => 'sale:created',
                'data' => [
                    'shift_id' => $shift->id,
                    'cashier_name' => $shift->user->name ?? 'Kassir',
                    'sale_total' => $saleTotal,
                    'shift_total_revenue' => $shift->generated_revenue,
                    'items' => $items,
                    'timestamp' => now()->toIso8601String()
                ]
            ]);

            curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
            curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_TIMEOUT, 2);
            curl_exec($ch);
            curl_close($ch);
        } catch (\Exception $e) {
            // Silence connection errors
        }
    }

    /**
     * Admin Endpoint: Get sales history.
     */
    public function history()
    {
        $sales = Sale::with(['product.branch', 'shift.user.branch', 'debt'])
            ->orderBy('created_at', 'desc')
            ->get()
            ->map(function ($s) {
                return [
                    'id' => $s->id,
                    'product_name' => $s->product->model_name ?? 'O\'chirilgan mahsulot',
                    'qr_code' => $s->product->qr_code ?? 'N/A',
                    'specifications' => $s->product->specifications ?? [],
                    'quantity' => $s->quantity,
                    'retail_price' => $s->product->retail_price ?? 0.00,
                    'total_price' => $s->total_price,
                    'cashier' => $s->shift->user->name ?? 'Kassir',
                    'cashier_role' => $s->shift->user->role ?? 'cashier',
                    'branch_name' => $s->product->branch->name ?? ($s->shift->user->branch->name ?? 'Asosiy Ofis'),
                    'payment_method' => $s->payment_method ?? 'cash',
                    'payment_status' => $s->payment_status ?? 'paid',
                    'debt_id' => $s->debt->id ?? null,
                    'time' => $s->timestamp ? $s->timestamp->toIso8601String() : $s->created_at->toIso8601String()
                ];
            });

        return response()->json($sales, 200);
    }
}
