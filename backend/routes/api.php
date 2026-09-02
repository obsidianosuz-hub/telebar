<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\ProductController;
use App\Http\Controllers\SaleController;
use App\Http\Controllers\ShiftController;
use App\Http\Controllers\SettingController;
use App\Http\Controllers\BranchController;
use App\Http\Controllers\ScanRequestController;
use App\Http\Controllers\PartnerController;
use App\Http\Controllers\PartnerOrderController;
use App\Http\Controllers\ActivityLogController;
use App\Http\Controllers\DebtController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
*/

// Public login routes
Route::post('/auth/login', [AuthController::class, 'login'])->name('login');
Route::post('/auth/verify-pin', [AuthController::class, 'verifyPin']);
Route::post('/auth/quick-login', [AuthController::class, 'quickLogin']);
Route::post('/payments/click/webhook', [App\Http\Controllers\ClickPaymentController::class, 'handleWebhook']);

// Protected routes (Sanctum)
Route::middleware('auth:sanctum')->group(function () {

    // General POS & Warehouse views
    Route::get('/products', [ProductController::class, 'index']);
    Route::get('/products/scan/{qr_code}', [ProductController::class, 'scan']);
    Route::post('/sales/checkout', [SaleController::class, 'checkout']);
    Route::get('/sales/history', [SaleController::class, 'history']);
    Route::get('/settings', [SettingController::class, 'index']);

    // Shift Operations & Work Hours Tracking
    Route::get('/shifts/current', [ShiftController::class, 'getCurrentShift']);
    Route::post('/shifts/end', [ShiftController::class, 'endCurrentShift']);
    Route::get('/shifts/staff-work-hours', [ShiftController::class, 'getStaffWorkHours']);
    Route::get('/shifts', [ShiftController::class, 'index']);
    Route::get('/shifts/analytics', [ShiftController::class, 'getAnalytics']);

    // Admin-Only Staff Management
    Route::post('/auth/staff', [AuthController::class, 'registerCashier']);
    Route::put('/auth/staff/{id}', [AuthController::class, 'updateStaff']);
    Route::get('/auth/staff', [AuthController::class, 'listStaff']);
    Route::delete('/auth/staff/{id}', [AuthController::class, 'deleteStaff']);

    // Admin-Only Warehouse Product controls
    Route::post('/products', [ProductController::class, 'store']);
    Route::put('/products/{id}', [ProductController::class, 'update']);
    Route::delete('/products/{id}', [ProductController::class, 'destroy']);
    Route::post('/products/parse-qr', [ProductController::class, 'parseQrCode']);

    // Admin-Only system settings update
    Route::post('/settings', [SettingController::class, 'update']);
    Route::get('/activity-logs', [ActivityLogController::class, 'index']);

    // Admin-Only Branch / Objects Management
    Route::get('/branches', [BranchController::class, 'index']);
    Route::post('/branches', [BranchController::class, 'store']);
    Route::put('/branches/{id}', [BranchController::class, 'update']);
    Route::delete('/branches/{id}', [BranchController::class, 'destroy']);
    Route::get('/branches/{id}/products', [BranchController::class, 'branchProducts']);

    // Scan Requests Flow
    Route::get('/scan-requests', [ScanRequestController::class, 'index']);
    Route::post('/scan-requests', [ScanRequestController::class, 'store']);
    Route::put('/scan-requests/{id}', [ScanRequestController::class, 'update']);
    Route::delete('/scan-requests/{id}', [ScanRequestController::class, 'destroy']);

    // Partners & Ordering Flow
    Route::apiResource('partners', PartnerController::class);
    Route::apiResource('partner-orders', PartnerOrderController::class);

    // Debts & Repayments Flow
    Route::get('/debts', [DebtController::class, 'index']);
    Route::get('/debts/{id}', [DebtController::class, 'show']);
    Route::post('/debts', [DebtController::class, 'store']);
    Route::post('/debts/{id}/repay', [DebtController::class, 'repay']);
    Route::get('/debts/{id}/payments', [DebtController::class, 'payments']);
    Route::post('/debts/{id}/approve', [DebtController::class, 'approve']);
    Route::post('/debts/{id}/reject', [DebtController::class, 'reject']);
});
