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
        // 1. Add fields to sales table
        Schema::table('sales', function (Blueprint $table) {
            $table->string('payment_method')->default('cash'); // 'cash', 'click', 'debt'
            $table->string('payment_status')->default('paid'); // 'paid', 'pending_debt'
        });

        // 2. Create debts table
        Schema::create('debts', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('sale_id');
            $table->string('customer_name');
            $table->string('customer_phone');
            $table->decimal('total_amount', 12, 2);
            $table->decimal('paid_amount', 12, 2)->default(0.00);
            $table->date('due_date')->nullable();
            $table->string('status')->default('pending'); // 'pending', 'paid'
            $table->timestamps();

            $table->foreign('sale_id')->references('id')->on('sales')->onDelete('cascade');
        });

        // 3. Create debt_payments table
        Schema::create('debt_payments', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('debt_id');
            $table->decimal('amount', 12, 2);
            $table->string('payment_method')->default('cash'); // 'cash', 'click'
            $table->timestamps();

            $table->foreign('debt_id')->references('id')->on('debts')->onDelete('cascade');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('debt_payments');
        Schema::dropIfExists('debts');
        Schema::table('sales', function (Blueprint $table) {
            $table->dropColumn(['payment_method', 'payment_status']);
        });
    }
};
