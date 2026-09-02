<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Shift extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'user_id',
        'shift_type',
        'start_time',
        'end_time',
        'generated_revenue',
        'calculated_wage',
        'status',
    ];

    protected $casts = [
        'start_time' => 'datetime',
        'end_time' => 'datetime',
        'generated_revenue' => 'decimal:2',
        'calculated_wage' => 'decimal:2',
    ];

    /**
     * Relationship: User (Cashier)
     */
    public function user()
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Relationship: Sales executed during this shift
     */
    public function sales()
    {
        return $this->hasMany(Sale::class);
    }
}
