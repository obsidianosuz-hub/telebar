<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('users', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('name');
            $table->string('email')->unique();
            $table->string('password');
            $table->string('pin_code')->nullable(); // Secondary cashier PIN code (hashed)
            $table->enum('role', ['admin', 'cashier', 'scanner'])->default('cashier');
            $table->decimal('wage_structure', 10, 2)->default(0.00); // Hourly or monthly base wage
            $table->json('operational_hours')->nullable(); // Preferred cashier shift times
            $table->rememberToken();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('users');
    }
};
