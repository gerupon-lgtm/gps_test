# DB管理Webアプリの構成と運用

DBを正本として、マスタとプレイヤーデータを管理する別建てWebアプリです。

## 想定URL

```text
https://admin.gps.gerupon.uk/
```

ゲーム本体とは別サブドメインで公開します。

```text
https://gps.gerupon.uk/        ゲーム本体
https://admin.gps.gerupon.uk/  DB管理アプリ
```

## 配置

当面は同一リポジトリ内の `game-admin/` を別アプリとして起動します。

```text
~/app/game/server/      ゲームAPI
~/app/game/game-admin/  DB管理Webアプリ
```

Prisma schemaは `server/prisma/schema.prisma` を正とし、管理アプリ側では重複管理しません。

## 管理アプリの機能

初期実装:

- 管理者ログイン
- プレイヤー一覧
- プレイヤー詳細
- ログイン停止/解除
- セッション削除
- 撃破済みスポットの追加/解除
- `PlayerSpotState.victoryUntil` の同期更新
- 操作ログ `AdminAuditLog` 記録
- マスタ一覧/詳細編集
- マスタの `active` 切替

後続予定:

- CSVエクスポート
- CSVインポート
- 差分プレビュー

## 追加DB項目

`User`:

- `disabled`
- `disabledAt`
- `disabledReason`

`AdminAuditLog`:

- 管理操作ログ

反映にはDBスキーマ更新が必要です。

```bash
cd ~/app/game/server
npx prisma db push
```

## VMでのセットアップ

```bash
cd ~/app/game/game-admin
npm install
npm run prisma:generate
```

`.env` または systemd の `Environment` に以下を設定します。

```env
DATABASE_URL=postgresql://gameuser:パスワード@localhost:5432/gamedb
SESSION_SECRET=既存ゲームと同等以上のランダム文字列
ADMIN_USER=admin
ADMIN_PASSWORD=強い管理者パスワード
ADMIN_COOKIE_SECRET=管理アプリ用のランダム文字列
PORT=3010
```

`ADMIN_PASSWORD` が空の場合、ログインできません。

## systemd

`/etc/systemd/system/gameadmin.service`:

```ini
[Unit]
Description=GPS Game Admin
After=network.target postgresql.service

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/app/game/game-admin
EnvironmentFile=/home/ubuntu/app/game/game-admin/.env
ExecStart=/usr/bin/node src/index.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

反映:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now gameadmin
systemctl status gameadmin --no-pager
journalctl -u gameadmin -n 30 --no-pager
```

## Caddy

`admin.gps.gerupon.uk` をVMへ向けたうえで、Caddyfileに追加します。

```caddy
admin.gps.gerupon.uk {
  reverse_proxy 127.0.0.1:3010
}
```

反映:

```bash
sudo systemctl reload caddy
```

## 撃破済みスポット編集ルール

標準ルール:

- 撃破済みにする
  - `Player.defeatedSpots` にspotIdを追加
  - `PlayerSpotState` をupsert
  - `victoryUntil` は画面指定値を設定。未指定なら `null`
  - `penaltyUntil` は基本変更しない
- 撃破解除
  - `Player.defeatedSpots` からspotIdを削除
  - `PlayerSpotState.victoryUntil` を `null`
  - `penaltyUntil` は標準では維持
  - 必要な場合だけ画面の「penaltyUntilもクリア」を使う

理由: 撃破履歴と敗北ペナルティは別概念として扱うため。

## セキュリティ注意

- 管理アプリは強い権限を持つため、管理者パスワードは強いものにする
- 可能ならCloudflare側でアクセス制限を追加する
- 管理操作は `AdminAuditLog` に記録する
- 本番運用では、CSV取り込みや大量更新は必ず差分プレビューを挟む
