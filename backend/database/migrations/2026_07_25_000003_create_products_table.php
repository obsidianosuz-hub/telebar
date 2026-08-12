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
        Schema::create('products', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('qr_code')->unique(); // Unique identifier scanned via peripheral hardware
            $table->string('model_name');
            $table->json('specifications'); // Stores RAM, Storage, Color, OS version, etc.
            $table->integer('quantity')->default(0);
            $table->decimal('purchase_price', 12, 2);
            $table->decimal('retail_price', 12, 2);
            $table->timestamps();

            // Custom B-Tree index for extremely fast lookups by QR scanner
            $table->index('qr_code', 'products_qr_code_idx');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('products');
    }
};
