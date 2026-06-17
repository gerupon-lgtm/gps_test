import configparser
import csv
import json
import os
import re
import tkinter as tk
from tkinter import filedialog, messagebox, scrolledtext

import googlemaps
import requests

from output_format import (
    POSTAL_AREA_HEADERS,
    build_master_row,
    build_postal_area_rows,
    get_output_config,
)


CONFIG_FILE = "config.ini"
INPUT_ENCODINGS = ["utf-8-sig", "utf-8", "cp932"]
POSTAL_AREAS_FILENAME = "postalAreas.csv"
MASTER_TYPE_LABELS = {
    "spots": "スポット",
    "inns": "宿屋",
    "shops": "道具屋",
}


def load_api_key():
    config = configparser.ConfigParser()
    if not os.path.exists(CONFIG_FILE):
        config["SETTINGS"] = {"GOOGLE_MAPS_API_KEY": "YOUR_API_KEY_HERE"}
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            config.write(f)
        messagebox.showerror(
            "エラー",
            "config.ini を作成しました。GOOGLE_MAPS_API_KEY を設定して再起動してください。",
        )
        raise SystemExit(1)

    config.read(CONFIG_FILE, encoding="utf-8")
    api_key = config.get("SETTINGS", "GOOGLE_MAPS_API_KEY", fallback="")
    if not api_key or api_key == "YOUR_API_KEY_HERE":
        messagebox.showerror("エラー", "config.ini に有効な GOOGLE_MAPS_API_KEY を設定してください。")
        raise SystemExit(1)
    return api_key


API_KEY = load_api_key()
gmaps = googlemaps.Client(key=API_KEY)


def extract_location_hint(filename):
    """Extract a Japanese prefecture/city hint from the filename when possible."""
    pattern = r"([一-龥]+[都道府県])?([一-龥]+[市区町村])"
    match = re.search(pattern, filename)
    if match:
        return match.group(0)
    return ""


def get_coordinates(facility_name, location_hint, app_instance):
    """Fetch latitude and longitude from Google Maps Geocoding API."""
    search_query = f"{location_hint} {facility_name}".strip()
    try:
        geocode_result = gmaps.geocode(search_query, language="ja")
        if geocode_result:
            location = geocode_result[0]["geometry"]["location"]
            return location["lat"], location["lng"]
    except Exception as e:
        app_instance.log(f"  Google API エラー ({facility_name}): {e}")
        return None, None
    return None, None


def get_gsi_info(val1, val2, app_instance):
    """Fetch muniCd and area name from the GSI reverse geocoder."""
    try:
        num1 = float(val1)
        num2 = float(val2)
        lng = max(num1, num2)
        lat = min(num1, num2)
        url = f"https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress?lat={lat}&lon={lng}"
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        }

        response = requests.get(url, headers=headers, timeout=10)
        if response.status_code == 200:
            data = json.loads(response.text.strip())
            if data and "results" in data:
                results = data["results"]
                muni_cd = results.get("muniCd", "")
                lv01_nm = results.get("lv01Nm", "")
                return f"{muni_cd}:{lv01_nm}"
    except Exception as e:
        app_instance.log(f"  国土地理院APIエラー: {e}")
    return ":"


def get_postal_area_output_path(spot_output_file_path):
    return os.path.join(os.path.dirname(spot_output_file_path), POSTAL_AREAS_FILENAME)


