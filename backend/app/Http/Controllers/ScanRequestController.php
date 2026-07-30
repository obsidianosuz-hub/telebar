<?php

namespace App\Http\Controllers;

use App\Models\ScanRequest;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class ScanRequestController extends Controller
{
    /**
     * List all pending scan requests.
     */
    public function index()
    {
        $requests = ScanRequest::with('branch')
            ->where('status', 'pending')
            ->orderBy('created_at', 'desc')
            ->get();

        return response()->json($requests, 200);
    }

    /**
     * Store a new scan request from the mobile device.
     */
    public function store(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'qr_code' => 'required|string|max:255',
            'branch_id' => 'nullable|uuid|exists:branches,id'
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $scanRequest = ScanRequest::create([
            'qr_code' => $request->qr_code,
            'branch_id' => $request->branch_id,
            'status' => 'pending'
        ]);

        // Log activity
        \App\Models\ActivityLog::create([
            'user_id' => $request->user()->id ?? null,
            'user_name' => $request->user()->name ?? 'Mobil Skaner',
            'action_type' => 'scan_request',
            'description' => "Yangi shtrix-kod skanerlandi: {$scanRequest->qr_code} (Omborga kiritish arizasi)",
        ]);

        // Broadcast to websocket
        $this->notifyScanEvent('scan:created', [
            'id' => $scanRequest->id,
            'qr_code' => $scanRequest->qr_code,
            'branch_id' => $scanRequest->branch_id,
            'status' => $scanRequest->status,
            'created_at' => $scanRequest->created_at->toISOString()
        ]);

        return response()->json([
            'message' => 'Skanerlash arizasi omborga yuborildi',
            'scan_request' => $scanRequest
        ], 201);
    }

    /**
     * Update the status of a scan request (approve/reject).
     */
    public function update(Request $request, $id)
    {
        $scanRequest = ScanRequest::find($id);
        if (!$scanRequest) {
            return response()->json(['message' => 'Ariza topilmadi'], 404);
        }

        $validator = Validator::make($request->all(), [
            'status' => 'required|string|in:approved,rejected'
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $scanRequest->status = $request->status;
        $scanRequest->save();

        // Log activity
        \App\Models\ActivityLog::create([
            'user_id' => $request->user()->id ?? null,
            'user_name' => $request->user()->name ?? 'Tizim',
            'action_type' => 'scan_update',
            'description' => "Skanerlash arizasi ko'rib chiqildi: {$scanRequest->qr_code} (" . ($scanRequest->status === 'approved' ? 'Tasdiqlandi' : 'Rad etildi') . ")",
        ]);

        // Broadcast to websocket
        if ($scanRequest->status === 'approved') {
            $this->notifyScanEvent('scan:approved', [
                'id' => $scanRequest->id,
                'qr_code' => $scanRequest->qr_code,
                'status' => $scanRequest->status
            ]);
        }

        return response()->json([
            'message' => 'Ariza holati yangilandi',
            'scan_request' => $scanRequest
        ], 200);
    }

    /**
     * Delete/remove a scan request.
     */
    public function destroy($id)
    {
        $scanRequest = ScanRequest::find($id);
        if (!$scanRequest) {
            return response()->json(['message' => 'Ariza topilmadi'], 404);
        }

        $qr_code = $scanRequest->qr_code;
        $scanRequest->delete();

        // Broadcast to websocket to clear the request
        $this->notifyScanEvent('scan:approved', [
            'id' => $id,
            'qr_code' => $qr_code,
            'status' => 'cleared'
        ]);

        return response()->json([
            'message' => 'Skanerlash arizasi o\'chirildi'
        ], 200);
    }

    /**
     * Send WebSocket webhook to Node.js when scan events occur.
     */
    protected function notifyScanEvent($event, $data)
    {
        $url = env('REALTIME_SERVER_URL', 'http://localhost:3000') . '/api/telemetry';
        
        try {
            $ch = curl_init($url);
            $payload = json_encode([
                'event' => $event,
                'data' => $data
            ]);

            curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
            curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_TIMEOUT, 2);
            curl_exec($ch);
            curl_close($ch);
        } catch (\Exception $e) {
            // Ignore offline Socket.io server
        }
    }
}
