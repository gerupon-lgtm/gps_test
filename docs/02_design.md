# GPS連動ブラウザゲーム 検証版 設計書

## 1. 文書情報

| 項目 | 内容 |
|---|---|
| 文書名 | GPS連動ブラウザゲーム 検証版 設計書 |
| 対象フェーズ | PoC / 技術検証 |
| 作成日 | 2026/06/13 |
| 現行補足 | 2026/06/18時点の詳細なas-built設計は `04_backend_design.md` / `06_gameplay_extension.md` を正とする |

---

## 1.1 現行構成との差分メモ

本書はPoC開始時のフロント単体設計を残す。現行版では以下の構成に拡張されている。

```text
静的フロント(index.html/css/js/assets/data)
  ↓ same-origin fetch
Node.js/Fastify API(server/)
  ↓ Prisma
PostgreSQL

管理Webアプリ(game-admin/)
  ↓ Prisma
PostgreSQL
```

現行の主な設計差分:

- 認証はCookieセッションで管理する。
- 戦闘、報酬、HP/毒/レベル、宿屋、道具屋、マーケットはサーバー権威で処理する。
- `Player.defeatedSpots` と `PlayerSpotState.victoryUntil` で撃破履歴とクールダウンを扱う。
- スポット一覧では、永続履歴に基づく「撃破済み」バッジと、クールダウン中の「撃破済み 残り○分」を表示する。
- マーケットは `MarketListing` と `MarketFeeLedger` で出品・決済・手数料を管理する。
- 今後のNPCは、施設ではなく独立マスタとして扱い、ランダム出現結果と回復/販売などの効果はサーバー側で確定する方針。

---

## 2. システム構成

```text
GitHub Repository
  ├─ index.html
  ├─ css/
  │   └─ style.css
  ├─ js/
  │   ├─ app.js
  │   ├─ geo.js
  │   ├─ csvLoader.js
  │   ├─ distance.js
  │   ├─ battle.js
  │   └─ storage.js
  └─ data/
      ├─ spots.csv
      ├─ enemies.csv
      └─ items.csv
```

GitHub Pagesで公開し、ブラウザ側JavaScriptのみで動作させる。

---

## 3. アーキテクチャ方針

| 項目 | 方針 |
|---|---|
| フロントエンド | HTML / CSS / JavaScript |
| バックエンド | なし |
| データ | CSVをfetchで取得 |
| 状態保存 | localStorage |
| 位置情報 | Geolocation API |
| 地図表示 | 検証版ではなし |
| ビルド | 原則不要 |
| 配信 | GitHub Pages |

---

## 4. モジュール設計

### 4.1 app.js

アプリ全体の初期化と画面遷移を管理する。

主な責務:

- 初期表示
- CSV読み込み
- Geolocation開始
- 探索状態の更新
- 戦闘画面への切り替え
- アイテム画面の表示

### 4.2 geo.js

位置情報取得を担当する。

主な関数案:

```javascript
startWatchPosition(onSuccess, onError)
stopWatchPosition()
```

位置情報オプション案:

```javascript
{
  enableHighAccuracy: true,
  timeout: 10000,
  maximumAge: 5000
}
```

### 4.3 csvLoader.js

CSVファイルを読み込み、JavaScriptオブジェクト配列へ変換する。

主な関数案:

```javascript
loadCsv(path)
parseCsv(text)
loadGameData()
```

### 4.4 distance.js

緯度経度間の距離計算を担当する。

主な関数案:

```javascript
calculateDistanceMeters(lat1, lng1, lat2, lng2)
findNearestSpot(currentPosition, spots)
findEnterableSpot(currentPosition, spots, accuracy)
```

### 4.5 battle.js

簡易戦闘処理を担当する。

主な関数案:

```javascript
createBattleState(enemy)
attackEnemy(battleState)
attackPlayer(battleState)
judgeBattleResult(battleState)
```

### 4.6 storage.js

localStorageへの保存・読み込みを担当する。

主な関数案:

```javascript
saveItem(itemRecord)
getItems()
savePenalty(spotId, retryAt)
getPenalty(spotId)
isPenaltyActive(spotId)
clearDebugData()
```

---

## 5. データ設計

### 5.1 spots.csv

```csv
spot_id,spot_name,latitude,longitude,radius_meters,enemy_id,reward_item_id,penalty_minutes,active
spot_001,テスト地点A,35.681236,139.767125,50,enemy_001,item_001,5,true
```

### 5.2 enemies.csv