class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("施設座標CSV作成ツール")
        self.geometry("680x560")
        self.input_file_path = ""
        self.master_type = tk.StringVar(value="spots")
        self.var_hint = tk.StringVar()
        self.create_widgets()

    def create_widgets(self):
        frame_file = tk.Frame(self)
        frame_file.pack(pady=10, fill="x", padx=10)

        self.lbl_file = tk.Label(
            frame_file,
            text="入力ファイルを選択してください",
            anchor="w",
            bg="white",
            relief="sunken",
        )
        self.lbl_file.pack(side="left", fill="x", expand=True, padx=5)

        btn_browse = tk.Button(frame_file, text="ファイル選択", command=self.browse_file)
        btn_browse.pack(side="right", padx=5)

        frame_type = tk.LabelFrame(self, text="出力種別")
        frame_type.pack(pady=5, fill="x", padx=10)
        for value, label in MASTER_TYPE_LABELS.items():
            tk.Radiobutton(
                frame_type,
                text=label,
                value=value,
                variable=self.master_type,
                command=self.update_default_info,
            ).pack(side="left", padx=10, pady=4)

        self.lbl_defaults = tk.Label(self, anchor="w")
        self.lbl_defaults.pack(pady=2, fill="x", padx=12)
        self.update_default_info()

        frame_hint = tk.Frame(self)
        frame_hint.pack(pady=5, fill="x", padx=10)
        tk.Label(frame_hint, text="検索ヒント:").pack(side="left")
        self.entry_hint = tk.Entry(frame_hint, textvariable=self.var_hint)
        self.entry_hint.pack(side="left", fill="x", expand=True, padx=5)

        self.btn_run = tk.Button(
            self,
            text="処理開始（管理アプリ用CSVをCP932で出力）",
            command=self.execute_processing,
            state="disabled",
            bg="#4CAF50",
            fg="white",
        )
        self.btn_run.pack(pady=10)

        tk.Label(self, text="処理ログ:").pack(anchor="w", padx=10)
        self.log_area = scrolledtext.ScrolledText(self, height=18)
        self.log_area.pack(fill="both", expand=True, padx=10, pady=5)

    def update_default_info(self):
        master_type = self.master_type.get()
        if master_type == "spots":
            text = (
                "スポット既定値: radiusM=30, enemyId=enemy_001, "
                "rewardItemId=item_001, penaltyMin=3, active=true。"
                "地域CSV postalAreas.csv も出力します。"
            )
        else:
            text = f"{MASTER_TYPE_LABELS[master_type]}既定値: radiusM=50, active=true"
        self.lbl_defaults.config(text=text)

    def log(self, message):
        self.log_area.insert(tk.END, message + "\n")
        self.log_area.see(tk.END)
        self.update_idletasks()

    def browse_file(self):
        file_path = filedialog.askopenfilename(
            filetypes=[("Text/CSV files", "*.txt *.csv"), ("All files", "*.*")]
        )
        if not file_path:
            return

        self.input_file_path = file_path
        self.lbl_file.config(text=file_path)

        filename = os.path.basename(file_path)
        hint = extract_location_hint(filename)
        self.var_hint.set(hint)

        self.log(f"ファイルを選択しました: {filename}")
        if hint:
            self.log(f"検索ヒントを自動設定しました: {hint}")
        else:
            self.log("ファイル名から地名を抽出できませんでした。必要なら検索ヒントを入力してください。")

        self.btn_run.config(state="normal")

    def read_facility_list(self):
        for enc in INPUT_ENCODINGS:
            try:
                with open(self.input_file_path, "r", encoding=enc) as f:
                    return [line.strip() for line in f if line.strip()]
            except UnicodeDecodeError:
                continue
        return []

    def execute_processing(self):
        master_type = self.master_type.get()
        output_file_path = filedialog.asksaveasfilename(
            defaultextension=".csv",
            filetypes=[("CSV files", "*.csv")],
            initialfile=f"{master_type}.csv",
        )
        if not output_file_path:
            return

        self.btn_run.config(state="disabled")
        self.log("\n--- 処理を開始します ---")
        self.log(f"出力種別: {MASTER_TYPE_LABELS[master_type]}")

        location_hint = self.var_hint.get()

        try:
            facility_list = self.read_facility_list()
            if not facility_list:
                self.log("エラー: ファイルを読み込めないか、空ファイルです。")
                return

            output_rows = []
            gsi_infos = []
            for facility in facility_list:
                facility_clean = facility.split(",")[0].strip()
                lat, lng = get_coordinates(facility_clean, location_hint, self)

                if lat is None or lng is None:
                    self.log(f"  位置特定失敗: {facility_clean}")
                    output_rows.append(build_master_row(master_type, facility_clean, "", "", ":"))
                    continue

                self.log(f"  座標取得成功: {facility_clean} -> 緯度:{lat}, 経度:{lng}")
                gsi_info = get_gsi_info(lat, lng, self)
                self.log(f"  住所コード取得結果: {gsi_info}")
                if master_type == "spots":
                    gsi_infos.append(gsi_info)
                output_rows.append(build_master_row(master_type, facility_clean, lat, lng, gsi_info))

            with open(output_file_path, "w", newline="", encoding="cp932", errors="replace") as f:
                writer = csv.writer(f)
                writer.writerow(get_output_config(master_type).headers)
                writer.writerows(output_rows)

            self.log(f"ファイルを出力しました: {output_file_path}")
            if master_type == "spots":
                postal_area_rows = build_postal_area_rows(gsi_infos)
                postal_area_path = get_postal_area_output_path(output_file_path)
                with open(postal_area_path, "w", newline="", encoding="cp932", errors="replace") as f:
                    writer = csv.writer(f)
                    writer.writerow(POSTAL_AREA_HEADERS)
                    writer.writerows(postal_area_rows)
                self.log(f"地域ファイルを出力しました: {postal_area_path} ({len(postal_area_rows)}件)")

            self.log("--- 処理完了 ---")
            messagebox.showinfo("完了", "CSVファイルの出力が完了しました。")
        except Exception as e:
            self.log(f"致命的なエラーが発生しました: {e}")
            messagebox.showerror("エラー", f"処理中にエラーが発生しました:\n{e}")
        finally:
            self.btn_run.config(state="normal")


if __name__ == "__main__":
    app = App()
    app.mainloop()
