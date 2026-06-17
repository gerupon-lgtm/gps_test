import configparser
import csv
import os
import re
import tkinter as tk
from tkinter import filedialog, messagebox, scrolledtext
import googlemaps
import requests

# ==========================================
# 1. 設定ファイル（config.ini）からAPIキーを読み込み
# ==========================================
config = configparser.ConfigParser()
config_file = "config.ini"

if not os.path.exists(config_file):
    config["SETTINGS"] = {"GOOGLE_MAPS_API_KEY": "YOUR_API_KEY_HERE"}
    with open(config_file, "w", encoding="utf-8") as f:
        config.write(f)
    messagebox.showerror(
        "エラー",
        "config.ini が見つかりません。雛形を作成しましたので、APIキーを設定してください。",
    )
    exit()

config.read(config_file, encoding="utf-8")
API_KEY = config.get("SETTINGS", "GOOGLE_MAPS_API_KEY", fallback="")

if not API_KEY or API_KEY == "YOUR_API_KEY_HERE":
    messagebox.showerror(
        "エラー", "config.ini に有効な Google Maps API キーを設定してください。"
    )
    exit()

# Google Maps クライアントの初期化
gmaps = googlemaps.Client(key=API_KEY)


# ==========================================
# 2. ロジック関数（GUIインスタンスを渡してログ出力できるように変更）
# ==========================================
def extract_location_hint(filename):
    """ファイル名から都道府県市区町村を抽出する"""
    pattern = r"([一-龠]+[都道府県])?([一-龠]+[市区町村])"
    match = re.search(pattern, filename)
    if match:
        return match.group(0)
    return ""


def get_coordinates(facility_name, location_hint, app_instance):
    """Google Maps Geocoding APIから緯度経度を取得"""
    search_query = f"{location_hint} {facility_name}".strip()
    try:
        geocode_result = gmaps.geocode(search_query, language="ja")
        if geocode_result:
            location = geocode_result[0]["geometry"]["location"]
            return location["lat"], location["lng"]
    except Exception as e:
        app_instance.log(f"  ❌ Google API エラー ({facility_name}): {e}")
        return None, None
    return None, None

def get_gsi_info(val1, val2, app_instance):
    """国土地理院 逆ジオコーディングAPI（私のスペルミスを修正した本物のコード）"""
    try:
        num1 = float(val1)
        num2 = float(val2)
        
        lng = max(num1, num2)
        lat = min(num1, num2)
        
        url = f"https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress?lat={lat}&lon={lng}"
        
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }
        
        response = requests.get(url, headers=headers, timeout=10)
        
        if response.status_code == 200:
            import json
            data = json.loads(response.text.strip())
            
            if data and "results" in data:
                results = data["results"]
                
                # 💡 muniCode（Cが大文字）から正しく取得します（unicodeなどというキーは存在しませんでした）
                muni_cd = results.get("muniCd", "")
                lv01_nm = results.get("lv01Nm", "")
                
                return f"{muni_cd}:{lv01_nm}"
    except Exception as e:
        app_instance.log(f"  ❌ エラー: {e}")
    
    return ":"
    
