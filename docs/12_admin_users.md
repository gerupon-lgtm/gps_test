# 管理アプリ DB管理者運用

## 概要

管理アプリは、既存のenv管理者とDB管理者の両方でログインできます。

- env管理者: `.env` または systemd `Environment` の `ADMIN_USER` / `ADMIN_PASSWORD` で管理する既存の管理者。常に `superadmin` として扱います。
- DB管理者: `AdminUser` テーブルで管理する複数管理者。管理アプリの `管理者管理` タブから追加・編集します。

env管理者は、DB管理者の設定ミス、無効化、パスワード忘れ、DB不整合時の復旧用として残します。管理アプリ画面からは編集・削除しません。

## 権限

| role | 内容 |
|---|---|
| `superadmin` | 通常の管理操作に加えて、DB管理者の追加・編集・停止・パスワード再設定ができます。 |
| `admin` | プレイヤー管理、マスタ管理、CSV取込みなど通常の管理操作ができます。DB管理者管理タブは表示されません。 |

## DB項目

`AdminUser`:

- `loginId`: DB管理者のログインID。一意。
- `displayName`: 画面表示名。
- `passwordHash`: scrypt形式のパスワードハッシュ。平文パスワードは保存しません。
- `role`: `superadmin` または `admin`。
- `disabled`, `disabledAt`, `disabledReason`: 管理者アカウントの停止状態。
- `lastLoginAt`: 最終ログイン日時。

`AdminAuditLog` には従来の `adminName` に加えて、以下を記録します。

- `adminId`: DB管理者ID。env管理者の場合は `null`。
- `adminLoginId`: ログインID。
- `adminRole`: `superadmin` または `admin`。
- `authSource`: `env` または `db`。

## ログイン判定

1. env管理者の `ADMIN_USER` / `ADMIN_PASSWORD` と一致するか確認します。
2. 一致しない場合、DBの `AdminUser` を `loginId` で検索します。
3. `disabled=false` かつパスワードハッシュ検証に成功した場合のみログインできます。

この順序により、DB管理者側の設定に問題があってもenv管理者で復旧できます。

## DB管理者の追加手順

1. env管理者で `https://admin.gps.gerupon.uk/` にログインします。
2. `管理者管理` タブを開きます。
3. `新規登録` を押します。
4. `loginId`, `displayName`, `role`, `password` を入力します。
5. 必要に応じて `disabled` と `disabledReason` を設定します。
6. `保存` を押します。
7. 追加したDB管理者でログインできることを確認します。

既存DB管理者のパスワードは、管理者詳細の `パスワード再設定` から変更します。DB管理者は削除せず、監査履歴を残すため停止状態にします。

## 懸念点と運用ルール

- パスワードは平文保存しません。DBには `passwordHash` のみ保存します。
- env管理者は復旧経路として必ず残します。
- DB管理者を削除すると監査履歴との対応が追いにくくなるため、削除ではなく停止で運用します。
- 同じ表示名があっても、監査ログでは `adminId` / `adminLoginId` / `authSource` で区別します。
- セッションは従来どおり管理アプリプロセスのメモリ上で管理します。再起動時は全管理者がログアウトします。
- 個別セッション無効化や複数プロセス運用が必要になった場合は、管理者セッションのDB化を検討します。

## デプロイ

この機能の影響範囲は `DB schema + 管理アプリ` です。通常は **パターンD + E** でデプロイします。

```bash
cd ~/app/game
git pull

cd ~/app/game/server
npm install
npx prisma generate
npx prisma db push

cd ~/app/game/game-admin
npm install
npm run prisma:generate
sudo systemctl restart gameadmin
journalctl -u gameadmin -n 30 --no-pager
```

env管理者の `ADMIN_USER` / `ADMIN_PASSWORD` / `ADMIN_COOKIE_SECRET` などを変更する場合は、追加で **パターンG** も実施します。

```bash
sudo systemctl daemon-reload
sudo systemctl restart gameadmin
journalctl -u gameadmin -n 30 --no-pager
```

## リリース情報

この変更を含む管理アプリのバージョンは `0.1.10` です。
