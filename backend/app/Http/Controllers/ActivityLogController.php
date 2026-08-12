<?php

namespace App\Http\Controllers;

use App\Models\ActivityLog;
use Illuminate\Http\Request;

class ActivityLogController extends Controller
{
    /**
     * Display a listing of activities.
     */
    public function index(Request $request)
    {
        // Only admins can view the activity audit logs
        if ($request->user() && $request->user()->role !== 'admin') {
            return response()->json(['message' => 'Ruxsat etilmagan'], 403);
        }

        $logs = ActivityLog::orderBy('created_at', 'desc')->take(100)->get();

        return response()->json($logs, 200);
    }
}
