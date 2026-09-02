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

        // Group sales by branch including all branches (even with 0 sales)
        $allBranches = \App\Models\Branch::all();
        $branchBreakdown = $allBranches->map(function ($b) {
            $userIds = \App\Models\User::where('branch_id', $b->id)->pluck('id');
            $shiftIds = Shift::whereIn('user_id', $userIds)->pluck('id');
            
            $totalSales = Sale::whereIn('shift_id', $shiftIds)->sum('total_price');
            $totalDevices = Sale::whereIn('shift_id', $shiftIds)->sum('quantity');
            $totalExpenses = Shift::whereIn('user_id', $userIds)->where('status', 'completed')->sum('calculated_wage');
            
            return [
                'branch_name' => $b->name,
                'total_sales' => (float)$totalSales,
                'total_expenses' => (float)$totalExpenses,
                'total_devices' => (int)$totalDevices
            ];
        });

        // Add main warehouse / headquarters if sales exist without a linked branch
        $nullBranchSales = Sale::whereNotExists(function ($query) {
            $query->select(\DB::raw(1))
                  ->from('shifts')
                  ->join('users', 'shifts.user_id', '=', 'users.id')
                  ->whereRaw('sales.shift_id = shifts.id')
                  ->whereNotNull('users.branch_id');
        });

        $nullBranchUserIds = \App\Models\User::whereNull('branch_id')->pluck('id');
        $nullBranchExpenses = Shift::whereIn('user_id', $nullBranchUserIds)->where('status', 'completed')->sum('calculated_wage');

        if ($nullBranchSales->count() > 0 || $nullBranchExpenses > 0) {
            $branchBreakdown->push([
                'branch_name' => 'Bosh qarorgoh / Ombor',
                'total_sales' => (float)$nullBranchSales->sum('total_price'),
                'total_expenses' => (float)$nullBranchExpenses,
                'total_devices' => (int)$nullBranchSales->sum('quantity')
            ]);
        }

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
                
                // Get all sales for this user's shifts
                $shiftIds = $userShifts->pluck('id');
                $totalDevices = Sale::whereIn('shift_id', $shiftIds)->sum('quantity');
                $recentSales = Sale::whereIn('shift_id', $shiftIds)
                    ->with('product')
                    ->orderBy('created_at', 'desc')
                    ->take(10)
                    ->get()
                    ->map(function ($s) {
                        return [
                            'product_name' => $s->product->name ?? 'O\'chirilgan mahsulot',
                            'model' => $s->product->model ?? '',
                            'quantity' => (int)$s->quantity,
                            'total_price' => (float)$s->total_price,
                            'time' => $s->created_at->toIso8601String()
                        ];
                    });
                
                return [
                    'id' => $u->id,
                    'name' => $u->name,
                    'role' => $u->role,
                    'email' => $u->email,
                    'total_revenue' => (float)$totalRevenue,
                    'total_wage' => (float)$totalWage,
                    'total_hours' => round($totalMinutes / 60.0, 1),
                    'total_devices' => (int)$totalDevices,
                    'status' => $hasActiveShift ? 'active' : 'inactive',
                    'recent_sales' => $recentSales
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
     * Get Current Shift for the authenticated user (Cashier).
     */
    public function getCurrentShift(Request $request)
    {
        $user = $request->user();
        if (!$user) {
            return response()->json(['message' => 'Avtorizatsiyadan o\'tilmagan'], 401);
        }

        $activeShift = Shift::with(['user.branch', 'sales'])
            ->where('user_id', $user->id)
            ->where('status', 'active')
            ->first();

        // If cashier is logged in but has no active shift, auto initialize one
        if (!$activeShift && $user->role === 'cashier') {
            $activeShift = $this->initializeCashierShift($user);
        }

        if (!$activeShift) {
            return response()->json([
                'active' => false,
                'shift' => null,
                'user' => [
                    'id' => $user->id,
                    'name' => $user->name,
                    'role' => $user->role
                ]
            ], 200);
        }

        // Live revenue and sales count for this shift
        $revenue = Sale::where('shift_id', $activeShift->id)->sum('total_price');
        $salesCount = Sale::where('shift_id', $activeShift->id)->count();

        // Calculate live elapsed seconds
        $elapsedSeconds = abs(Carbon::now()->diffInSeconds($activeShift->start_time));

        return response()->json([
            'active' => true,
            'shift' => [
                'id' => $activeShift->id,
                'start_time' => $activeShift->start_time->toIso8601String(),
                'elapsed_seconds' => $elapsedSeconds,
                'shift_type' => $activeShift->shift_type,
                'status' => $activeShift->status,
                'generated_revenue' => (float)$revenue,
                'sales_count' => (int)$salesCount,
            ],
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'role' => $user->role,
                'branch' => $user->branch ? $user->branch->name : 'Biriktirilmagan'
            ]
        ], 200);
    }

    /**
     * Cashier Endpoint: End current active shift and logout.
     */
    public function endCurrentShift(Request $request)
    {
        $user = $request->user();
        if (!$user) {
            return response()->json(['message' => 'Foydalanuvchi aniqlanmadi'], 401);
        }

        $shift = Shift::where('user_id', $user->id)->where('status', 'active')->first();
        if (!$shift) {
            return response()->json(['message' => 'Faol navbatchilik topilmadi'], 404);
        }

        $shift->end_time = Carbon::now();
        $shift->status = 'completed';

        // Calculate final revenue
        $revenue = Sale::where('shift_id', $shift->id)->sum('total_price');
        $salesCount = Sale::where('shift_id', $shift->id)->count();
        $shift->generated_revenue = $revenue;

        // Calculate duration & wages
        $durationMinutes = $shift->start_time->diffInMinutes($shift->end_time);
        $hours = $durationMinutes / 60.0;
        $settingsList = \App\Models\Setting::all()->pluck('value', 'key');
        $hourlyRateSetting = $settingsList['salary_rules']['hourly_rate'] ?? 15;
        $nightMultiplierSetting = $settingsList['salary_rules']['night_shift_multiplier'] ?? 1.5;
        
        $baseRate = ($user->wage_structure > 0) ? $user->wage_structure : $hourlyRateSetting;
        $multiplier = ($shift->shift_type === 'night') ? $nightMultiplierSetting : 1.0;
        $shift->calculated_wage = $hours * $baseRate * $multiplier;
        $shift->save();

        // Format duration readable
        $hoursPart = floor($durationMinutes / 60);
        $minutesPart = $durationMinutes % 60;
        $durationText = ($hoursPart > 0 ? "{$hoursPart} soat " : "") . "{$minutesPart} daqiqa";

        // Log activity
        \App\Models\ActivityLog::create([
            'user_id' => $user->id,
            'user_name' => $user->name,
            'action_type' => 'shift_end',
            'description' => "Navbatchilik yakunlandi: {$user->name} (Ishlagan vaqti: {$durationText}, Jami savdo: $" . number_format($revenue, 2) . ")",
        ]);

        // Send telemetry event to Node.js
        $this->sendTelemetry('shift:ended', [
            'shift_id' => $shift->id,
            'user_id' => $user->id,
            'user_name' => $user->name,
            'shift_type' => $shift->shift_type,
            'start_time' => $shift->start_time->toIso8601String(),
            'end_time' => $shift->end_time->toIso8601String(),
            'revenue' => $revenue,
            'sales_count' => $salesCount,
            'duration' => $durationText,
            'wage' => $shift->calculated_wage
        ]);

        return response()->json([
            'message' => 'Navbatchilik muvaffaqiyatli yakunlandi',
            'summary' => [
                'shift_id' => $shift->id,
                'cashier_name' => $user->name,
                'start_time' => $shift->start_time->toIso8601String(),
                'end_time' => $shift->end_time->toIso8601String(),
                'duration' => $durationText,
                'total_revenue' => (float)$revenue,
                'sales_count' => $salesCount,
                'calculated_wage' => (float)$shift->calculated_wage
            ]
        ], 200);
    }

    /**
     * Admin Endpoint: Detailed Staff Work Hours & Shift History Tracker.
     */
    public function getStaffWorkHours()
    {
        // 1. Live Active Sessions
        $activeShifts = Shift::with(['user.branch', 'sales'])
            ->where('status', 'active')
            ->get()
            ->map(function ($s) {
                $revenue = Sale::where('shift_id', $s->id)->sum('total_price');
                $salesCount = Sale::where('shift_id', $s->id)->count();
                $elapsedSeconds = abs(Carbon::now()->diffInSeconds($s->start_time));
                
                return [
                    'shift_id' => $s->id,
                    'user_id' => $s->user_id,
                    'user_name' => $s->user->name ?? 'Kassir',
                    'user_email' => $s->user->email ?? '',
                    'branch_name' => $s->user && $s->user->branch ? $s->user->branch->name : 'Bosh do\'kon',
                    'shift_type' => $s->shift_type,
                    'start_time' => $s->start_time->toIso8601String(),
                    'elapsed_seconds' => $elapsedSeconds,
                    'revenue' => (float)$revenue,
                    'sales_count' => (int)$salesCount,
                    'status' => 'online'
                ];
            });

        // 2. All Cashiers with Online / Offline Status
        $allStaff = User::whereIn('role', ['cashier', 'admin'])
            ->with('branch')
            ->get()
            ->map(function ($u) {
                $active = Shift::where('user_id', $u->id)->where('status', 'active')->first();
                $todayShifts = Shift::where('user_id', $u->id)
                    ->whereDate('created_at', Carbon::today())
                    ->get();

                $todayRevenue = Sale::whereIn('shift_id', $todayShifts->pluck('id'))->sum('total_price');
                $todaySalesCount = Sale::whereIn('shift_id', $todayShifts->pluck('id'))->count();
                
                $todayMinutes = $todayShifts->reduce(function ($carry, $s) {
                    $endTime = $s->end_time ?: Carbon::now();
                    return $carry + $s->start_time->diffInMinutes($endTime);
                }, 0);

                return [
                    'id' => $u->id,
                    'name' => $u->name,
                    'email' => $u->email,
                    'role' => $u->role,
                    'branch_name' => $u->branch ? $u->branch->name : 'Biriktirilmagan',
                    'is_online' => (bool)$active,
                    'active_shift_id' => $active ? $active->id : null,
                    'active_since' => $active ? $active->start_time->toIso8601String() : null,
                    'today_revenue' => (float)$todayRevenue,
                    'today_sales_count' => (int)$todaySalesCount,
                    'today_hours' => round($todayMinutes / 60.0, 1),
                    'wage_rate' => (float)$u->wage_structure
                ];
            });

        // 3. Shift History Logs (Last 50 shifts)
        $history = Shift::with(['user.branch'])
            ->orderBy('created_at', 'desc')
            ->take(50)
            ->get()
            ->map(function ($s) {
                $durationMin = $s->end_time ? $s->start_time->diffInMinutes($s->end_time) : $s->start_time->diffInMinutes(Carbon::now());
                $hours = floor($durationMin / 60);
                $mins = $durationMin % 60;
                $durationStr = ($hours > 0 ? "{$hours}s " : "") . "{$mins}d";

                return [
                    'id' => $s->id,
                    'user_name' => $s->user->name ?? 'O\'chirilgan xodim',
                    'branch_name' => $s->user && $s->user->branch ? $s->user->branch->name : 'Bosh do\'kon',
                    'shift_type' => $s->shift_type,
                    'status' => $s->status,
                    'start_time' => $s->start_time->toIso8601String(),
                    'end_time' => $s->end_time ? $s->end_time->toIso8601String() : null,
                    'duration' => $durationStr,
                    'duration_minutes' => $durationMin,
                    'revenue' => (float)$s->generated_revenue,
                    'calculated_wage' => (float)$s->calculated_wage
                ];
            });

        // 4. Overall Today Summary
        $todayShifts = Shift::whereDate('created_at', Carbon::today())->get();
        $todayRevenue = Sale::whereDate('created_at', Carbon::today())->sum('total_price');
        $todaySalesCount = Sale::whereDate('created_at', Carbon::today())->count();

        return response()->json([
            'active_sessions' => $activeShifts,
            'all_staff' => $allStaff,
            'history' => $history,
            'today_summary' => [
                'active_cashiers' => $activeShifts->count(),
                'total_revenue_today' => (float)$todayRevenue,
                'total_sales_today' => (int)$todaySalesCount,
                'total_shifts_today' => $todayShifts->count()
            ]
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
