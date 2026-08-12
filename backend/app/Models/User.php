<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    use HasApiTokens, HasFactory, Notifiable, HasUuids;

    /**
     * The attributes that are mass assignable.
     *
     * @var array<int, string>
     */
    protected $fillable = [
        'branch_id',
        'name',
        'email',
        'password',
        'pin_code',
        'role',
        'wage_structure',
        'operational_hours',
    ];

    /**
     * The attributes that should be hidden for serialization.
     *
     * @var array<int, string>
     */
    protected $hidden = [
        'password',
        'pin_code',
        'remember_token',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'password' => 'hashed',
            'pin_code' => 'hashed',
            'wage_structure' => 'decimal:2',
            'operational_hours' => 'array',
        ];
    }

    /**
     * Relationship: Shifts belonging to this user
     */
    public function shifts()
    {
        return $this->hasMany(Shift::class);
    }

    /**
     * Relationship: Branch this user belongs to
     */
    public function branch()
    {
        return $this->belongsTo(Branch::class);
    }
}
