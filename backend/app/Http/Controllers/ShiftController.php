<?php

namespace App\Http\Controllers;

use App\Models\Shift;
use App\Models\User;
use App\Models\Sale;
use Illuminate\Http\Request;
use Carbon\Carbon;

class ShiftController extends Controller
{
    /**
     * Terminate all active shifts.
     */
    public function terminateActiveShifts()
    {
        $settingsList = \App\Models\Setting::all()->pluck('value', 'key');
        $hourlyRateSetting = $settingsList['salary_rules']['hourly_rate'] ?? 15000;
        $nightMultiplierSetting = $settingsList['salary_rules']['night_shift_multiplier'] ?? 1.5;

        $activeShifts = Shift::with('user')->where('status', 'active')->get();

        foreach ($activeShifts as $shift) {
            $shift->end_time = Carbon::now();
            $shift->status = 'completed';
            
            // Calculate final revenue generated
            $revenue = Sale::where('shift_id', $shift->id)->sum('total_price');
            $shift->generated_revenue = $revenue;

            // Calculate duration in hours/minutes
            $durationMinutes = $shift->start_time->diffInMinutes($shift->end_time);
            $hours = $durationMinutes / 60.0;

            // Get base hourly rate
            $user = $shift->user;
            $baseRate = ($user && $user->wage_structure > 0) ? $user->wage_structure : $hourlyRateSetting;
            $multiplier = ($shift->shift_type === 'night') ? $nightMultiplierSetting : 1.0;

            $shift->calculated_wage = $hours * $baseRate * $multiplier;
            $shift->save();

            // Log activity
            \App\Models\ActivityLog::create([
                'user_id' => $shift->user_id,
                'user_name' => $shift->user->name ?? 'Kassir',
                'action_type' => 'shift_end',
                'description' => "Navbatchilik yakunlandi: " . ($shift->user->name ?? 'Kassir') . " (Kassa tushumi: \$" . number_format($revenue, 2) . ")",
            ]);

            // Send telemetry event to Node.js
            $this->sendTelemetry('shift:completed', [
                'shift_id' => $shift->id,
                'user_id' => $shift->user_id,
                'user_name' => $shift->user->name ?? 'Kassir',
                'shift_type' => $shift->shift_type,
                'start_time' => $shift->start_time->toIso8601String(),
                'end_time' => $shift->end_time->toIso8601String(),
                'revenue' => $shift->generated_revenue,
                'wage' => $shift->calculated_wage,
                'duration_minutes' => $durationMinutes
            ]);
        }
    }

    /**
     * Initialize a shift for an incoming cashier.
     */
    public function initializeCashierShift(User $user)
    {
        // 1. Terminate preceding worker's shift
        $this->terminateActiveShifts();

        // 2. Determine shift type based on settings and current time
        $settingsList = \App\Models\Setting::all()->pluck('value', 'key');
        $dayStart = $settingsList['shift_timings']['day_start'] ?? 8;
        $dayEnd = $settingsList['shift_timings']['day_end'] ?? 20;

        $hour = Carbon::now()->hour;
        if ($dayStart < $dayEnd) {
            $shiftType = ($hour >= $dayStart && $hour < $dayEnd) ? 'day' : 'night';
        } else {
            $shiftType = ($hour >= $dayStart || $hour < $dayEnd) ? 'day' : 'night';
        }

        // 3. Create new shift record
        $shift = Shift::create([
            'user_id' => $user->id,
            'shift_type' => $shiftType,
            'start_time' => Carbon::now(),
            'generated_revenue' => 0.00,
            'calculated_wage' => 0.00,
            'status' => 'active'
        ]);

        // Log activity
        \App\Models\ActivityLog::create([
            'user_id' => $user->id,
            'user_name' => $user->name,
            'action_type' => 'shift_start',
            'description' => "Yangi navbatchilik boshlandi: {$user->name} (" . ($shift->shift_type === 'day' ? 'Kunduzgi' : 'Tungi') . " navbatchilik)",
        ]);

        // 4. Send telemetry event to Node.js
        $this->sendTelemetry('shift:started', [
            'shift_id' => $shift->id,
            'user_id' => $user->id,
            'user_name' => $user->name,
            'shift_type' => $shift->shift_type,
            'start_time' => $shift->start_time->toIso8601String(),
            'status' => $shift->status
        ]);

        return $shift;
    }

