# GPS連動ブラウザゲーム 本番版 バックエンド設計書(案A)

> **最新の実装(as-built)は `docs/06_gameplay_extension.md` §9 と実コード(`server/prisma/schema.prisma` / `server/src/index.js`)を正とする。** 本書 §5(スキーマ案)・§6(API案)は初期設計で実装と一部異なる(例: `dropJson`→`dropItemId`/`dropRate`、`CurrencyLedger`/`/api/master` は未実装、battle/inn/shop/location 等のAPIを追加)。下記『実装済みエンドポイント一覧』参照。

## 1. 文書情報

| 項目 | 内容 |
|---|---|
| 文書名 | 本番版 バックエンド設計書(案A: 現フロント+TS APIサーバー) |
| 対象フェーズ | 本番(ログイン・DB・サーバー権威化) |
| 前提規模 | 趣味レベル / 最大10人程度 |
| 形態 | Web(PWA)・非同期取引・課金なし・日本国内のみ |
| ホスティング | OCI Always Free VM(render.comから変更)。手順は docs/05_oci_setup.md |
| 作成日 | 2026/06/14 |

---

## 2. 設計方針(最重要)

1. **サーバー権威型(server-authoritative)**:戦闘判定・報酬・通貨/アイテムの増減・ペナルティ時刻は、すべて**サーバーが計算してDBに確定**する。クライアントは「攻撃した」「使う」「出品/購入する」という*意図*のみ送信し、結果は表示するだけ。
2. **整合性はDBトランザクションで守る**:特に取引・報酬付与は原子的に処理し、アイテム複製(dupe)を防ぐ。
3. **時刻はサーバー基準**:ペナルティ/クールダウンの期限はサーバー時刻で発行・判定(端末時計の改ざんを無効化)。
4. **段階移行**:現行の静的PWA(バニラJS)を活かし、データ取得先を CSV/localStorage → 自作API へ差し替える。フロント全書き換えはしない。
5. **過剰設計を避ける**:この規模では WebSocket・PostGIS・有償通貨・高度な不正対策は採用しない(将来の拡張余地としてのみ記載)。

---

## 3. システム構成

```text
[ブラウザ(PWA / バニラJS)]
   |  HTTPS (fetch / JSON)
   v
[APIサーバー: TypeScript + Fastify]  ← OCI Always Free VM(常時起動)
   |  Prisma(ORM)
   v
[PostgreSQL]  ← 同一VM上に自前構築(常時起動)
```

