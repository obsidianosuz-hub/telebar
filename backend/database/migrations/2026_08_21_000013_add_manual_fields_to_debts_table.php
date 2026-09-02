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
        Schema::table('debts', function (Blueprint $table) {
            $table->string('product_name')->nullable();
            $table->integer('quantity')->default(1);
            $table->integer('installment_months')->nullable();
            $table->decimal('monthly_payment', 15, 2)->nullable();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('debts', function (Blueprint $table) {
            $table->dropColumn(['product_name', 'quantity', 'installment_months', 'monthly_payment']);
        });
    }
};
