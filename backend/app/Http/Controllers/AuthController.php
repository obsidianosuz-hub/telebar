<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;

class AuthController extends Controller
{
    /**
     * Login step 1: Verify Email and Password.
     */
    public function login(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'email' => 'required|email',
            'password' => 'required|string',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $user = User::where('email', $request->email)->first();

        if (!$user || !Hash::check($request->password, $user->password)) {
            return response()->json(['message' => 'Email yoki parol noto\'g\'ri'], 401);
        }

        // If the user is an admin, they can login immediately.
        // If they are a cashier, they need to verify their PIN code next.
        if ($user->role === 'admin') {
            $token = $user->createToken('admin-token')->plainTextToken;

            // Log activity
            \App\Models\ActivityLog::create([
                'user_id' => $user->id,
                'user_name' => $user->name,
                'action_type' => 'login',
                'description' => "Tizimga kirildi: {$user->name} (Administrator)",
            ]);

            return response()->json([
                'message' => 'Admin muvaffaqiyatli tizimga kirdi',
                'token' => $token,
                'user' => [
                    'id' => $user->id,
                    'name' => $user->name,
                    'email' => $user->email,
                    'role' => $user->role,
                    'branch_id' => null,
                    'branch' => null
                ],
                'pin_required' => false
            ], 200);
        }

        // Cashier login requires PIN code step
        return response()->json([
            'message' => 'Parol tasdiqlandi, PIN kodni kiriting',
            'pin_required' => true,
            'user_id' => $user->id
        ], 200);
    }

    /**
     * Login step 2: Verify Cashier PIN-code.
     */
    public function verifyPin(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'user_id' => 'required|uuid',
            'pin_code' => 'required|string|size:4',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $user = User::find($request->user_id);

        if (!$user || $user->role !== 'cashier') {
            return response()->json(['message' => 'Foydalanuvchi topilmadi'], 404);
        }

        if (!Hash::check($request->pin_code, $user->pin_code)) {
            return response()->json(['message' => 'PIN kod noto\'g\'ri'], 401);
        }

        // Generate access token
        $token = $user->createToken('cashier-token')->plainTextToken;

        // Auto-terminate previous cashier shift and start a new shift!
        // We will call the shift initialization method internally or let the frontend trigger it.
        // The requirement says: "When a cashier authenticates or credentials are updated, the system automatically terminates..."
        $shiftController = new ShiftController();
        $shift = $shiftController->initializeCashierShift($user);

        // Log activity
        \App\Models\ActivityLog::create([
            'user_id' => $user->id,
            'user_name' => $user->name,
            'action_type' => 'login',
            'description' => "Tizimga kirildi: {$user->name} (Kassir)",
        ]);

        return response()->json([
            'message' => 'Kassir muvaffaqiyatli kirdi',
            'token' => $token,
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'role' => $user->role,
                'branch_id' => $user->branch_id,
                'branch' => $user->branch
            ],
            'shift' => $shift
        ], 200);
    }

    /**
     * Create / Register a Cashier (Admin only).
     */
    public function registerCashier(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'name' => 'required|string|max:255',
            'email' => 'required|string|email|max:255|unique:users|regex:/^[a-zA-Z0-9\._%+-]+@gmail\.com$/i',
            'password' => 'required|string|min:6',
            'role' => 'nullable|string|in:admin,cashier,scanner',
            'pin_code' => 'nullable|string|size:4',
            'wage_structure' => 'nullable|numeric',
            'operational_hours' => 'nullable|array',
            'branch_id' => 'nullable|uuid|exists:branches,id'
        ], [
            'email.regex' => 'Foydalanuvchi e-pochta manzili faqat @gmail.com bo\'lishi shart!'
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $role = $request->role ?? 'cashier';
        $pinCode = $request->pin_code ? Hash::make($request->pin_code) : Hash::make('0000');

        $user = User::create([
            'name' => $request->name,
            'email' => $request->email,
            'password' => Hash::make($request->password),
            'pin_code' => $pinCode,
            'role' => $role,
            'wage_structure' => $request->wage_structure ?? 0.00,
            'operational_hours' => $request->operational_hours ?? null,
            'branch_id' => $request->branch_id ?? null
        ]);

        return response()->json([
            'message' => 'Foydalanuvchi muvaffaqiyatli yaratildi',
            'user' => $user
        ], 201);
    }

    /**
     * Update Staff credentials/wages (Admin only).
     */
    public function updateStaff(Request $request, $id)
    {
        $user = User::find($id);
        if (!$user) {
            return response()->json(['message' => 'Foydalanuvchi topilmadi'], 404);
        }

        $validator = Validator::make($request->all(), [
            'name' => 'sometimes|required|string|max:255',
            'email' => 'sometimes|required|string|email|max:255|unique:users,email,' . $id . '|regex:/^[a-zA-Z0-9\._%+-]+@gmail\.com$/i',
            'password' => 'sometimes|nullable|string|min:6',
            'role' => 'sometimes|string|in:admin,cashier,scanner',
            'pin_code' => 'sometimes|nullable|string|size:4',
            'wage_structure' => 'sometimes|numeric',
            'operational_hours' => 'sometimes|nullable|array',
            'branch_id' => 'sometimes|nullable|uuid|exists:branches,id'
        ], [
            'email.regex' => 'Foydalanuvchi e-pochta manzili faqat @gmail.com bo\'lishi shart!'
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        if ($request->has('name')) $user->name = $request->name;
        if ($request->has('email')) $user->email = $request->email;
        if ($request->filled('password')) $user->password = Hash::make($request->password);
        if ($request->filled('pin_code')) $user->pin_code = Hash::make($request->pin_code);
        if ($request->has('role')) $user->role = $request->role;
        if ($request->has('wage_structure')) $user->wage_structure = $request->wage_structure;
        if ($request->has('operational_hours')) $user->operational_hours = $request->operational_hours;
        if ($request->has('branch_id')) $user->branch_id = $request->branch_id;

        $user->save();

        // Trigger shift termination logic if active shift credentials were updated
        if ($user->role === 'cashier') {
            // Find active shift of this user and reset/notify
            $activeShift = \App\Models\Shift::where('user_id', $user->id)->where('status', 'active')->first();
            if ($activeShift) {
                // We terminate and notify
                $shiftController = new ShiftController();
                $shiftController->terminateActiveShifts();
            }
        }

        return response()->json([
            'message' => 'Xodim ma\'lumotlari yangilandi',
            'user' => $user
        ], 200);
    }

    /**
     * Get All Staff members (Admin only).
     */
    public function listStaff()
    {
        $staff = User::with('branch')->get();
        return response()->json($staff, 200);
    }

    /**
     * Delete Staff Member.
     */
    public function deleteStaff($id)
    {
        $user = User::find($id);
        if (!$user) {
            return response()->json(['message' => 'Foydalanuvchi topilmadi'], 404);
        }

        // Terminate any active shift before deleting
        \App\Models\Shift::where('user_id', $user->id)->where('status', 'active')->update([
            'status' => 'completed',
            'end_time' => now()
        ]);

        $user->delete();
        return response()->json(['message' => 'Xodim muvaffaqiyatli o\'chirildi'], 200);
    }
}
