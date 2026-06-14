# server — GPS連動ブラウザゲーム API(案A)

Fastify + Prisma + PostgreSQL。サーバー権威型で、戦闘・通貨・取引の整合性はDBトランザクションで担保する。デプロイ簡易化のためビルド不要の素のNode(CommonJS)。

## セットアップ(VM上)

```bash
cd /home/ubuntu/app/server     # 配置先(git clone等)
cp .env.example .env           # DATABASE_URL / SESSION_SECRET / INVITE_CODE を設定
npm ci                         # 依存導入(prisma含む)
npx prisma generate            # Prismaクライアント生成
npx prisma migrate deploy      # テーブル作成(初回。開発時は migrate dev)
npm run seed                   # data/*.csv をマスタへ投入
npm start                      # 127.0.0.1:3000 で起動
```

systemd の `ExecStart` を `/usr/bin/node src/index.js`、`WorkingDirectory` を本ディレクトリに設定して常駐。

## 環境変数(.env)

| 変数 | 用途 |
|---|---|
| DATABASE_URL | `postgresql://gameuser:パス@localhost:5432/gamedb` |
| SESSION_SECRET | Cookie署名用の長いランダム文字列 |
| INVITE_CODE | 新規登録の招待コード(10人運用の絞り込み) |
| PORT | 既定3000 |
| START_GOLD | プレイヤー初期gold(既定100) |

## API

| メソッド | パス | 概要 | 認証 |
|---|---|---|---|
| GET | /api/health | 死活確認 | 不要 |
| POST | /api/auth/register | 登録(招待コード必須) | 不要 |
| POST | /api/auth/login | ログイン | 不要 |
| POST | /api/auth/logout | ログアウト | 必要 |
| GET | /api/me | 自分の状態 | 必要 |
| GET | /api/inventory | 所持アイテム | 必要 |
| GET | /api/market | 出品一覧 | 不要 |
| POST | /api/market/list | 出品(エスクロー) | 必要 |
| POST | /api/market/buy | 購入(行ロック+原子的決済) | 必要 |
| POST | /api/market/cancel | 出品取消(在庫返却) | 必要 |

## 取引の同時実行(複製バグ)検証

```bash
npm run test:trade
```
1出品に2人が同時購入 → 片方だけ成功・アイテム総量1(複製なし)・goldが保存される、を確認する。テストデータは自動で後始末する。

## 注意

- フロント(GitHub Pages)とは別オリジンのため、本番は CORS と Cookie(SameSite=None; Secure)対応が必要。同一オリジン配信にすると簡単。
- パスワードは Node標準 scrypt でハッシュ(ネイティブ依存なし)。
- 戦闘API・宿屋・スポット状態などは次段階で追加(設計書 04 参照)。
