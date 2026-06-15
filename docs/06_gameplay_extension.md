# ゲームプレイ拡張 設計書(#2拡張 / 2026-06-15)

戦闘のターン制化、毒、レベル/経験値、ゴールド、ドロップ、散策取得、道具屋を追加する設計。
原則は既存どおり **サーバー権威**(重要な数値・乱数・報酬はサーバーが確定)、**位置偽装対策はしない**(spotId/innId/shopId を信頼)、**死亡概念なし**(HPは戦闘敗北でのみ0、毒では最低1)。

本書は `specification.md` / `design.md` / `04_backend_design.md` の該当箇所を拡張・上書きする最新仕様とする。

---

## 1. データモデル変更(Prisma)

### Player(追加)
| フィールド | 型 | 用途 |
|---|---|---|
| level | Int @default(1) | 既存 |
| exp | Int @default(0) | 既存。累積経験値 |
| poisoned | Boolean @default(false) | 毒状態か |
| poisonTickAt | DateTime? | 毒の最終tick基準時刻(遅延計算の起点) |
| downedUntil | DateTime? | 戦闘不能の解除時刻(グローバル)。これを過ぎたら回復して復帰 |
| lastPickupAt | DateTime? | 散策拾いのクールダウン基準 |

※ 既存の `healAt` は `downedUntil` に役割統合(敗北→戦闘不能→回復)。`hp/maxHp/attack/defense` は既存。

### ItemMaster(追加)
| フィールド | 型 | 用途 |
|---|---|---|
| category | String @default("misc") | heal / antidote / material / currency / collectible |
| healAmount | Int @default(0) | 既存。HP回復量 |
| curePoison | Boolean @default(false) | 使用で毒解除するか |
| basePrice | Int @default(0) | 既存。道具屋の買値。売値は basePrice×SELL_RATE |
| sellable | Boolean @default(true) | 道具屋で売れるか |

### EnemyMaster(追加)
| フィールド | 型 | 用途 |
|---|---|---|
| expBase | Int @default(0) | 基本経験値 |
| goldBase | Int @default(0) | 基本ゴールド |
| dropItemId | String? | 確率ドロップ品(任意) |
| dropRate | Float @default(0) | ドロップ率(0〜1) |
| poisonChance | Float @default(0) | 毒付与率(0〜1) |

### 新規 ShopMaster(InnMaster と同型)
`shopId / name / lat / lng / radiusM`。

### 新規 BattleSession(ターン制の状態保持)
`id / playerId(@unique=同時1戦闘) / spotId / enemyId / enemyHp / turn / poisonApplied(Boolean) / status("active"|"won"|"lost") / createdAt`。
プレイヤーHPは戦闘中も `Player.hp` を直接更新(離脱してもダメージは残る=整合)。

### データCSV
- `enemies.csv`:`exp_base, gold_base, drop_item_id, drop_rate, poison_chance` 列を追加。
- `items.csv`:`category, cure_poison, price, sellable` 列を追加。**「どくけしそう」を新規追加**(category=antidote, cure_poison=true)。回復系(ポーション等)に price 設定。
- 新規 `shops.csv`:`shop_id, shop_name, latitude, longitude, radius_meters`。
- レベル成長は数式(CSV不要)。

---

## 2. 戦闘(ターン制・サーバー権威)

一括解決を廃し、ターンごとにサーバーへ行動を送る方式へ。

### エンドポイント
- `POST /api/battle/start { spotId }`
  - 検証:`downedUntil` が未来 → 409「戦闘不能中」。対象スポットの `victoryUntil` 中 → 409。既に active セッション → それを返す。
  - 敵マスタを取得し `BattleSession` 作成(enemyHp=enemy.hp)。返却:sessionId, 敵情報, playerHp/maxHp, 毒状態。
- `POST /api/battle/action { action: "attack" | "useItem", itemId? }`
  - **attack**:プレイヤー攻撃 → 敵HP減 → 敵が生存なら敵の反撃(`poisonChance` で被毒判定→`poisoned=true`)。
  - **useItem**:回復系のみ。HP回復 or 毒解除を適用し1個消費(これがそのターンのプレイヤー行動)→ 敵の反撃。
  - 返却:`{ logs[], playerHp, enemyHp, poisoned, finished, result }`。1アクション=1ターン。
- `GET /api/battle/current`:リロード復帰用。active セッションがあれば状態を返す。
- (任意) `POST /api/battle/flee`:逃走。今回は未実装(後日)。

### 勝利時(サーバーで確定)
1. EXP付与:`expBase × (1 ± rand·BONUS_RANGE)` を加算 → **レベルアップ判定**(下記)。
2. ゴールド付与:`goldBase × (1 ± rand·BONUS_RANGE)`。
3. 報酬:スポット固定 `rewardItemId` を確定付与 ＋ 敵 `dropItemId` を `dropRate` で確率付与(併用)。
4. `victoryUntil = now + VICTORY_COOLDOWN_MIN`。`BattleLog` 記録、セッション status="won"。

### 敗北時
- `Player.hp = 0`、`downedUntil = now + DOWNED_MIN`、セッション status="lost"。

### レベルアップ(数式)
- 必要EXP(Lv→Lv+1) = `level × LEVEL_EXP_FACTOR`(既定100)。
- `exp` がしきい値以上の間ループ:`level++`、`maxHp += LV_HP`(既定10)、`attack += LV_ATK`(既定2)、`defense += LV_DEF`(既定1)、`hp = maxHp`(全回復)。

