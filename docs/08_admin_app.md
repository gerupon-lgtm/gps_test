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
- 管理アプリのバージョン表示
- 無操作タイムアウトによる自動ログアウト
- ログアウト後/再ログイン後の画面状態初期化
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
ADMIN_IDLE_TIMEOUT_SECONDS=600
PORT=3010
```

`ADMIN_PASSWORD` が空の場合、ログインできません。

`ADMIN_IDLE_TIMEOUT_SECONDS` は管理アプリの無操作タイムアウト秒数です。未指定または不正値の場合は600秒として扱います。

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
- 管理者セッションは無操作タイムアウトで自動ログアウトする
- ログアウト後に再ログインした場合、前回の選択中プレイヤー/マスタ/CSVプレビュー/近接チェック結果は初期化する
- 本番運用では、CSV取り込みや大量更新は必ず差分プレビューを挟む

## バージョン情報

管理アプリは `game-admin/public/adminVersion.js` にバージョン情報を持ち、ヘッダーに `管理アプリ vX.Y.Z` として表示します。

- `version`: 管理アプリ表示用バージョン
- `assetsVersion`: `index.html` のCSS/JS読み込みクエリに使うキャッシュバスター
- `releasedAt`: リリース日

管理アプリを修正してリリースする場合は、`version` と `assetsVersion` を同じ値でインクリメントします。現在の管理アプリは `0.1.6` です。

## CSV入出力

マスタ管理画面から、各マスタのCSV出力とCSV取り込みができます。

対象:

- スポット
- 敵
- アイテム
- 宿屋
- 道具屋
- 郵便番号/地域

基本手順:

1. 管理アプリへログインする
2. 「マスタ管理」を開く
3. 対象マスタを選択する
4. 「CSV出力」で現在のDB内容を取得する
5. 取得したCSVを編集する
6. 「CSV取り込み」でファイルを選択する
7. 「取り込みプレビュー」で追加/更新/変更なし/CSV未掲載/エラー、重複、近接警告を確認する
8. 行ごとの「取込む」を確認し、必要に応じて各パラメータを画面上で修正する
9. 問題なければ「確定反映」を押す

取り込みルール:

- CSVはDB項目名で扱う
- ID列は必須
  - spots: `spotId`
  - enemies: `enemyId`
  - items: `itemId`
  - inns: `innId`
  - shops: `shopId`
  - postalAreas: `areaKey`
- 同じIDがDBにあれば更新、なければ追加する
- CSVに載っていない既存レコードは削除しない
- 非表示にしたい場合は `active` を `false` にする
- 新規追加/更新とも、CSVの `active=true` は `true`、`active=false` は `false` として扱う
- `active` が未指定の場合は `true` として扱う
- boolean列は画面上ではチェックボックスで編集する
- Excel等で出力される `TRUE` / `FALSE` の大文字表記も扱える
- CSV文字コードは `SJIS` / `UTF-8` を選択できる
- Windows日本語環境でExcel編集する場合は `SJIS` を使う
- `spotId` / `enemyId` / `itemId` / `innId` / `shopId` が空の新規行は自動採番する
- 自動採番は既存IDの最大番号 + 1 を使う
- `postalAreas` の `areaKey` は地域照合キーのため自動採番しない
- 取り込みプレビューの各行には「取込む」チェックボックスを表示する
- 取り込み対象行の各パラメータはプレビュー画面上で編集できる
- 敵/アイテム/郵便番号・地域の重複更新行は、既定で「取込む」をOFFにする
- スポット/宿屋/道具屋で近接警告がある行は、既定で「取込む」をOFFにする
- 既定でOFFになった行も、手作業でONにすれば強制的に取り込める
- スポット/宿屋/道具屋は、取り込みプレビュー時に近接警告を出す
- 近接警告の既定値は10mで、画面から変更できる
- 近接警告は警告のみで、取り込み反映は止めない
- 「既存近接チェック」で、DB登録済みのスポット/宿屋/道具屋同士も確認できる
- 既存近接チェックは確認専用で、DB更新は行わない
- 「新規登録」から画面上で1件ずつマスタを追加できる
- 新規登録時もID空欄なら自動採番する
- 新規登録時のスポット/宿屋/道具屋は近接警告件数を表示する
- 新規登録結果は `AdminAuditLog` に記録する
- プレビューでエラーがある場合は反映できない
- 反映結果は `AdminAuditLog` に記録する

注意:

- 旧来のゲーム用CSVとは列名が異なる場合があるため、まず管理アプリからCSV出力したファイルをテンプレートにする
- スポット追加時は `enemyId` や `rewardItemId` が既存マスタと整合しているか確認する
- 大量更新時も「消して書く」ではなく、ID単位のupsertとして処理する
