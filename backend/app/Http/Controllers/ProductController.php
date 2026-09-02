<?php

namespace App\Http\Controllers;

use App\Models\Product;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class ProductController extends Controller
{
    /**
     * Get list of smartphones, supporting search queries.
     */
    public function index(Request $request)
    {
        $query = Product::query();

        if ($request->user() && $request->user()->role === 'cashier') {
            $query->where('branch_id', $request->user()->branch_id);
        } elseif ($request->has('branch_id') && $request->branch_id) {
            $query->where('branch_id', $request->branch_id);
        }

        if ($request->has('search')) {
            $search = $request->search;
            $query->where(function($q) use ($search) {
                $q->where('model_name', 'like', "%{$search}%")
                  ->orWhere('qr_code', 'like', "%{$search}%")
                  ->orWhere('specifications', 'like', "%{$search}%");
            });
        }

        $products = $query->orderBy('model_name', 'asc')->get();
        return response()->json($products, 200);
    }

    /**
     * Look up a single smartphone using its QR Code.
     */
    public function scan(Request $request, $qr_code)
    {
        $query = Product::where('qr_code', $qr_code);

        if ($request->user() && $request->user()->role === 'cashier') {
            $query->where('branch_id', $request->user()->branch_id);
        }

        $product = $query->first();

        if (!$product) {
            return response()->json([
                'message' => 'Mahsulot topilmadi',
                'qr_code' => $qr_code
            ], 404);
        }

        return response()->json($product, 200);
    }

    /**
     * Store new smartphone spec entries (Admin only).
     */
    public function store(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'qr_code' => 'required|string|unique:products,qr_code',
            'model_name' => 'required|string|max:255',
            'specifications' => 'required|array',
            'quantity' => 'required|integer|min:0',
            'purchase_price' => 'required|numeric|min:0',
            'retail_price' => 'required|numeric|min:0',
            'branch_id' => 'nullable|uuid|exists:branches,id',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $product = Product::create($request->all());

        // Log activity
        \App\Models\ActivityLog::create([
            'user_id' => $request->user()->id ?? null,
            'user_name' => ($request->user()->name ?? 'Tizim') . ($request->user() ? ' (' . $request->user()->role . ')' : ''),
            'action_type' => 'product_create',
            'description' => "[Mahsulot: {$product->model_name}] Yangi mahsulot omborga qo'shildi (Soni: {$product->quantity} dona, Narxi: \$" . number_format($product->retail_price, 2) . ")",
        ]);

        // Notify realtime system of new stock
        $this->notifyStockChange($product);

        return response()->json([
            'message' => 'Yangi mahsulot omborxonaga qo\'shildi',
            'product' => $product
        ], 201);
    }

    /**
     * Update product details (Admin only).
     */
    public function update(Request $request, $id)
    {
        $product = Product::find($id);
        if (!$product) {
            return response()->json(['message' => 'Mahsulot topilmadi'], 404);
        }

        $validator = Validator::make($request->all(), [
            'qr_code' => 'sometimes|required|string|unique:products,qr_code,' . $id,
            'model_name' => 'sometimes|required|string|max:255',
            'specifications' => 'sometimes|required|array',
            'quantity' => 'sometimes|required|integer|min:0',
            'purchase_price' => 'sometimes|required|numeric|min:0',
            'retail_price' => 'sometimes|required|numeric|min:0',
            'branch_id' => 'sometimes|nullable|uuid|exists:branches,id',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $product->update($request->all());

        // Log activity
        \App\Models\ActivityLog::create([
            'user_id' => $request->user()->id ?? null,
            'user_name' => ($request->user()->name ?? 'Tizim') . ($request->user() ? ' (' . $request->user()->role . ')' : ''),
            'action_type' => 'product_update',
            'description' => "[Mahsulot: {$product->model_name}] Mahsulot ma'lumotlari yangilandi (Yangi soni: {$product->quantity} dona, Yangi narxi: \$" . number_format($product->retail_price, 2) . ")",
        ]);

        // Notify realtime system of stock update
        $this->notifyStockChange($product);

        return response()->json([
            'message' => 'Mahsulot ma\'lumotlari yangilandi',
            'product' => $product
        ], 200);
    }

    /**
     * Delete product from database (Admin only).
     */
    public function destroy($id)
    {
        $product = Product::find($id);
        if (!$product) {
            return response()->json(['message' => 'Mahsulot topilmadi'], 404);
        }

        $product->delete();

        // Log activity
        \App\Models\ActivityLog::create([
            'user_id' => request()->user()->id ?? null,
            'user_name' => (request()->user()->name ?? 'Tizim') . (request()->user() ? ' (' . request()->user()->role . ')' : ''),
            'action_type' => 'product_delete',
            'description' => "[Mahsulot: {$product->model_name}] Mahsulot o'chirildi (Shtrixkod: {$product->qr_code})",
        ]);

        return response()->json(['message' => 'Mahsulot o\'chirildi'], 200);
    }

    /**
     * Send WebSocket webhook to Node.js when inventory counts change.
     */
    protected function notifyStockChange(Product $product)
    {
        $url = env('REALTIME_SERVER_URL', 'http://localhost:3000') . '/api/telemetry';
        
        try {
            $ch = curl_init($url);
            $payload = json_encode([
                'event' => 'stock:changed',
                'data' => [
                    'product_id' => $product->id,
                    'qr_code' => $product->qr_code,
                    'model_name' => $product->model_name,
                    'quantity' => $product->quantity,
                    'retail_price' => $product->retail_price
                ]
            ]);

            curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
            curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_TIMEOUT, 2);
            curl_exec($ch);
            curl_close($ch);
        } catch (\Exception $e) {
            // Ignore offline Socket.io server during tests
        }
    }

    /**
     * Parse QR code using python script.
     */
    public function parseQrCode(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'qr_code_string' => 'required|string'
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $qrCodeString = $request->input('qr_code_string');
        $escapedString = escapeshellarg($qrCodeString);
        $scriptPath = base_path('../automation/qr_parser.py');
        
        // Execute the python script
        $command = "python " . escapeshellarg($scriptPath) . " --parse " . $escapedString;
        
        $output = [];
        $returnVar = 0;
        exec($command, $output, $returnVar);

        $resultString = implode("\n", $output);
        $resultData = json_decode($resultString, true);

        if ($returnVar !== 0 || !$resultData || ($resultData['status'] ?? '') === 'error') {
            return response()->json([
                'message' => $resultData['message'] ?? 'QR kodni o\'qishda xatolik yuz berdi'
            ], 400);
        }

        return response()->json($resultData, 200);
    }
}