---

## 3. 状態異常:毒

- **付与**:戦闘で敵の反撃時に `poisonChance` で `poisoned=true`、`poisonTickAt=now`。
- **持続**:治すまで継続(自然消滅なし)。
- **ダメージ(遅延計算)**:読み取り時(`/api/me`・戦闘・各API)に `ticks = floor((now - poisonTickAt)/POISON_INTERVAL_SEC)` を計算し、`hp = max(1, hp - ticks×POISON_DMG)`、`poisonTickAt += ticks×interval`。**最低HP1**(毒で戦闘不能にはならない)。アプリ非起動中も時間は進む。
- **解除**:`curePoison` アイテム使用、または宿屋。`poisoned=false`、`poisonTickAt=null`。
- **救済**:毒状態中は散策拾い/ドロップで **antidote(どくけしそう)の抽選比率を上げる**(既定2倍)。

---

## 4. 散策中の取得 + 敵ドロップ

### 散策拾い(`POST /api/location` 内で抽選)
- 条件:`downedUntil` 中は対象外。`lastPickupAt` から `PICKUP_COOLDOWN_MIN`(既定5分)未満は抽選しない。
- 抽選:基本確率 `PICKUP_BASE_RATE`(既定0.03)で回復系アイテムを1個付与。毒中は antidote 比率UP。付与したら `lastPickupAt=now`。
- 返却:位置報告のレスポンスに `pickup`(取得アイテム or null)を含め、クライアントが通知表示。

### 敵ドロップ
- 勝利時に上記2-勝利の手順で `dropRate` 抽選。
- **散策拾いのクールダウンは敵ドロップには適用しない**。敵は常に同じ `dropRate` でドロップ判定する(毒中の antidote ブーストもドロップには適用せず、散策拾いのみ)。

---

## 5. 道具屋(フィールド地点)

- `shops.csv`/`ShopMaster` で固定地点。近接で売買UI(宿屋と同様、サーバーは shopId を信頼)。
- **宿屋・道具屋はマップ上にアイコン(マーカー)表示する**(敵スポットは従来どおり地図に出さない方針を維持)。既存の宿屋にもマーカーを追加する。
- `GET /api/shops`:一覧。
- `POST /api/shop/buy { shopId, itemId, qty }`:`gold >= price×qty` を検証し決済、在庫へ加算。回復系は在庫無限。
- `POST /api/shop/sell { itemId, qty }`:`sellable` のみ。所持数検証 → 消費し `floor(basePrice×SELL_RATE)×qty` を加算。
- すべて1トランザクション。

---

## 6. 戦闘不能(グローバル)

- 敗北で `hp=0` かつ `downedUntil` セット。**全スポットで戦闘不可**、かつ **クールダウン中は散策拾いも対象外**。
- フロントはオーバーレイで「戦闘不能・残り◯◯秒」を**秒数でカウントダウン表示**。
- `downedUntil` 経過時(遅延適用):`hp = round(maxHp × DEFEAT_HEAL_PERCENT)`(既定30%)、`downedUntil=null`。以後復帰。

---

## 7. チューニング(server/.env)

```
VICTORY_COOLDOWN_MIN=60     # 勝利後の敵再出現待ち(分)
DOWNED_MIN=1              # 戦闘不能の継続(分)。初期は1分
DEFEAT_HEAL_PERCENT=0.3    # 戦闘不能明けの回復(MAX割合)
BONUS_RANGE=0.2           # EXP/ゴールドのランダム幅(±20%)
LEVEL_EXP_FACTOR=100      # 必要EXP = level×factor
LV_HP=10  LV_ATK=2  LV_DEF=1   # レベルアップの成長量
POISON_INTERVAL_SEC=30    # 毒ダメージ間隔(秒)
POISON_DMG=1             # 毒の1tickダメージ
PICKUP_BASE_RATE=0.03     # 散策拾いの基本確率
PICKUP_COOLDOWN_MIN=5     # 散策拾いのクールダウン(分)
ANTIDOTE_BOOST=2         # 毒中の antidote 抽選倍率
SELL_RATE=0.5            # 道具屋の売値(basePrice比)
BATTLE_USE_RANDOM=false   # 戦闘ダメージに乱数を使うか
```

---

## 8. 段階実装プラン

1. **Phase A: データモデル**
   スキーマ(Player/ItemMaster/EnemyMaster/ShopMaster/BattleSession)、CSV列追加、どくけしそう/shops.csv、seed更新。
2. **Phase B: ターン制戦闘 + レベル/EXP/ゴールド/ドロップ**
   `/api/battle/start|action|current`、勝利報酬一式、敗北→戦闘不能。フロント戦闘UIをターン制+「アイテム使用」へ。
3. **Phase C: 毒**
   付与・遅延ダメージ・解除・/api/me反映、戦闘UIの毒表示。
4. **Phase D: 戦闘不能オーバーレイ**
   グローバル封鎖・残り時間表示・回復復帰、散策抽選の除外。
5. **Phase E: 散策拾い + 道具屋**
   位置報告抽選、`shops.csv`、買売API、近接UI。
6. **Phase F: 仕上げ・調整**
   バランス(.env)調整、ドキュメント反映、検証。

各Phaseごとに「サーバー→フロント→VMデプロイ→動作確認」を回す。
