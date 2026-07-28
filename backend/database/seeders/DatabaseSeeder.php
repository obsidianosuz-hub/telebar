<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\User;
use App\Models\Product;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        // Clear existing to prevent duplicates on re-run
        \App\Models\Branch::truncate();
        User::truncate();
        Product::truncate();

        // Seed Branches
        $branch1 = \App\Models\Branch::create([
            'name' => 'Yunusobod filiali',
            'address' => 'Toshkent shahar, Yunusobod tumani'
        ]);

        $branch2 = \App\Models\Branch::create([
            'name' => 'Chilonzor filiali',
            'address' => 'Toshkent shahar, Chilonzor tumani'
        ]);

        // 1. Create Administrator (No branch assigned)
        User::create([
            'name' => 'Administrator',
            'email' => 'admin@gmail.com',
            'password' => Hash::make('admin123'),
            'role' => 'admin',
            'pin_code' => null,
            'branch_id' => null
        ]);

        // 2. Create Cashier 1 (Yunusobod)
        User::create([
            'name' => 'Yunusobod Kassiri',
            'email' => 'cashier@gmail.com',
            'password' => Hash::make('cashier123'),
            'role' => 'cashier',
            'pin_code' => '1234',
            'branch_id' => $branch1->id
        ]);

        // Create Cashier 2 (Chilonzor)
        User::create([
            'name' => 'Chilonzor Kassiri',
            'email' => 'cashier2@gmail.com',
            'password' => Hash::make('cashier123'),
            'role' => 'cashier',
            'pin_code' => '5678',
            'branch_id' => $branch2->id
        ]);

        // Create Cashier 3: Diyorbek (Yunusobod)
        User::create([
            'name' => 'Diyorbek Kassir',
            'email' => 'diyorbek@gmail.com',
            'password' => Hash::make('diyorbek123'),
            'role' => 'cashier',
            'pin_code' => '1111',
            'branch_id' => $branch1->id
        ]);

        // Create Cashier 4: Sardor (Chilonzor)
        User::create([
            'name' => 'Sardor Kassir',
            'email' => 'sardor@gmail.com',
            'password' => Hash::make('sardor123'),
            'role' => 'cashier',
            'pin_code' => '2222',
            'branch_id' => $branch2->id
        ]);

        // Create Scanner User (Device)
        User::create([
            'name' => 'Qurilma Skanerlovchi',
            'email' => 'scanner@gmail.com',
            'password' => Hash::make('scanner123'),
            'role' => 'scanner',
            'pin_code' => null,
            'branch_id' => null
        ]);

        // 3. Create initial smartphone inventory assigned to Yunusobod
        Product::create([
            'branch_id' => $branch1->id,
            'model_name' => 'iPhone 15 Pro Max',
            'specifications' => [
                'storage' => '256GB',
                'color' => 'Blue Titanium',
                'ram' => '8GB',
                'size' => '159.9x76.7x8.3 mm'
            ],
            'qr_code' => 'iph15pm-256-blue',
            'quantity' => 15,
            'purchase_price' => 1100.00,
            'retail_price' => 1350.00
        ]);

        Product::create([
            'branch_id' => $branch1->id,
            'model_name' => 'Samsung Galaxy S24 Ultra',
            'specifications' => [
                'storage' => '512GB',
                'color' => 'Titanium Gray',
                'ram' => '12GB',
                'size' => '162.3x79.0x8.6 mm'
            ],
            'qr_code' => 's24u-512-gray',
            'quantity' => 10,
            'purchase_price' => 1050.00,
            'retail_price' => 1290.00
        ]);

        // Create smartphone inventory assigned to Chilonzor
        Product::create([
            'branch_id' => $branch2->id,
            'model_name' => 'Xiaomi 14 Ultra',
            'specifications' => [
                'storage' => '512GB',
                'color' => 'Black',
                'ram' => '16GB',
                'size' => '161.4x75.3x9.2 mm'
            ],
            'qr_code' => 'x14u-512-blk',
            'quantity' => 5,
            'purchase_price' => 850.00,
            'retail_price' => 1050.00
        ]);
    }
}
