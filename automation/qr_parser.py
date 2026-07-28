#!/usr/bin/env python3
import sys
import json
import argparse
import re

class QRParser:
    """
    Automates QR code parsing, bulk barcode validations,
    and inventory financial calculations for the Telebar system.
    """

    @staticmethod
    def parse_qr_string(qr_data_string):
        """
        Parses a QR code payload. Telebar QR codes contain structured JSON
        defining the smartphone specification schema.
        Example format:
        {"qr_code":"TEL-12345","model_name":"iPhone 15 Pro","specifications":{"ram":"8GB","storage":"256GB","color":"Blue Titanium"},"purchase_price":950.00,"retail_price":1150.00}
        """
        try:
            # Clean string data
            cleaned_data = qr_data_string.strip()
            parsed_json = json.loads(cleaned_data)
            
            # Validation rules
            required_keys = ['qr_code', 'model_name', 'specifications', 'purchase_price', 'retail_price']
            for key in required_keys:
                if key not in parsed_json:
                    return {
                        "status": "error",
                        "message": f"Klassifikator topilmadi: {key} kaliti majburiy."
                    }

            # Type validations
            if not isinstance(parsed_json['specifications'], dict):
                return {"status": "error", "message": "Xususiyatlar ('specifications') JSON obyekti bo'lishi kerak."}
            if not (isinstance(parsed_json['purchase_price'], (int, float)) and isinstance(parsed_json['retail_price'], (int, float))):
                return {"status": "error", "message": "Narxlar son turida bo'lishi lozim."}

            return {
                "status": "success",
                "product": parsed_json,
                "calculated_margin": parsed_json['retail_price'] - parsed_json['purchase_price']
            }
        except json.JSONDecodeError:
            # Fallback for legacy text string format, e.g.:
            # "QR::MODEL=Samsung S24 Ultra;RAM=12GB;STORAGE=512GB;PURCHASE=900;RETAIL=1100;CODE=S24-998"
            return QRParser.parse_legacy_text_format(qr_data_string)

    @staticmethod
    def parse_legacy_text_format(text):
        try:
            if not text.startswith("QR::"):
                return {"status": "error", "message": "QR kod formati noto'g'ri (no JSON and no QR:: prefix)"}

            segments = text[4:].split(';')
            data = {}
            specs = {}
            for seg in segments:
                if '=' not in seg:
                    continue
                k, v = seg.split('=', 1)
                k = k.strip().upper()
                v = v.strip()

                if k == 'MODEL':
                    data['model_name'] = v
                elif k == 'CODE':
                    data['qr_code'] = v
                elif k == 'PURCHASE':
                    data['purchase_price'] = float(v)
                elif k == 'RETAIL':
                    data['retail_price'] = float(v)
                else:
                    # RAM, STORAGE, COLOR, etc. map to specs
                    specs[k.lower()] = v

            data['specifications'] = specs

            # Validate extracted values
            if 'qr_code' not in data or 'model_name' not in data or 'purchase_price' not in data or 'retail_price' not in data:
                return {"status": "error", "message": "Skaner matnida majburiy maydonlar yetishmayapti"}

            return {
                "status": "success",
                "product": data,
                "calculated_margin": data['retail_price'] - data['purchase_price']
            }
        except Exception as e:
            return {"status": "error", "message": f"Matnli formatni o'qishda xatolik: {str(e)}"}

    @staticmethod
    def validate_barcodes(barcode_list):
        """
        Validates bulk barcodes.
        Telebar format constraint: Barcodes should match pattern 'TEL-[A-Z0-9]{5,10}'
        """
        results = []
        pattern = re.compile(r'^TEL-[A-Z0-9]{5,10}$')
        
        for idx, code in enumerate(barcode_list):
            code_str = str(code).strip()
            is_valid = bool(pattern.match(code_str))
            results.append({
                "index": idx,
                "barcode": code_str,
                "is_valid": is_valid,
                "error": None if is_valid else "Shtrixkod formati mos kelmadi (TEL-[A-Z0-9]{5,10})"
            })
        return results

    @staticmethod
    def calculate_bulk_metrics(inventory_file_path):
        """
        Loads products and computes inventory valuations, total potential profit, margins, and stock checks.
        """
        try:
            with open(inventory_file_path, 'r', encoding='utf-8') as f:
                products = json.load(f)
            
            total_items = len(products)
            total_quantity = 0
            total_valuation = 0.0
            total_potential_revenue = 0.0
            margin_details = []

            for p in products:
                qty = int(p.get('quantity', 0))
                purchase = float(p.get('purchase_price', 0.0))
                retail = float(p.get('retail_price', 0.0))
                
                total_quantity += qty
                total_valuation += (qty * purchase)
                total_potential_revenue += (qty * retail)
                
                margin_details.append({
                    "model_name": p.get('model_name', 'Noma\'lum'),
                    "quantity": qty,
                    "unit_margin": retail - purchase,
                    "total_potential_profit": qty * (retail - purchase)
                })

            total_potential_profit = total_potential_revenue - total_valuation

            return {
                "status": "success",
                "total_items": total_items,
                "total_quantity": total_quantity,
                "total_inventory_valuation": total_valuation,
                "total_potential_revenue": total_potential_revenue,
                "total_potential_profit": total_potential_profit,
                "margin_distribution": margin_details
            }
        except FileNotFoundError:
            return {"status": "error", "message": f"Ombor fayli topilmadi: {inventory_file_path}"}
        except Exception as e:
            return {"status": "error", "message": f"Hisob-kitobda xatolik yuz berdi: {str(e)}"}

def main():
    parser = argparse.ArgumentParser(description="Telebar QR va Shtrixkod Avtomatizatsiya Tizimi")
    parser.add_argument('--parse', type=str, help="Bitta QR-kod ma'lumotini o'qish (JSON yoki matnli)")
    parser.add_argument('--validate-barcodes', type=str, help="Shtrixkodlar ro'yxati (vergul bilan ajratilgan) yoki fayl")
    parser.add_argument('--metrics', type=str, help="Omborxonadagi mahsulotlar JSON fayli yo'li")

    args = parser.parse_args()

    if args.parse:
        res = QRParser.parse_qr_string(args.parse)
        print(json.dumps(res, indent=4, ensure_ascii=False))
        
    elif args.validate_barcodes:
        codes = args.validate_barcodes.split(',')
        res = QRParser.validate_barcodes(codes)
        print(json.dumps(res, indent=4, ensure_ascii=False))
        
    elif args.metrics:
        res = QRParser.calculate_bulk_metrics(args.metrics)
        print(json.dumps(res, indent=4, ensure_ascii=False))
        
    else:
        parser.print_help()

if __name__ == '__main__':
    main()
