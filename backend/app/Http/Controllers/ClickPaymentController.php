<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use App\Models\Setting;

class ClickPaymentController extends Controller
{
    /**
     * Handle incoming Click.uz Webhook requests (Prepare & Complete).
     */
    public function handleWebhook(Request $request)
    {
        $clickTransId = $request->input('click_trans_id');
        $serviceId = $request->input('service_id');
        $merchantTransId = $request->input('merchant_trans_id');
        $merchantPrepareId = $request->input('merchant_prepare_id');
        $amount = $request->input('amount');
        $action = $request->input('action');
        $error = $request->input('error');
        $signTime = $request->input('sign_time');
        $signString = $request->input('sign_string');

        Log::info("Click Webhook Received: Action {$action}, Trans {$clickTransId}, Amount {$amount}");

        // Load Click Config from Settings table to retrieve Secret Key
        $setting = Setting::where('key', 'click_config')->first();
        $clickConfig = $setting ? $setting->value : null;
        $secretKey = $clickConfig['secret_key'] ?? '';

        // Only enforce signature check if Click integration is active and a secret key is defined
        $enforceSignature = isset($clickConfig['active']) && $clickConfig['active'] && !empty($secretKey);

        if ($enforceSignature) {
            // Verify Click Signature
            // For action = 0 (Prepare): md5(click_trans_id + service_id + secret_key + merchant_trans_id + amount + action + sign_time)
            // For action = 1 (Complete): md5(click_trans_id + service_id + secret_key + merchant_trans_id + merchant_prepare_id + amount + action + sign_time)
            if ($action == 0) {
                $mySign = md5($clickTransId . $serviceId . $secretKey . $merchantTransId . $amount . $action . $signTime);
            } else {
                $mySign = md5($clickTransId . $serviceId . $secretKey . $merchantTransId . $merchantPrepareId . $amount . $action . $signTime);
            }

            if ($mySign !== $signString) {
                Log::warning("Click Webhook Signature Mismatch! Expected: {$mySign}, Got: {$signString}");
                return response()->json([
                    'error' => -1,
                    'error_note' => 'Signature Mismatch'
                ], 400);
            }
        }

        // Dispatch telemetry event when payment is completed (action = 1)
        if ($action == 1) {
            // Process dynamic repayment if transaction param starts with 'debt_repay_'
            if (str_starts_with($merchantTransId, 'debt_repay_')) {
                $debtId = str_replace('debt_repay_', '', $merchantTransId);
                $d = \App\Models\Debt::find($debtId);
                if ($d) {
                    $d->paid_amount = floatval($d->paid_amount) + floatval($amount);
                    if ($d->paid_amount >= $d->total_amount) {
                        $d->status = 'paid';
                    }
                    $d->save();

                    // Create repayment transaction record
                    \App\Models\DebtPayment::create([
                        'debt_id' => $d->id,
                        'amount' => $amount,
                        'payment_method' => 'click',
                    ]);

                    // Log Activity
                    \App\Models\ActivityLog::create([
                        'user_id' => null,
                        'user_name' => 'Click.uz (Tizim)',
                        'action_type' => 'repayment',
                        'description' => "[Nasiya To'lovi (Click): {$d->customer_name}] \$" . number_format($amount, 2) . " miqdorida qarz to'lovi qabul qilindi. (Qoldiq: \$" . number_format($d->total_amount - $d->paid_amount, 2) . ")",
                    ]);

                    Log::info("Click Repayment Successful for Debt ID: {$debtId}, Repayed: {$amount}");
                }
            }

            $url = env('REALTIME_SERVER_URL', 'http://localhost:3001') . '/api/telemetry';
            try {
                $ch = curl_init($url);
                $payload = json_encode([
                    'event' => 'click:paid',
                    'data' => [
                        'merchant_trans_id' => $merchantTransId,
                        'amount' => $amount,
                        'click_trans_id' => $clickTransId
                    ]
                ]);
                curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
                curl_setopt($ch, CURLOPT_HTTPHEADER, array('Content-Type:application/json'));
                curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
                curl_exec($ch);
                curl_close($ch);
            } catch (\Exception $e) {
                Log::error("Failed to send Click payment telemetry: " . $e->getMessage());
            }
        }

        // Standard Click merchant response protocol
        return response()->json([
            'click_trans_id' => $clickTransId,
            'merchant_trans_id' => $merchantTransId,
            'merchant_prepare_id' => $merchantPrepareId ?: time(),
            'error' => 0,
            'error_note' => 'Success'
        ], 200);
    }
}