```csv
enemy_id,enemy_name,hp,attack,defense,image
enemy_001,テストスライム,30,8,2,assets/enemy_slime.png
```

### 5.3 items.csv

```csv
item_id,item_name,description,rarity
item_001,テストポーション,検証用アイテム,normal
```

### 5.4 localStorage設計

#### 所持アイテム

キー:

```text
gps_game_items
```

値:

```json
[
  {
    "itemId": "item_001",
    "spotId": "spot_001",
    "acquiredAt": "2026-06-13T12:00:00+09:00"
  }
]
```

#### ペナルティ

キー:

```text
gps_game_penalties
```

値:

```json
{
  "spot_001": {
    "retryAt": "2026-06-13T12:05:00+09:00"
  }
}
```

---

## 6. 主要処理フロー

### 6.1 初期化フロー

```text
ページ表示
  ↓
CSV読み込み
  ↓
localStorage読み込み
  ↓
開始ボタン表示
  ↓
ユーザーが開始ボタン押下
  ↓
位置情報取得許可
  ↓
watchPosition開始
  ↓
探索画面更新
```

### 6.2 敵出現判定フロー

```text
位置情報更新
  ↓
accuracyを確認
  ↓
accuracyが許容値を超える場合は判定保留
  ↓
spots.csvの有効地点を走査
  ↓
現在地との距離を計算
  ↓
radius_meters以内の地点を抽出
  ↓
複数ある場合は最寄りを選択
  ↓
ペナルティ中でないか確認
  ↓
敵出現
```

### 6.3 戦闘フロー

```text
敵出現
  ↓
戦闘開始ボタン押下
  ↓
プレイヤー攻撃
  ↓
敵HP減少
  ↓
敵HP <= 0 なら勝利
  ↓
敵が生存していれば敵攻撃
  ↓
プレイヤーHP減少
  ↓
プレイヤーHP <= 0 なら敗北
  ↓
勝敗がつくまで繰り返し
```

---

## 7. 距離計算設計

Haversine式を使用し、緯度経度から地表距離をメートルで算出する。

疑似コード:

```javascript
function calculateDistanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = deg => deg * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
    Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
```

---

## 8. エラー設計

| エラー | 表示内容 | 対応 |
|---|---|---|
| 位置情報未許可 | 位置情報が許可されていません | ブラウザ設定確認を案内 |
| 位置情報取得失敗 | 現在地を取得できませんでした | 再試行ボタン表示 |
| GPS精度不足 | 位置精度が低いため判定を保留しています | 屋外移動や再取得を案内 |
| CSV読み込み失敗 | データファイルを読み込めませんでした | ファイルパス確認 |
| 敵定義なし | 敵データが見つかりません | CSV整合性確認 |
| アイテム定義なし | アイテムデータが見つかりません | CSV整合性確認 |

---

## 9. セキュリティ・不正対策

検証版では、以下を割り切りとする。

- localStorageはユーザーが変更できる。
- CSVは公開ファイルとして閲覧可能。
- 位置情報の偽装対策は行わない。
- 勝敗結果の改ざん対策は行わない。

本番版で検討すべき対策:

- ユーザー認証
- サーバー側での戦闘結果保存
- サーバー側でのペナルティ管理
- アイテム取得履歴のDB保存
- 異常な移動速度の検知
- GPS精度・連続取得履歴の検証
- 座標リストの非公開化

---

## 10. GitHub Pages配置時の注意

- `index.html` を公開ソースのルートに配置する。
- CSVファイルは `data/` 配下に配置する。
- `fetch('./data/spots.csv')` のような相対パスで読み込む。
- GitHub Pagesは静的サイトであり、サーバーサイド言語は使えない。
- CSVは公開URLから直接アクセス可能になる。
- Geolocation APIを使うため、HTTPSでアクセスする。
- 独自ドメイン利用時はHTTPS有効化を確認する。

---

## 11. ディレクトリ案

```text
gps-location-game-poc/
  ├─ index.html
  ├─ README.md
  ├─ .nojekyll
  ├─ css/
  │   └─ style.css
  ├─ js/
  │   ├─ app.js
  │   ├─ geo.js
  │   ├─ csvLoader.js
  │   ├─ distance.js
  │   ├─ battle.js
  │   └─ storage.js
  ├─ data/
  │   ├─ spots.csv
  │   ├─ enemies.csv
  │   └─ items.csv
  └─ docs/
      ├─ 01_specification.md
      ├─ 02_design.md
      └─ 03_test-plan.md
```
