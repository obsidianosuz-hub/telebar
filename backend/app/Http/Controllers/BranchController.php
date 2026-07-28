<?php

namespace App\Http\Controllers;

use App\Models\Branch;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class BranchController extends Controller
{
    /**
     * List all branches with relations counts and cashier list.
     */
    public function index()
    {
        $branches = Branch::with(['users' => function ($q) {
            $q->where('role', 'cashier')->with(['shifts' => function ($sq) {
                $sq->orderBy('created_at', 'desc')->take(1);
            }]);
        }])->withCount(['users', 'products'])->get();

        return response()->json($branches, 200);
    }

    /**
     * Create a new branch (Admin only).
     */
    public function store(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'name' => 'required|string|max:255|unique:branches,name',
            'address' => 'nullable|string|max:255',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $branch = Branch::create($request->all());

        return response()->json([
            'message' => 'Yangi filial/obyekt yaratildi',
            'branch' => $branch
        ], 201);
    }

    /**
     * Update branch details (Admin only).
     */
    public function update(Request $request, $id)
    {
        $branch = Branch::find($id);
        if (!$branch) {
            return response()->json(['message' => 'Obyekt topilmadi'], 404);
        }

        $validator = Validator::make($request->all(), [
            'name' => 'sometimes|required|string|max:255|unique:branches,name,' . $id,
            'address' => 'sometimes|nullable|string|max:255',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $branch->update($request->all());

        return response()->json([
            'message' => 'Obyekt ma\'lumotlari yangilandi',
            'branch' => $branch
        ], 200);
    }

    /**
     * Delete a branch (Admin only).
     */
    public function destroy($id)
    {
        $branch = Branch::find($id);
        if (!$branch) {
            return response()->json(['message' => 'Obyekt topilmadi'], 404);
        }

        // Set branch_id of linked users to null
        \App\Models\User::where('branch_id', $id)->update(['branch_id' => null]);

        $branch->delete();

        return response()->json([
            'message' => 'Obyekt muvaffaqiyatli o\'chirildi'
        ], 200);
    }

    /**
     * Get inventory list filtered for a specific branch.
     */
    public function branchProducts($id)
    {
        $branch = Branch::find($id);
        if (!$branch) {
            return response()->json(['message' => 'Obyekt topilmadi'], 404);
        }

        $products = \App\Models\Product::where('branch_id', $id)->get();
        return response()->json($products, 200);
    }
}
