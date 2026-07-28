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
        Schema::create('shifts', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('user_id');
            $table->enum('shift_type', ['day', 'night']);
            $table->timestamp('start_time')->useCurrent();
            $table->timestamp('end_time')->nullable();
            $table->decimal('generated_revenue', 12, 2)->default(0.00);
            $table->decimal('calculated_wage', 12, 2)->default(0.00);
            $table->enum('status', ['active', 'completed'])->default('active');
            $table->timestamps();

            $table->foreign('user_id')->references('id')->on('users')->onDelete('cascade');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('shifts');
    }
};
