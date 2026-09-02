<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class DebtPayment extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'debt_id',
        'amount',
        'payment_method',
    ];

    /**
     * Relationship: The debt this payment is for.
     */
    public function debt()
    {
        return $this->belongsTo(Debt::class);
    }
}
