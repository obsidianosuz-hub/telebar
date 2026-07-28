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

        // Broadcast to websocket if needed
        // (Optional node.js event dispatch could be added here)

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

        $scanRequest->delete();

        return response()->json([
            'message' => 'Skanerlash arizasi o\'chirildi'
        ], 200);
    }
}
