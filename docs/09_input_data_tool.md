# 入力データ作成ツール

`入力データ作成/app.py` は、施設名リストから管理アプリ取り込み用CSVを作成するローカルGUIツールです。

スポット、宿屋、道具屋の候補施設名を入力し、Google Maps Geocoding APIで座標を取得します。スポット出力時は国土地理院の逆ジオコーディングAPIで地域情報も取得し、スポットCSVに加えて地域マスタCSVも出力します。

## 技術構成

| 項目 | 内容 |
|---|---|
| 開発言語 | Python |
| GUI | Tkinter |
| CSV処理 | Python標準ライブラリ `csv` |
| 設定ファイル | Python標準ライブラリ `configparser` |
| HTTP通信 | `requests` |
| Google Maps | `googlemaps` |
| exe化 | PyInstaller |

## 使用API

| API | 用途 |
|---|---|
| Google Maps Geocoding API | 施設名と検索ヒントから緯度、経度、郵便番号を取得 |
| 国土地理院 逆ジオコーディングAPI | 緯度経度から `muniCd` と `areaName` を取得 |

郵便番号はGoogle Maps Geocoding APIの `address_components` に `postal_code` が含まれる場合に出力します。取得できない場合は空欄にします。

## 設定

初回起動時に `config.ini` がない場合は雛形を作成して終了します。以下の形式でGoogle Maps APIキーを設定してください。

```ini
[SETTINGS]
GOOGLE_MAPS_API_KEY=YOUR_API_KEY_HERE
```

## 入力

- 1行に1施設名を書くテキストまたはCSVを選択します。
- CSVの場合は先頭列を施設名として使います。
- 入力文字コードは UTF-8 BOM付き、UTF-8、CP932 の順で読み込みます。
- ファイル名から市区町村名を抽出できた場合は検索ヒントに自動入力します。
- 検索ヒントは画面上で手動編集できます。

## 出力種別

画面の出力種別で以下を選択できます。

| 種別 | 出力ファイル初期名 | 管理アプリの取り込み先 |
|---|---|---|
| スポット | `spots.csv` | スポット |
| 宿屋 | `inns.csv` | 宿屋 |
| 道具屋 | `shops.csv` | 道具屋 |

出力文字コードは CP932 です。管理アプリ側ではCSV文字コードに `SJIS` を選んで取り込みます。

スポットを出力した場合は、同じ保存先フォルダに地域マスタ取り込み用の `postalAreas.csv` も出力します。

## 出力列

スポット:

```csv
spotId,name,lat,lng,radiusM,postalCode,muniCd,areaName,areaKey,enemyId,rewardItemId,penaltyMin,active
```

宿屋:

```csv
innId,name,lat,lng,radiusM,active
```

道具屋:

```csv
shopId,name,lat,lng,radiusM,active
```

地域:

```csv
areaKey,postalCode,muniCd,areaName,regionName,active
```

## 既定値

| 種別 | 既定値 |
|---|---|
| スポット | `radiusM=30`, `enemyId=enemy_001`, `rewardItemId=item_001`, `penaltyMin=3`, `active=true` |
| 宿屋 | `radiusM=50`, `active=true` |
| 道具屋 | `radiusM=50`, `active=true` |

ID列は空欄で出力します。管理アプリのCSVプレビュー時に、既存IDの最大番号から次の `spot_00001` / `inn_00001` / `shop_00001` 形式のIDが自動採番されます。

## 郵便番号と地域情報

スポットCSVでは、Google Maps Geocoding APIから取得できた郵便番号を `postalCode` に出力します。取得できない場合は空欄です。

スポットCSVでは、国土地理院の逆ジオコーディング結果から以下を設定します。

| 列 | 内容 |
|---|---|
| `muniCd` | 市区町村コード |
| `areaName` | 町丁目名など |
| `areaKey` | `muniCd:areaName` |

`postalAreas.csv` には、スポット出力時に取得できた地域情報を `areaKey` 単位で重複排除して出力します。

| 列 | 内容 |
|---|---|
| `areaKey` | `muniCd:areaName` |
| `postalCode` | その地域が最初に出現したスポットの郵便番号。取得できない場合は空欄 |
| `muniCd` | 市区町村コード |
| `areaName` | 町丁目名など |
| `regionName` | `areaName` と同じ値 |
| `active` | `true` |

地域情報が取得できなかったスポットは `postalAreas.csv` には含めません。

宿屋と道具屋は、管理アプリのマスタ項目に郵便番号・地域情報列がないため、郵便番号や地域情報は出力しません。

## ビルド方法

PowerShellで以下を実行します。

```powershell
cd "C:\Users\gerupon\Claude\Projects\位置げー検証\入力データ作成"
pyinstaller --clean --noconfirm app.spec
```

`app.spec` を使わずに直接ビルドする場合:

```powershell
cd "C:\Users\gerupon\Claude\Projects\位置げー検証\入力データ作成"
pyinstaller --onefile --windowed --name app app.py
```

ビルド後のexeは通常以下に作成されます。

```text
C:\Users\gerupon\Claude\Projects\位置げー検証\入力データ作成\dist\app.exe
```

## 検証

フォーマット生成の単体テスト:

```powershell
cd "C:\Users\gerupon\Claude\Projects\位置げー検証\入力データ作成"
python -m unittest test_output_format.py
```

構文チェック:

```powershell
cd "C:\Users\gerupon\Claude\Projects\位置げー検証\入力データ作成"
python -m py_compile app.py output_format.py test_output_format.py
```
