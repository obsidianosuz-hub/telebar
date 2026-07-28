<?php

namespace App\Http\Controllers;

use App\Models\Setting;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class SettingController extends Controller
{
    /**
     * Get all active system configurations.
     */
    public function index()
    {
        $settingsList = Setting::all()->pluck('value', 'key');
        
        // Define default settings in case database is empty
        $defaults = [
            'branding' => [
                'brand_name' => 'telebar',
                'logo_url' => ''
            ],
            'theme' => [
                'accent_color' => '#00f2fe',
                'mode' => 'dark',
                'preset' => 'glassmorphism'
            ],
            'salary_rules' => [
                'day_shift_multiplier' => 1.0,
                'night_shift_multiplier' => 1.5,
                'hourly_rate' => 15000
            ],
            'shift_timings' => [
                'day_start' => 8,
                'day_end' => 20,
                'night_start' => 20,
                'night_end' => 8
            ],
            'click_config' => [
                'active' => false,
                'merchant_id' => '',
                'service_id' => '',
                'user_id' => '',
                'secret_key' => '',
                'sandbox' => true
            ],
            'translations' => $this->getDefaultTranslations()
        ];

        return response()->json(array_merge($defaults, $settingsList->toArray()), 200);
    }

    /**
     * Update/Save system configuration key (Admin only).
     */
    public function update(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'key' => 'required|string|in:branding,theme,salary_rules,translations,shift_timings,click_config',
            'value' => 'required|array'
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $setting = Setting::updateOrCreate(
            ['key' => $request->key],
            ['value' => $request->value]
        );

        // Notify client nodes of real-time branding/theme shifts
        $this->notifySettingsChange($setting);

        return response()->json([
            'message' => 'Tizim sozlamalari saqlandi',
            'setting' => $setting
        ], 200);
    }

    /**
     * Notify Node.js telemetry server of settings change.
     */
    protected function notifySettingsChange(Setting $setting)
    {
        $url = env('REALTIME_SERVER_URL', 'http://localhost:3000') . '/api/telemetry';

        try {
            $ch = curl_init($url);
            $payload = json_encode([
                'event' => 'settings:changed',
                'data' => [
                    'key' => $setting->key,
                    'value' => $setting->value
                ]
            ]);

            curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
            curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_TIMEOUT, 2);
            curl_exec($ch);
            curl_close($ch);
        } catch (\Exception $e) {
            // Ignore connection errors
        }
    }

    /**
     * Default language terms dictionary (Uzbek, Russian, English).
     */
    protected function getDefaultTranslations()
    {
        return [
            'uz' => [
                'login_title' => 'Telebar POS Terminali',
                'enter_email' => 'Gmaillni kiriting',
                'enter_pass' => 'Parolni kiriting',
                'enter_pin' => 'Kassir PIN kodini kiriting',
                'btn_next' => 'Keyingisi',
                'btn_login' => 'Kirish',
                'dashboard' => 'Boshqaruv Paneli',
                'revenue' => 'Tushum',
                'expenses' => 'Xarajatlar',
                'inventory' => 'Ombor Qiymati',
                'active_shift' => 'Faol Navbatchilik',
                'staff_management' => 'Xodimlar Nazorati',
                'warehouse' => 'Omborxona',
                'settings' => 'Sozlamalar',
                'model_name' => 'Model nomi',
                'quantity' => 'Soni',
                'price' => 'Narxi',
                'barcode' => 'Shtrixkod / QR',
                'checkout' => 'Sotish',
                'logout' => 'Chiqish'
            ],
            'ru' => [
                'login_title' => 'POS-Терминал Telebar',
                'enter_email' => 'Введите Gmail',
                'enter_pass' => 'Введите пароль',
                'enter_pin' => 'Введите PIN-код кассира',
                'btn_next' => 'Далее',
                'btn_login' => 'Войти',
                'dashboard' => 'Панель управления',
                'revenue' => 'Выручка',
                'expenses' => 'Расходы',
                'inventory' => 'Стоимость склада',
                'active_shift' => 'Активная Смена',
                'staff_management' => 'Управление штатом',
                'warehouse' => 'Склад',
                'settings' => 'Настройки',
                'model_name' => 'Модель устройства',
                'quantity' => 'Количество',
                'price' => 'Цена',
                'barcode' => 'Штрихкод / QR',
                'checkout' => 'Оформить продажу',
                'logout' => 'Выйти'
            ],
            'en' => [
                'login_title' => 'Telebar POS Terminal',
                'enter_email' => 'Enter Gmail',
                'enter_pass' => 'Enter Password',
                'enter_pin' => 'Enter Cashier PIN',
                'btn_next' => 'Next',
                'btn_login' => 'Login',
                'dashboard' => 'Dashboard',
                'revenue' => 'Revenue',
                'expenses' => 'Expenses',
                'inventory' => 'Stock Valuation',
                'active_shift' => 'Active Shift',
                'staff_management' => 'Staff Management',
                'warehouse' => 'Warehouse',
                'settings' => 'System Settings',
                'model_name' => 'Model Name',
                'quantity' => 'Quantity',
                'price' => 'Price',
                'barcode' => 'Barcode / QR',
                'checkout' => 'Checkout',
                'logout' => 'Logout'
            ]
        ];
    }
}