- フロントは静的ホスティング(現行GitHub Pages 継続可)または同一APIサーバーから配信。
- API と DB は OCI Always Free VM(VM.Standard.E2.1.Micro / Ubuntu 22.04 / ap-osaka-1)に同居・常時稼働。HTTPSはCaddy(Let's Encrypt)。詳細は docs/05_oci_setup.md。
- 地図タイルは MapTiler 等の正規プロバイダ(APIキー)へ移行。

### 技術スタック

| 層 | 採用 | 補足 |
|---|---|---|
| フロント | 既存 HTML/CSS/バニラJS + PWA化 | Service Worker / manifest を追加 |
| API | JavaScript(CommonJS) + Fastify | 現行実装はJS。TypeScriptへの移行は将来 |
| ORM | Prisma | スキーマ→DB push→型安全クエリ |
| DB | PostgreSQL(OCI VMに自前構築) | トランザクション・行ロックを活用 |
| 認証 | 自作セッション(Cookie)+ Node crypto(scrypt) | 招待コードで新規登録を制限。外部依存なし |
| 地図 | Leaflet + MapTiler タイル | APIキーは環境変数管理 |
| バリデーション | zod | リクエスト検証(型と実行時の両方) |

---

## 4. リポジトリ構成(案)

```text
gps-game/
├─ web/                     # 既存フロント(PWA)
│   ├─ index.html
│   ├─ css/ js/ assets/
│   ├─ manifest.json
│   └─ sw.js               # Service Worker
└─ server/                 # 新規 APIサーバー
    ├─ src/
    │   ├─ index.ts        # Fastify起動
    │   ├─ plugins/        # 認証・DB接続など
    │   ├─ routes/         # auth / player / battle / items / market / spots
    │   ├─ services/       # ビジネスロジック(戦闘・取引など)
    │   ├─ lib/            # prisma client, time, rng, errors
    │   └─ schemas/        # zod スキーマ
    ├─ prisma/
    │   ├─ schema.prisma
    │   ├─ migrations/
    │   └─ seed.ts         # 既存CSVをDBへ投入
    ├─ package.json
    └─ .env.example        # DATABASE_URL, SESSION_SECRET, ...
```

---

## 5. データモデル(Prisma スキーマ案)

```prisma
// prisma/schema.prisma
generator client { provider = "prisma-client-js" }
datasource db { provider = "postgresql"; url = env("DATABASE_URL") }

model User {
  id           String    @id @default(cuid())
  loginId      String    @unique
  passwordHash String
  createdAt    DateTime  @default(now())
  player       Player?
  sessions     Session[]
}

model Session {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  expiresAt DateTime
  createdAt DateTime @default(now())
}

model Player {
  id        String   @id @default(cuid())
  userId    String   @unique
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  name      String
  level     Int      @default(1)
  exp       Int      @default(0)
  hp        Int      @default(100)
  maxHp     Int      @default(100)
  attack    Int      @default(15)
  defense   Int      @default(3)
  gold      Int      @default(0)
  updatedAt DateTime @updatedAt

  items      PlayerItem[]
  spotStates PlayerSpotState[]
  listings   MarketListing[]  @relation("seller")
  battleLogs BattleLog[]
}

// ---- マスタ(管理者が編集・seedで投入) ----
model ItemMaster {
  itemId      String  @id          // 例: item_001
  name        String
  description String  @default("")
  rarity      String  @default("normal")
  type        String  @default("misc")  // consumable / material / collectible ...
  effectJson  Json?                      // 回復量などの効果定義
  basePrice   Int     @default(0)        // 店売り基準価格
  playerItems PlayerItem[]
  listings    MarketListing[]
}

model EnemyMaster {
  enemyId   String @id
  name      String
  hp        Int
  attack    Int
  defense   Int
  image     String @default("")
  dropJson  Json?               // ドロップテーブル
  spots     SpotMaster[]
  battleLogs BattleLog[]
}

model SpotMaster {
  spotId       String  @id
  name         String
  lat          Float
  lng          Float
  radiusM      Int     @default(50)
  enemyId      String
  enemy        EnemyMaster @relation(fields: [enemyId], references: [enemyId])
  rewardItemId String
  penaltyMin   Int     @default(5)
  active       Boolean @default(true)
  spotStates   PlayerSpotState[]
}

// ---- プレイヤーの動的状態 ----
model PlayerItem {
  id       String @id @default(cuid())
  playerId String
  player   Player @relation(fields: [playerId], references: [id], onDelete: Cascade)
  itemId   String
  item     ItemMaster @relation(fields: [itemId], references: [itemId])
  qty      Int    @default(1)
  @@unique([playerId, itemId])   // 1種類1行(スタック)
}

model PlayerSpotState {
  playerId     String
  player       Player @relation(fields: [playerId], references: [id], onDelete: Cascade)
  spotId       String
  spot         SpotMaster @relation(fields: [spotId], references: [spotId])
  penaltyUntil DateTime?    // 敗北ペナルティ期限
  victoryUntil DateTime?    // 撃破クールダウン期限
  @@id([playerId, spotId])
}

// ---- 非同期取引 ----
model MarketListing {
  id        String   @id @default(cuid())
  sellerId  String
  seller    Player   @relation("seller", fields: [sellerId], references: [id])
  itemId    String
  item      ItemMaster @relation(fields: [itemId], references: [itemId])
  qty       Int
  price     Int                       // 総額(gold)
  status    String   @default("open") // open / sold / cancelled
  buyerId   String?
  createdAt DateTime @default(now())
  soldAt    DateTime?
}

// ---- 監査/デバッグ ----
model BattleLog {
  id        String   @id @default(cuid())
  playerId  String
  player    Player   @relation(fields: [playerId], references: [id])
  enemyId   String
  enemy     EnemyMaster @relation(fields: [enemyId], references: [enemyId])
  spotId    String
  result    String   // win / lose
  createdAt DateTime @default(now())
}

// (任意・学習向き)通貨増減の台帳
model CurrencyLedger {
  id        String   @id @default(cuid())
  playerId  String
  delta     Int
  reason    String   // battle_reward / shop_buy / market_sell / inn ...
  createdAt DateTime @default(now())
}
```

### マスタ移行(seed)

既存の `data/spots.csv` / `enemies.csv` / `items.csv` を `prisma/seed.ts` で読み込み、対応マスタへ投入する。これで現行データをそのまま本番DBへ持ち込める。

---

## 6. API 一覧(REST / JSON)

認証は Cookie セッション(httpOnly)。すべて HTTPS 前提。

| メソッド | パス | 概要 | 認証 |
|---|---|---|---|
| POST | /api/auth/register | 招待コード+ID+パスワードで登録 | 不要 |
| POST | /api/auth/login | ログイン(セッション発行) | 不要 |
| POST | /api/auth/logout | ログアウト | 必要 |
| GET  | /api/me | 自プレイヤーの状態取得(HP/gold等) | 必要 |
| GET  | /api/master?version= | マスタ(spots/enemies/items)取得・差分 | 必要 |
| GET  | /api/spot-states | 自分のスポット状態(penalty/victory) | 必要 |
| POST | /api/battle/start | 戦闘開始(対象spot検証→戦闘ID発行) | 必要 |
| POST | /api/battle/resolve | 戦闘確定(サーバーで勝敗計算・報酬付与) | 必要 |
| GET  | /api/inventory | 所持アイテム一覧 | 必要 |
| POST | /api/items/use | アイテム使用(効果適用) | 必要 |
| POST | /api/inn/rest | 宿屋:gold消費でHP全回復+ペナルティ解除 | 必要 |
| GET  | /api/market | 出品一覧 | 必要 |
| POST | /api/market/list | 出品(在庫をエスクローへ) | 必要 |
| POST | /api/market/buy | 購入(原子的に決済+受け渡し) | 必要 |
| POST | /api/market/cancel | 出品取消(在庫を戻す) | 必要 |

### 位置情報の扱い

- 戦闘開始時、クライアントは現在地(lat/lng/accuracy)を送る。サーバーは対象スポットとの距離・精度・active・クールダウンを**サーバー側で再検証**してから戦闘を許可する(クライアントの「範囲内」を信用しない)。
- 位置は判定に使うのみで**永続保存しない**(プライバシー配慮)。必要なら直近のみ一時保持。

---

## 7. 主要フロー設計

### 7.1 認証(Cookieセッション)

```text
register: 招待コード検証 → loginId重複チェック → argon2でhash保存 → Player初期作成
login:    loginId検索 → argon2.verify → Sessionレコード作成 → httpOnly Cookieにsession_id
各API:    Cookieのsession_id → 有効なSession? → userId/ playerId を解決
logout:   Sessionレコード削除
```

- Cookie 属性: `HttpOnly; Secure; SameSite=Lax`。
- セッション有効期限(例: 30日)。期限切れは弾く。
- パスワードは argon2(or bcrypt)。平文・可逆暗号は使わない。

### 7.2 戦闘(サーバー権威)

```text
POST /api/battle/start
  入力: spotId, lat, lng, accuracy
  検証(サーバー):
    - spot.active = true
    - accuracy <= 許容値
    - 現在地⇔spot 距離 <= radiusM
    - penaltyUntil / victoryUntil が無効(期限切れ)
  OK → battleId を発行(対象enemyのステータスを添えて返す)

POST /api/battle/resolve
  入力: battleId(または spotId + 冪等キー)
  処理(サーバー):
    - enemy/playerのステータスでダメージ計算(ロジックはサーバーに移管)
    - 乱数を使う場合はサーバー側RNG
    - 勝敗確定
    - 勝利: reward_item を player_items に加算, gold加算, victoryUntil 設定
    - 敗北: penaltyUntil 設定
    - BattleLog 記録
  返却: 勝敗 / 取得アイテム / 残HP など(クライアントは演出のみ)
```

ポイント:現在の `js/battle.js` の計算は**サーバーの service へ移植**し、クライアントの battle.js は結果表示専用にする。

### 7.3 非同期取引(複製バグ対策の肝)

```text
POST /api/market/list (出品)
  TX {
    player_items から (itemId, qty) を減算(不足ならエラー)
    販売価格・手数料負担(seller/buyer)から buyerPays / sellerReceives / feeAmount を確定
    MarketListing を status=open で作成(=エスクロー、手元から消える)
  }

POST /api/market/buy (購入)
  TX {
    listing を SELECT ... FOR UPDATE で取得・ロック
    listing.status = open を確認(売り切れ/取消なら中断)
    buyer.gold >= listing.buyerPays を確認
    buyer.gold  -= buyerPays
    seller.gold += sellerReceives
    buyer の player_items に (itemId, qty) を加算(無ければ作成)
    listing.status = sold, buyerId, soldAt を更新
    feeAmount > 0 の場合は MarketFeeLedger に手数料を記録
  }  // 途中失敗は全ロールバック

POST /api/market/cancel (取消)
  TX {
    listing(open)を確認
    出品者から取消手数料を徴収
    MarketFeeLedger に手数料を記録
    在庫を出品者へ戻す
    listing.status=cancelled
  }
```

- **冪等キー**:buy リクエストに一意キーを持たせ、再送(電波不安定での二度押し)で二重決済しないようにする。
- **行ロック**:同一listingへの同時購入を直列化。
- すべて単一トランザクション。これが「整合性をDBで守る」核。
- 手数料の初期設定は `MARKET_FEE_FIXED=5`, `MARKET_FEE_RATE=0`。つまり販売価格への割合加算は初期値0%で、固定5Gのみ。
- 取消手数料も初期値は固定5G+0%。取消時は常に売り手負担。
- HUDメニューの「まーけっと」から `かう` / `うる` / `とりけし` を操作する。出品価格の初期値と参考表示は道具屋の買取価格(`floor(basePrice * SELL_RATE)`)。
- 出品時の手数料負担は売り手/買い手を選択できる。売り手負担なら買い手支払総額は販売価格、買い手負担なら販売価格+手数料。
- 現状は全アイテムを出品可能にしている。将来の売れない属性に備え、`MARKET_RESPECT_SELLABLE=true` にすると `ItemMaster.sellable=false` をマーケット出品不可として扱う。
- 探索画面を開いているログイン中プレイヤーには、新規出品を低優先のポーリングでトースト通知する。

### 7.4 宿屋・アイテム使用

```text
POST /api/inn/rest
  TX { gold >= 料金 → gold-=料金; hp=maxHp; 指定spot(または全)penaltyUntil=null }

POST /api/items/use
  TX { 在庫qty>=1 確認 → 効果(effectJson)適用(例: hp回復) → qty-=1(0なら行削除) }
```

---

## 8. フロント移行手順(現PoCから)

| 現状 | 移行後 |
|---|---|
| `csvLoader.js` が CSV を fetch | `apiClient.js` がマスタAPIを取得(version+キャッシュ) |
| `storage.js`(localStorage) | サーバーAPIで読み書き。localStorageは**キャッシュ用途**に格下げ |
| `battle.js` で勝敗計算 | サーバーの `/api/battle/resolve` を呼び、結果を表示 |
| ペナルティ/クールダウンを端末時計で判定 | サーバー発行の期限を表示・残時間計算 |
| 認証なし | ログイン画面+セッションCookie |

- 既存のUI(探索画面・地図・スポット一覧・戦闘画面)はそのまま流用可能。データ源だけ差し替える。
- オフライン地図表示や直近マスタは IndexedDB/localStorage にキャッシュ(version で更新判定)。

---

## 9. PWA / 地図

- `manifest.json`(アイコン・表示名・standalone)と Service Worker(Workbox 推奨)を追加してインストール可能に。
- アプリシェルと地図タイルをキャッシュ。ただし**プレイヤー状態など正データはキャッシュしない**(常にAPI)。
- 地図タイルは MapTiler 等の無料枠+APIキー(OSM公開タイルは本番利用NG)。
- iOS の PWA はバックグラウンドGPS・プッシュ通知が弱い。前面利用前提で設計。

---

## 10. デプロイ / 運用(OCI Always Free)

- Web Service(常時起動)と PostgreSQL を作成。`DATABASE_URL` を環境変数に。
- **接続数が少ない**ため Prisma の接続プールを小さく(例: connection_limit=3〜5)。
- 機密(DB URL、`SESSION_SECRET`)は systemd の Environment または .env(コミット禁止)で管理。地図キーはフロント側でMapTiler+オリジン制限(露出前提)。
- デプロイ手順: `prisma db push`(gameuser に CREATEDB 権限がないため migrate deploy は使わない)→ `seed`(初回) → サーバー起動。
- バックアップ: `pg_dump` を定期取得(無料枠は保持期間が短い)。

---

## 11. セキュリティ(この規模の現実解)

- サーバー権威化(戦闘・通貨・取引)で改ざんを無効化。
- 入力は zod で検証。SQLは Prisma 経由(インジェクション回避)。
- 認証はCookieセッション+argon2。総当たり対策に簡易レート制限。
- 位置偽装(GPSスプーフ)は友達相手なので**深追いしない**。やるなら「異常な移動速度の検知」程度を将来追加。
- 個人情報は最小限(loginIdとhash、名前のみ)。位置は保存しない。簡易プライバシーポリシーを掲示。

---

## 12. 段階的ロードマップ(動かしながら学ぶ)

1. ✅ OCI VMに PostgreSQL + Node20 を導入、Caddy(HTTPS)+ systemd で疎通確認(docs/05参照)。
2. ✅ Prisma schema 定義 → `db push` → 既存CSVを `seed` 投入(enemies=10 / items=10 / spots=37)。
3. ✅ 非同期取引トランザクション実証(`npm run test:trade` で複製なし・整合性OK 確認)。
4. **次** systemd の `gameapi` を本物の Fastify API(`src/index.js`)に差し替え、外部から `/api/health` `/api/me` を確認。
5. 認証(register/login/logout/セッション)実装。
6. `/api/me`・`/api/master`・`/api/spot-states` 実装、フロントの取得先を差し替え。
7. 戦闘をサーバー権威化(`/api/battle/start` `/resolve`)。報酬・ペナルティをサーバー確定に。
8. 在庫・宿屋・アイテム使用API。
9. PWA化・地図タイル移行・仕上げ。

各段で「クライアントを信用しない」「整合性はトランザクションで守る」を徹底する。

---

## 13. 将来拡張(今はやらない)

- リアルタイム対人(WebSocket / 他プレイヤー位置表示)。
- PostGIS による地理検索(スポットが数百〜になったら)。
- 装備・レベルアップ曲線・スキル。
- プッシュ通知(ペナルティ解除・イベント)。
- 有償通貨(導入時は資金決済法・ストア審査・ガチャ規制を要検討)。

---

## 14. 未確定事項 / 要検討

| 項目 | 内容 |
|---|---|
| フロント配信場所 | GitHub Pages 継続か、APIサーバーから同一オリジン配信か(CORS/Cookie が楽なのは同一オリジン) |
| 戦闘の乱数 | サーバーで決定論のままか、乱数を入れるか |
| レベル/経験値設計 | 成長曲線・報酬EXPの値 |
| ドロップテーブル | enemy ごとの確率設計 |
| 宿屋料金 | 固定かレベル連動か(通貨シンクの強さ) |
| マスタ更新運用 | 管理画面を作るか、seed/SQL直編集で回すか |

---

## 実装済みエンドポイント一覧(as-built / 2026-06-15)

- 認証: `POST /api/auth/register|login|logout`, `GET /api/me`(HP/Lv/EXP/gold/毒/戦闘不能/innCostPerLevel 等を返す)
- 位置: `POST /api/location`(散策拾い抽選を内包), `POST /api/location/share`
- 戦闘(ターン制・サーバー権威): `POST /api/battle/start`, `POST /api/battle/action`(attack|useItem), `GET /api/battle/current`(復帰)。※旧 `POST /api/battle`(一括)は残置・未使用
- 回復/状態: `POST /api/item/use`(回復/毒消し), `GET /api/spot-states`(クールダウン)
- 宿屋: `GET /api/inns`, `POST /api/inn/rest`(費用=level×INN_COST_PER_LEVEL)
- 道具屋: `GET /api/shops`, `GET /api/shop/items`, `POST /api/shop/buy`, `POST /api/shop/sell`
- 在庫/マーケット: `GET /api/inventory`, `GET /api/market`, `POST /api/market/list|buy|cancel`
- ヘルス: `GET /api/health`

確定スキーマは `server/prisma/schema.prisma` を正とする(User/Session/Player/ItemMaster/EnemyMaster/SpotMaster/InnMaster/ShopMaster/PlayerItem/PlayerSpotState/MarketListing/BattleLog/BattleSession)。各機能の確定挙動・パラメータは `docs/06_gameplay_extension.md` §9。
