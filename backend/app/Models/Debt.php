<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Debt extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'sale_id',
        'customer_name',
        'customer_phone',
        'total_amount',
        'paid_amount',
        'due_date',
        'status',
        'passport_series_number',
        'passport_pinfl',
        'customer_address',
        'product_name',
        'quantity',
        'installment_months',
        'monthly_payment',
        'branch_id',
        'user_id',
        'shift_id',
    ];

    /**
     * Relationship: The sale this debt belongs to.
     */
    public function sale()
    {
        return $this->belongsTo(Sale::class);
    }

    /**
     * Relationship: Repayments logged for this debt.
     */
    public function payments()
    {
        return $this->hasMany(DebtPayment::class);
    }

    /**
     * Relationship: The branch where the debt was recorded.
     */
    public function branch()
    {
        return $this->belongsTo(Branch::class);
    }

    /**
     * Relationship: The cashier who recorded the debt.
     */
    public function user()
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Relationship: The active shift when the debt was recorded.
     */
    public function shift()
    {
        return $this->belongsTo(Shift::class);
    }
}
