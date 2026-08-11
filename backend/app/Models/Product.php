<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Product extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'branch_id',
        'qr_code',
        'model_name',
        'specifications',
        'quantity',
        'purchase_price',
        'retail_price',
        'click_payment_url',
    ];

    protected $casts = [
        'specifications' => 'array',
        'purchase_price' => 'decimal:2',
        'retail_price' => 'decimal:2',
        'quantity' => 'integer',
    ];

    /**
     * Relationship: Sales records associated with this product
     */
    public function sales()
    {
        return $this->hasMany(Sale::class);
    }

    /**
     * Relationship: Branch this product belongs to
     */
    public function branch()
    {
        return $this->belongsTo(Branch::class);
    }
}
