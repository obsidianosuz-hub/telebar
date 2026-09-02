<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class PartnerOrder extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'partner_id',
        'product_name',
        'quantity',
        'contract_note',
        'customs_duty',
        'status'
    ];

    public function partner()
    {
        return $this->belongsTo(Partner::class);
    }
}
