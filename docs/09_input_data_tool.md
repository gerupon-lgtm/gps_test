# 入力データ作成ツール

`入力データ作成/app.py` は、施設名リストから Google Maps Geocoding API で座標を取得し、管理アプリに取り込めるCSVを作成するローカルGUIツールです。

## 入力

- 1行に1施設名を書くテキストまたはCSVを選択します。
- CSVの場合は先頭列を施設名として使います。
- 文字コードは UTF-8 BOM付き、UTF-8、CP932 の順で読み込みます。
- ファイル名から市区町村名を抽出できた場合は検索ヒントに自動入力します。

## 出力種別

画面の出力種別で以下を選択できます。

| 種別 | 出力ファイル初期名 | 管理アプリの取り込み先 |
|---|---|---|
| スポット | `spots.csv` | スポット |
| 宿屋 | `inns.csv` | 宿屋 |
| 道具屋 | `shops.csv` | 道具屋 |

出力文字コードは CP932 です。管理アプリ側ではCSV文字コードに `SJIS` を選んで取り込みます。

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

## 既定値

| 種別 | 既定値 |
|---|---|
| スポット | `radiusM=30`, `enemyId=enemy_001`, `rewardItemId=item_001`, `penaltyMin=3`, `active=true` |
| 宿屋 | `radiusM=50`, `active=true` |
| 道具屋 | `radiusM=50`, `active=true` |

ID列は空欄で出力します。管理アプリのCSVプレビュー時に、既存IDの最大番号から次の `spot_00001` / `inn_00001` / `shop_00001` 形式のIDが自動採番されます。

スポットでは国土地理院の逆ジオコーディング結果から `muniCd`, `areaName`, `areaKey` を設定します。宿屋と道具屋では管理アプリのマスタ項目に合わせて地域情報列は出力しません。