# ==========================================
# 3. GUI アプリケーションクラス
# ==========================================
class App(tk.Tk):

    def __init__(self):
        super().__init__()
        self.title("施設座標・住所コード抽出ツール")
        self.geometry("600x450")
        self.input_file_path = ""
        self.create_widgets()

    def create_widgets(self):
        # ファイル選択エリア
        frame_file = tk.Frame(self)
        frame_file.pack(pady=10, fill="x", padx=10)

        self.lbl_file = tk.Label(
            frame_file, text="入力ファイルを選択してください", anchor="w", bg="white", relief="sunken"
        )
        self.lbl_file.pack(side="left", fill="x", expand=True, padx=5)

        btn_browse = tk.Button(
            frame_file, text="ファイル選択", command=self.browse_file
        )
        btn_browse.pack(side="right", padx=5)

        # 抽出地名確認エリア
        frame_hint = tk.Frame(self)
        frame_hint.pack(pady=5, fill="x", padx=10)
        tk.Label(frame_hint, text="ファイル名から抽出された地名: ").pack(
            side="left"
        )
        self.var_hint = tk.StringVar()
        self.entry_hint = tk.Entry(frame_hint, textvariable=self.var_hint)
        self.entry_hint.pack(side="left", fill="x", expand=True, padx=5)

        # 実行ボタン
        self.btn_run = tk.Button(
            self,
            text="処理開始 (Shift-JISで出力)",
            command=self.execute_processing,
            state="disabled",
            bg="#4CAF50",
            fg="white",
        )
        self.btn_run.pack(pady=10)

        # ログ出力エリア
        tk.Label(self, text="処理ログ:").pack(anchor="w", padx=10)
        self.log_area = scrolledtext.ScrolledText(self, height=15)
        self.log_area.pack(fill="both", expand=True, padx=10, pady=5)

    def log(self, message):
        self.log_area.insert(tk.END, message + "\n")
        self.log_area.see(tk.END)
        self.update_idletasks()

    def browse_file(self):
        file_path = filedialog.askopenfilename(
            filetypes=[("Text/CSV files", "*.txt *.csv"), ("All files", "*.*")]
        )
        if file_path:
            self.input_file_path = file_path
            self.lbl_file.config(text=file_path)

            filename = os.path.basename(file_path)
            hint = extract_location_hint(filename)
            self.var_hint.set(hint)

            self.log(f"ファイルを選択しました: {filename}")
            if hint:
                self.log(f"検索ヒントを自動設定しました: {hint}")
            else:
                self.log(
                    "⚠️ ファイル名から地名を自動抽出できませんでした。手動入力してください。"
                )

            self.btn_run.config(state="normal")

    def execute_processing(self):
        output_file_path = filedialog.asksaveasfilename(
            defaultextension=".csv",
            filetypes=[("CSV files", "*.csv")],
            initialfile="output.csv",
        )
        if not output_file_path:
            return

        self.btn_run.config(state="disabled")
        self.log("\n--- 処理を開始します ---")

        location_hint = self.var_hint.get()

        try:
            facility_list = []
            encodings = ["utf-8", "cp932"]
            for enc in encodings:
                try:
                    with open(
                        self.input_file_path, "r", encoding=enc
                    ) as f:
                        facility_list = [
                            line.strip() for line in f if line.strip()
                        ]
                    break
                except UnicodeDecodeError:
                    continue

            if not facility_list:
                self.log("❌ エラー: ファイルの読み込みに失敗したか、空ファイルです。")
                self.btn_run.config(state="normal")
                return

            output_rows = []

            for facility in facility_list:
                facility_clean = facility.split(",")[0].strip()

                # Googleから緯度経度取得
                lat, lng = get_coordinates(facility_clean, location_hint, self)

                if lat is None or lng is None:
                    self.log(f"  ❌ 位置特定失敗: {facility_clean}")
                    output_rows.append([facility_clean, "", "", "", ":"])
                    continue

                # 取得した座標をログに出す（確認用）
                self.log(f"  📍 座標取得成功 -> 緯度:{lat}, 経度:{lng}")

                # 国土地理院から地域情報を取得
                gsi_info = get_gsi_info(lat, lng, self)
                self.log(f"  🔑 住所コード結果 -> {gsi_info}")

                # レコード追加
                output_rows.append([facility_clean, "", lat, lng, gsi_info])

            # SJISでCSV出力
            with open(
                output_file_path,
                "w",
                newline="",
                encoding="shift_jis",
                errors="replace",
            ) as f:
                writer = csv.writer(f)
                writer.writerow(
                    [
                        "施設名",
                        "郵便番号",
                        "Y座標(緯度)",
                        "X座標(経度)",
                        "市区町村コード:大字/町丁目",
                    ]
                )
                writer.writerows(output_rows)

            self.log(f"\n--- 処理完了 ---")
            self.log(f"ファイルを出力しました: {output_file_path}")
            messagebox.showinfo("完了", "CSVファイルの出力が完了しました！")

        except Exception as e:
            self.log(f"❌ 致命的なエラーが発生しました: {e}")
            messagebox.showerror("エラー", f"処理中にエラーが発生しました:\n{e}")

        self.btn_run.config(state="normal")


if __name__ == "__main__":
    app = App()
    app.mainloop()