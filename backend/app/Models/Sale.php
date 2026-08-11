<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Sale extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'shift_id',
        'product_id',
        'quantity',
        'total_price',
        'timestamp',
    ];

    protected $casts = [
        'timestamp' => 'datetime',
        'total_price' => 'decimal:2',
        'quantity' => 'integer',
    ];

    /**
     * Relationship: The shift during which this sale was recorded
     */
    public function shift()
    {
        return $this->belongsTo(Shift::class);
    }

    /**
     * Relationship: The product sold
     */
    public function product()
    {
        return $this->belongsTo(Product::class);
    }
}
