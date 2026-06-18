# デプロイパターン早見表

改修時に案内される「影響範囲」に応じて、VM側で実行するデプロイ方法を選ぶための簡易手順です。

今後の改修案内では、原則として次のように示します。

```text
影響範囲: フロント, API, DB schema, assets
デプロイ: パターンA + B + C + D
```

## 共通前提

- VM上のリポジトリ: `~/app/game`
- ゲーム公開先: `/var/www/game`
- ゲームAPI systemd: `gameapi`
- 管理アプリ systemd: `gameadmin`
- DB schema反映は `prisma migrate dev` ではなく `npx prisma db push` を使う。
- `js/map-key.js` はgit管理外。フロント再配置時に消えた場合は復元する。

## パターン一覧

| パターン | 影響範囲 | 使う場面 |
|---|---|---|
| A | フロント | `index.html`, `css/`, `js/`, `data/` の変更 |
| B | assets | `assets/` 配下の画像などを追加・更新 |
| C | API | `server/src/` などゲームAPIの変更 |
| D | DB schema | `server/prisma/schema.prisma` の変更 |
| E | 管理アプリ | `game-admin/` のサーバー/画面変更 |
| F | seed/初期データ | `server/prisma/seed.js` や初期投入CSVの変更 |
| G | 環境変数/systemd/Caddy | `.env`, systemd unit, Caddyfile の変更 |

## 最初に共通で実行

```bash
cd ~/app/game
git pull
```

## パターンA: フロント反映

```bash
cd ~/app/game
sudo mkdir -p /var/www/game
sudo cp -r index.html css js data /var/www/game/
curl -I https://gps.gerupon.uk/
```

注意:

- JS/CSSを変えた場合は、`index.html` の `?v=` を上げる。
- 表示が古い場合は Ctrl+F5。
- `js/map-key.js` が消えた場合は再配置する。

## パターンB: assets反映

```bash
cd ~/app/game
sudo mkdir -p /var/www/game/assets
sudo cp -r assets /var/www/game/
```

注意:

- プレイヤー画像候補は `assets/` 直下で、ファイル名が `avatar_` から始まる画像のみ。
- 対応拡張子: `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`
- 画像差し替えより、新しいファイル名追加のほうがブラウザキャッシュ事故を避けやすい。

## パターンC: API反映

```bash
cd ~/app/game/server
npm install
npx prisma generate
sudo systemctl restart gameapi
journalctl -u gameapi -n 30 --no-pager
curl https://gps.gerupon.uk/api/health
```

## パターンD: DB schema反映

```bash
cd ~/app/game/server
npm install
npx prisma generate
npx prisma db push
sudo systemctl restart gameapi
journalctl -u gameapi -n 30 --no-pager
curl https://gps.gerupon.uk/api/health
```

管理アプリもPrisma Clientを使うため、必要に応じて続けて実行:

```bash
cd ~/app/game/game-admin
npm install
npm run prisma:generate
sudo systemctl restart gameadmin
journalctl -u gameadmin -n 30 --no-pager
```

## パターンE: 管理アプリ反映

```bash
cd ~/app/game/game-admin
npm install
npm run prisma:generate
sudo systemctl restart gameadmin
journalctl -u gameadmin -n 30 --no-pager
curl -I https://admin.gps.gerupon.uk/
```

注意:

- 管理アプリを修正した場合は `game-admin/public/adminVersion.js` の `version` と `assetsVersion` を上げる。
- 管理画面が古い場合はブラウザのキャッシュを更新する。

## パターンF: seed/初期データ反映

```bash
cd ~/app/game/server
npm install
npx prisma generate
npm run seed
sudo systemctl restart gameapi
journalctl -u gameapi -n 30 --no-pager
```

注意:

- 本番データを上書きする可能性があるため、実行前にseedの挙動を確認する。
- 管理アプリでマスタ運用している場合、seed再実行が適切か判断してから行う。

## パターンG: 環境変数/systemd/Caddy反映

systemd unitを変えた場合:

```bash
sudo systemctl daemon-reload
sudo systemctl restart gameapi
sudo systemctl restart gameadmin
```

Caddyfileを変えた場合:

```bash
sudo systemctl reload caddy
```

確認:

```bash
systemctl status gameapi --no-pager
systemctl status gameadmin --no-pager
curl https://gps.gerupon.uk/api/health
curl -I https://admin.gps.gerupon.uk/
```

## よく使う組み合わせ

| 変更内容 | デプロイ指示 |
|---|---|
| 画面表示だけ変更 | パターンA |
| 画像追加だけ | パターンB |
| フロントで新しい画像を使う | パターンA + B |
| APIだけ変更 | パターンC |
| DB項目追加 + API変更 | パターンC + D |
| DB項目追加 + API + フロント | パターンA + C + D |
| プレイヤー画像/キャラ選択系 | パターンA + B + C + D |
| 管理アプリだけ変更 | パターンE |
| 管理アプリ + DB項目追加 | パターンD + E |
| フロント + 管理アプリ + DB/API | パターンA + C + D + E |
| 環境変数を変えた | パターンG |

## デプロイ後の基本確認

```bash
curl https://gps.gerupon.uk/api/health
curl -I https://gps.gerupon.uk/
curl -I https://admin.gps.gerupon.uk/
journalctl -u gameapi -n 30 --no-pager
journalctl -u gameadmin -n 30 --no-pager
```

ブラウザ確認:

- `https://gps.gerupon.uk/`
- `https://admin.gps.gerupon.uk/`
- 表示が古い場合は Ctrl+F5。