    /**
     * Admin Endpoint: Get current shift status and history logs.
     */
    public function index()
    {
        $activeShift = Shift::with('user')->where('status', 'active')->first();
        $history = Shift::with('user')->orderBy('created_at', 'desc')->take(20)->get();

        return response()->json([
            'active_shift' => $activeShift,
            'history' => $history
        ], 200);
    }

    /**
     * Admin Endpoint: Get financial and operational analytics.
     */
    public function getAnalytics()
    {
        $totalRevenue = Sale::sum('total_price');
        $totalExpenses = Shift::where('status', 'completed')->sum('calculated_wage');
        
        // Inventory valuation = sum of (quantity * purchase_price)
        $inventoryValuation = \App\Models\Product::sum(\DB::raw('quantity * purchase_price'));
        
        // Dynamic shift cards summary
        $dayShiftRevenue = Shift::where('shift_type', 'day')->sum('generated_revenue');
        $nightShiftRevenue = Shift::where('shift_type', 'night')->sum('generated_revenue');

        // Recent shift transition logs
        $transitions = Shift::with('user')
            ->orderBy('updated_at', 'desc')
            ->take(10)
            ->get()
            ->map(function ($s) {
                return [
                    'id' => $s->id,
                    'cashier' => $s->user->name ?? 'O\'chirilgan xodim',
                    'type' => $s->shift_type,
                    'status' => $s->status,
                    'duration' => $s->end_time ? $s->start_time->diffForHumans($s->end_time, true) : 'Davom etmoqda',
                    'revenue' => $s->generated_revenue,
                    'wage' => $s->calculated_wage,
                    'time' => $s->created_at->toIso8601String()
                ];
            });

        // Group sales by branch
        $branchBreakdown = \DB::table('sales')
            ->join('shifts', 'sales.shift_id', '=', 'shifts.id')
            ->join('users', 'shifts.user_id', '=', 'users.id')
            ->leftJoin('branches', 'users.branch_id', '=', 'branches.id')
            ->select('branches.name as branch_name', \DB::raw('SUM(sales.total_price) as total_sales'), \DB::raw('COUNT(sales.id) as total_devices'))
            ->groupBy('branches.name')
            ->get()
            ->map(function ($b) {
                return [
                    'branch_name' => $b->branch_name ?? 'Asosiy Omborxona / Boshqa',
                    'total_sales' => (float)$b->total_sales,
                    'total_devices' => (int)$b->total_devices
                ];
            });

        // Group transitions and metrics by employee
        $staffStats = User::whereIn('role', ['cashier', 'admin'])
            ->get()
            ->map(function ($u) {
                // Get all shifts of this user
                $userShifts = Shift::where('user_id', $u->id)->get();
                $totalWage = $userShifts->where('status', 'completed')->sum('calculated_wage');
                $totalRevenue = $userShifts->sum('generated_revenue');
                
                $totalMinutes = $userShifts->reduce(function ($carry, $s) {
                    if ($s->end_time) {
                        return $carry + $s->start_time->diffInMinutes($s->end_time);
                    }
                    return $carry;
                }, 0);
                
                $hasActiveShift = $userShifts->where('status', 'active')->first();
                
                return [
                    'id' => $u->id,
                    'name' => $u->name,
                    'role' => $u->role,
                    'email' => $u->email,
                    'total_revenue' => (float)$totalRevenue,
                    'total_wage' => (float)$totalWage,
                    'total_hours' => round($totalMinutes / 60.0, 1),
                    'status' => $hasActiveShift ? 'active' : 'inactive',
                ];
            });

        return response()->json([
            'total_revenue' => $totalRevenue,
            'total_expenses' => $totalExpenses,
            'inventory_valuation' => $inventoryValuation,
            'day_shift_revenue' => $dayShiftRevenue,
            'night_shift_revenue' => $nightShiftRevenue,
            'transitions' => $transitions,
            'branch_breakdown' => $branchBreakdown,
            'staff_stats' => $staffStats
        ], 200);
    }

    /**
     * Send HTTP POST Telemetry package to the Node.js service.
     */
    protected function sendTelemetry($event, $data)
    {
        $url = env('REALTIME_SERVER_URL', 'http://localhost:3000') . '/api/telemetry';
        
        try {
            $ch = curl_init($url);
            $payload = json_encode([
                'event' => $event,
                'data' => $data
            ]);

            curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
            curl_setopt($ch, CURLOPT_HTTPHEADER, [
                'Content-Type: application/json',
                'Accept: application/json'
            ]);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_TIMEOUT, 3);
            
            curl_exec($ch);
            curl_close($ch);
        } catch (\Exception $e) {
            // Silence connection errors if local realtime node is booting
        }
    }
}
