<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

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
        $amount = $request->input('amount');
        $action = $request->input('action');
        $error = $request->input('error');
        $signString = $request->input('sign_string');

        Log::info("Click Webhook Received: Action {$action}, Trans {$clickTransId}, Amount {$amount}");

        // Dispatch telemetry event when payment is completed (action = 1)
        if ($action == 1) {
            $url = env('REALTIME_SERVER_URL', 'http://localhost:3000') . '/api/telemetry';
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
            'merchant_prepare_id' => time(),
            'error' => 0,
            'error_note' => 'Success'
        ], 200);
    }
}
