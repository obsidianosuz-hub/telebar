<?php

namespace App\Http\Controllers;

use App\Models\Partner;
use Illuminate\Http\Request;

class PartnerController extends Controller
{
    public function index()
    {
        return response()->json(Partner::all(), 200);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string',
            'contact_person' => 'required|string',
            'email' => 'required|email',
            'phone' => 'required|string',
            'customs_terms' => 'nullable|string'
        ]);

        $partner = Partner::create($validated);

        return response()->json([
            'message' => 'Hamkor muvaffaqiyatli qo\'shildi',
            'partner' => $partner
        ], 201);
    }

    public function show($id)
    {
        $partner = Partner::find($id);
        if (!$partner) {
            return response()->json(['message' => 'Hamkor topilmadi'], 404);
        }
        return response()->json($partner, 200);
    }

    public function update(Request $request, $id)
    {
        $partner = Partner::find($id);
        if (!$partner) {
            return response()->json(['message' => 'Hamkor topilmadi'], 404);
        }

        $validated = $request->validate([
            'name' => 'sometimes|required|string',
            'contact_person' => 'sometimes|required|string',
            'email' => 'sometimes|required|email',
            'phone' => 'sometimes|required|string',
            'customs_terms' => 'nullable|string'
        ]);

        $partner->update($validated);

        return response()->json([
            'message' => 'Hamkor ma\'lumotlari yangilandi',
            'partner' => $partner
        ], 200);
    }

    public function destroy($id)
    {
        $partner = Partner::find($id);
        if (!$partner) {
            return response()->json(['message' => 'Hamkor topilmadi'], 404);
        }

        $partner->delete();

        return response()->json(['message' => 'Hamkor o\'chirib tashlandi'], 200);
    }
}
