<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Partner extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'name',
        'contact_person',
        'email',
        'phone',
        'customs_terms'
    ];

    public function orders()
    {
        return $this->hasMany(PartnerOrder::class);
    }
}
