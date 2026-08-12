<?php

namespace App\Http\Controllers;

use App\Models\PartnerOrder;
use Illuminate\Http\Request;

class PartnerOrderController extends Controller
{
    public function index()
    {
        return response()->json(PartnerOrder::with('partner')->get(), 200);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'partner_id' => 'required|exists:partners,id',
            'product_name' => 'required|string',
            'quantity' => 'required|integer|min:1',
            'contract_note' => 'nullable|string',
            'customs_duty' => 'nullable|numeric|min:0'
        ]);

        $order = PartnerOrder::create($validated);

        return response()->json([
            'message' => 'Buyurtma & Shartnoma muvaffaqiyatli ro\'yxatdan o\'tdi',
            'order' => $order->load('partner')
        ], 201);
    }

    public function show($id)
    {
        $order = PartnerOrder::with('partner')->find($id);
        if (!$order) {
            return response()->json(['message' => 'Buyurtma topilmadi'], 404);
        }
        return response()->json($order, 200);
    }

    public function update(Request $request, $id)
    {
        $order = PartnerOrder::find($id);
        if (!$order) {
            return response()->json(['message' => 'Buyurtma topilmadi'], 404);
        }

        $validated = $request->validate([
            'product_name' => 'sometimes|required|string',
            'quantity' => 'sometimes|required|integer|min:1',
            'contract_note' => 'nullable|string',
            'customs_duty' => 'nullable|numeric|min:0',
            'status' => 'sometimes|required|string'
        ]);

        $order->update($validated);

        return response()->json([
            'message' => 'Buyurtma holati yangilandi',
            'order' => $order->load('partner')
        ], 200);
    }

    public function destroy($id)
    {
        $order = PartnerOrder::find($id);
        if (!$order) {
            return response()->json(['message' => 'Buyurtma topilmadi'], 404);
        }

        $order->delete();

        return response()->json(['message' => 'Buyurtma o\'chirib tashlandi'], 200);
    }
}
