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
