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
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        // Get current active shift
        $activeShift = Shift::where('status', 'active')->first();
        if (!$activeShift) {
            return response()->json([
                'message' => 'Sotuvni amalga oshirish taqiqlangan. Tizimda faol navbatchilik yo\'q. Iltimos PIN kod orqali kiring.'
            ], 403);
        }

        $salesInvoice = [];
        $grandTotal = 0.00;

        // Perform transaction to ensure data integrity
        try {
            DB::transaction(function () use ($request, $activeShift, &$salesInvoice, &$grandTotal) {
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

                // Increment shift specific revenue ledger
                $activeShift->generated_revenue += $grandTotal;
                $activeShift->save();

                // Log activity
                $itemNames = collect($salesInvoice)->map(function($i) {
                    return $i['product_name'] . ' x ' . $i['quantity'];
                })->join(', ');
                
                \App\Models\ActivityLog::create([
                    'user_id' => $request->user()->id ?? null,
                    'user_name' => $request->user()->name ?? 'Tizim',
                    'action_type' => 'sale',
                    'description' => "Sotuv amalga oshirildi: {$itemNames} (Jami: \$" . number_format($grandTotal, 2) . ")",
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
        $sales = Sale::with(['product', 'shift.user'])
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
                    'time' => $s->timestamp ? $s->timestamp->toIso8601String() : $s->created_at->toIso8601String()
                ];
            });

        return response()->json($sales, 200);
    }
}
