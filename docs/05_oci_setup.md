# OCI Always Free セットアップ手順書(案A / Micro前提)

GPS連動ブラウザゲーム 本番版バックエンドを、Oracle Cloud Infrastructure(OCI)の Always Free で常時稼働させる手順。1人運用・最大10人・無料・日本国内向け。

| 項目 | 値 |
|---|---|
| 構成 | API(Node/Fastify)+ PostgreSQL を1台のVMに同居 |
| VM | VM.Standard.E2.1.Micro(AMD・Always Free)/ 1 OCPU・1GB + スワップ2GB |
| OS | Ubuntu 22.04 |
| リージョン | ap-osaka-1(ホームリージョン) |
| 公開 | Caddyで HTTPS(Let's Encrypt 自動) |
| フロント | GitHub Pages(別オリジン)or Caddyから同一オリジン配信 |
| 作成日 | 2026/06/15 |

> メモ:Ampere A1(高スペック無料)は容量不足が頻発するため、確実に取れる E2.1.Micro を採用。後日A1が取れたら移行可。

---

## 0. 前提・用語

- **公開鍵/秘密鍵**:公開鍵(.pub)をVMに登録、秘密鍵は手元保管(共有・コミット禁止)。
- **2か所のファイアウォール**:OCIの「セキュリティリスト(またはNSG)」とVM内の「iptables」両方を開ける必要がある。
- **真の秘密**(DB URL / SESSION_SECRET / 地図キー)は**フロントに出さない**。サーバーの環境変数に置く。

---

## 1. SSH鍵の作成(Windows / PowerShell)

```powershell
ssh-keygen -t ed25519 -C "gps-game-oci" -f $env:USERPROFILE\.ssh\oci_game
```

- 生成物:`oci_game`(秘密鍵・厳重保管)、`oci_game.pub`(公開鍵・VMに貼る)。
- 公開鍵の中身を表示してコピー:

```powershell
Get-Content $env:USERPROFILE\.ssh\oci_game.pub
```

権限エラー(UNPROTECTED KEY)が出たら:

```powershell
icacls $env:USERPROFILE\.ssh\oci_game /inheritance:r
icacls $env:USERPROFILE\.ssh\oci_game /grant:r "$($env:USERNAME):(R)"
```

---

## 2. VM(インスタンス)作成

1. コンソール → Compute → Instances → Create instance。
2. Image:Canonical Ubuntu 22.04。
3. Shape:Change shape → Specialty and previous generation → **VM.Standard.E2.1.Micro**(Always Free-eligible)。
4. Networking:**Create VCN with Internet connectivity** を使う(パブリックサブネット+Internet Gateway+ルートが自動)。**Assign a public IPv4 address = Yes**。
5. Add SSH keys:`oci_game.pub` を貼り付け(秘密鍵は貼らない)。
6. Create → RUNNING を待つ。

### 公開IPが付かなかった場合(後付け)

1. インスタンス → Networking タブ → Primary VNIC名をクリック。
2. IPv4 Addresses → プライベートIP行 → ⋮ → Edit。
3. Public IP type = **Ephemeral public IP** → Update。
4. Details の Public IP address を控える。
   - ※「Ephemeral public IP」が選べない場合はプライベートサブネット。パブリックサブネットのVCNで作り直す。

---

## 3. ネットワーク開放(2か所)

### 3-1. セキュリティリスト(OCIコンソール)
VCN → Subnet → Security List → Ingress Rules に追加(Source 0.0.0.0/0, TCP):
- 22(SSH)
- 80(HTTP / Let's Encrypt用)
- 443(HTTPS)

### 3-2. VM内ファイアウォール(SSH接続後)
Ubuntuの初期iptablesは80/443を塞いでいるため開ける:

```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

---

## 4. SSH接続

```powershell
ssh -i $env:USERPROFILE\.ssh\oci_game ubuntu@<パブリックIP>
```

接続を楽にする(任意)`~/.ssh/config`:

```
Host oci
    HostName <パブリックIP>
    User ubuntu
    IdentityFile ~/.ssh/oci_game
```

---

## 5. スワップ追加(1GBメモリ対策・重要)

```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h    # Swap: 2.0Gi を確認
```

---

## 6. ミドルウェア導入

```bash
sudo apt update && sudo apt -y upgrade
# Node 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt -y install nodejs
# PostgreSQL
sudo apt -y install postgresql
```

### PostgreSQL を軽量設定(1GB向け)
`/etc/postgresql/14/main/postgresql.conf`(版により14の部分は変わる)で:

```
shared_buffers = 128MB
work_mem = 8MB
max_connections = 20
```

DBとユーザー作成:

```bash
sudo -u postgres psql -c "CREATE USER gameuser WITH PASSWORD '強いパスワード';"
sudo -u postgres psql -c "CREATE DATABASE gamedb OWNER gameuser;"
sudo systemctl restart postgresql
```

接続文字列(APIの環境変数):
```
DATABASE_URL=postgresql://gameuser:強いパスワード@localhost:5432/gamedb
```

---

## 7. ドメイン + HTTPS(Caddy)

GeolocationとセキュアCookieにHTTPS必須。独自ドメインが無ければ **DuckDNS(無料DDNS)** でサブドメインを取得し、A レコードをVMの公開IPへ向ける。

```bash
sudo apt -y install debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt -y install caddy
```

`/etc/caddy/Caddyfile`(APIを443で受けてNodeの3000へ中継。フロントも同一オリジン配信する例):

```
yourname.duckdns.org {
    handle /api/* {
        reverse_proxy localhost:3000
    }
    handle {
        root * /var/www/game
        file_server
    }
}
```

```bash
sudo systemctl reload caddy   # 証明書は自動取得・自動更新
```

> フロントをGitHub Pagesのまま使う場合は別オリジンになるため、セッションCookieは `SameSite=None; Secure`、APIのCORSは対象オリジン許可+credentials が必要。**同一オリジン配信のほうが簡単**。

---

## 8. アプリ配置と常駐(systemd)

APIコードを `/home/ubuntu/app/game/server` に配置(git clone 等)。

```bash
cd /home/ubuntu/app/game/server
npm install          # 初回。package-lock.json が生成される。以降は npm ci
npx prisma db push   # マイグレーション不要でスキーマを直接反映(gameuser に CREATEDB 権限がないため)
node prisma/seed.js  # 既存CSVをDBへ投入(初回のみ)
```

`/etc/systemd/system/gameapi.service`:

```ini
[Unit]
Description=GPS Game API
After=network.target postgresql.service

[Service]
WorkingDirectory=/home/ubuntu/app/game/server
ExecStart=/usr/bin/node src/index.js
EnvironmentFile=/home/ubuntu/app/game/server/.env
Restart=always
RestartSec=3
User=ubuntu

[Install]
WantedBy=multi-user.target
```

`.env` は `EnvironmentFile` で読み込む(機密をサービスファイルに直書きしない)。

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now gameapi
systemctl status gameapi      # active (running) を確認
```

---

## 9. バックアップ(cron)

```bash
mkdir -p /home/ubuntu/backup
crontab -e
# 毎日3:00にダンプ(7日より古いものは削除)
0 3 * * * pg_dump -U gameuser gamedb | gzip > /home/ubuntu/backup/gamedb_$(date +\%F).sql.gz
5 3 * * * find /home/ubuntu/backup -name 'gamedb_*.sql.gz' -mtime +7 -delete
```

---

## 10. 動作確認

- `curl https://yourname.duckdns.org/api/health`(ヘルスチェックを実装しておくと便利)。
- ブラウザのNetworkタブでAPIが200を返すか。
- フロント(PWA)からログイン→プレイヤー状態取得まで通るか。

---

## 11. つまずきポイント早見表

| 症状 | 主な原因 | 対処 |
|---|---|---|
| SSH接続できない | セキュリティリストの22未開放 / ユーザー名違い | 22を開ける / ubuntu で接続 |
| 80・443がつながらない | VM内iptables未開放 | 手順3-2を実行 |
| 公開IPが無い | プライベートサブネット | パブリックサブネットで作り直し |
| Let's Encrypt失敗 | DNS未伝播 / 80塞がり | A レコード確認・80開放・少し待つ |
| メモリ不足で落ちる | 1GB枯渇 | スワップ追加・Postgres軽量化 |
| Cookieが保存されない | 別オリジン構成 | 同一オリジン化 or SameSite=None;Secure+CORS |
| インスタンス回収された | アイドル判定 | 24時間稼働を維持(本APIなら通常問題なし) |

---

## 12. セキュリティ最低限

- `sudo apt -y install unattended-upgrades` で自動更新。
- SSHは鍵認証のみ(パスワード認証無効化:`/etc/ssh/sshd_config` の `PasswordAuthentication no`)。
- 秘密(DB URL/SESSION_SECRET/地図キー)はsystemdの Environment か `.env`(コミット禁止)で管理。
- Postgresは `localhost` のみ待受(外部公開しない)。

---

## 13. 次のステップ

1. このVM上で「出品→同時購入の二重購入が起きない」取引トランザクションを実証(案Aの核)。
2. 認証(register/login/session)→ 戦闘サーバー権威化 → 在庫・宿屋・取引 の順に実装。
3. 詳細は `docs/04_backend_design.md` を参照。

---

## 14. 実績・確定設定(2026-06-15 時点)

実際に構築して動作確認できた内容と、ハマりどころの確定対処を記録する。手順本文の例(DuckDNS等)より、こちらが現行の正です。

### 確定した構成

| 項目 | 確定値 |
|---|---|
| リージョン / VM | ap-osaka-1 / VM.Standard.E2.1.Micro(AMD・Always Free)/ Ubuntu 22.04 |
| 公開IP | エフェメラル公開IP(例 141.147.154.4)※将来Reservedに変更推奨 |
| ドメイン | `gps.gerupon.uk`(既存の gerupon.uk を Cloudflare で管理) |
| Cloudflare | A レコード `gps` → VM公開IP、**Proxy status = DNS only(グレー雲)** |
| TLS | Caddy + Let's Encrypt 本番(acme-v02)で自動取得・自動更新 |
| 常駐 | systemd サービス `gameapi`(まずは確認用Node API)|
| 経路 | Internet →(Cloudflare DNS)→ Caddy(HTTPS)→ Node(localhost:3000) |

### 動作確認済み(✅)

- ✅ SSH接続(`ubuntu@公開IP` / ed25519鍵)
- ✅ スワップ2GB追加
- ✅ Caddyで `https://gps.gerupon.uk` の正式証明書取得
- ✅ 確認用API `GET /api/health` が `{"ok":true,...}` を返す(ブラウザ/curl両方)
- ✅ systemd で常駐・自動起動
- ✅ Node20 導入(NodeSource / dpkg --force-overwrite で旧Node12との競合解決)
- ✅ PostgreSQL 導入・gameuser/gamedb 作成・localhost のみ待受
- ✅ `npm install`(60 packages)、`npx prisma generate`、`npx prisma db push`
- ✅ `npm run seed`: enemies=10 / items=10 / spots=37 → マスタテーブルに投入
- ✅ `npm run test:trade`: 出品→同時購入の二重購入なし・整合性OK(行ロック+トランザクション実証)

### ハマりどころと確定対処

1. **Cloudflareのオリジン登録**:MapTilerの「Allowed HTTP Origins」は**ホスト名のみ**(`https://`・末尾`/`は不可)。例:`gerupon-lgtm.github.io`。
2. **公開IPが付かない**:作成時に未割当だと「Instance access」または VNIC → IPv4 Addresses → Edit で **Ephemeral public IP** を割り当てる。
3. **証明書が取れない(Timeout during connect)** = ポート未到達。**OCIセキュリティリスト**に 80/443(TCP, 0.0.0.0/0)を追加。
4. **証明書が取れない(Error getting validation data)** = OS側で拒否。**iptablesのACCEPTをREJECTより前に**入れる:
   ```bash
   sudo iptables -I INPUT 1 -p tcp -m tcp --dport 80 -j ACCEPT
   sudo iptables -I INPUT 2 -p tcp -m tcp --dport 443 -j ACCEPT
   sudo netfilter-persistent save
   ```
5. **Let's Encrypt レート制限**:失敗を繰り返すと1時間ほどブロック。原因を直してから1回だけ試す。
6. **ステージング証明書に注意**:発行元が `acme-v02`(本番)であること。ステージングだとブラウザに信頼されない。

### 確定 Caddyfile(`/etc/caddy/Caddyfile`)

デフォルトの `:80 {}` ブロックは削除し、これだけにする:

```
gps.gerupon.uk {
    encode gzip

    handle /api/* {
        reverse_proxy localhost:3000
    }

    handle {
        root * /var/www/game
        file_server
    }
}
```

### 確認用 API(差し替え前の暫定・`/home/ubuntu/app/server/index.js`)

```js
const http = require("http");
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  if (req.url === "/api/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, time: new Date().toISOString() }));
    return;
  }
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "not found" }));
}).listen(PORT, "127.0.0.1");
```

### 完了済みタスク

1. ✅ **PostgreSQL 導入** + DB/ユーザー作成 + 軽量設定。
2. ✅ **本物API(Fastify+Prisma)の実装**: `~/app/game/server/` に `src/index.js` / `prisma/schema.prisma` / `prisma/seed.js` / `tests/trade-concurrency.js` を配置。
3. ✅ **`npx prisma db push`** → テーブル作成完了(migrate dev は P3014 のため使用しない)。
4. ✅ **seed 投入**: enemies=10 / items=10 / spots=37 → PostgreSQL マスタテーブルに反映。
5. ✅ **取引同時実行実証**: `npm run test:trade` = 「複製なし・整合性OK」確認。

### 次の段階

1. **次** systemd の `gameapi` を本物の `src/index.js` に差し替え → `sudo systemctl daemon-reload && sudo systemctl restart gameapi` → `curl https://gps.gerupon.uk/api/health` で確認。
2. 認証API(register/login/logout/me)の実装・動作確認。
3. フロントの取得先をCSV/localStorage → API へ差し替え(別オリジンのためCORSとCookie SameSite=None;Secure が必要、または同一オリジン化)。

---

## 15. つまずき実録と解決手順(2026-06-15 構築時)

実際に詰まった箇所と、解決までの最短手順を要約。同じ環境を再構築する際はここを見れば再現できる。

### (1) Ampere A1 が「Out of capacity」で作成できない
- 症状: `Out of capacity for shape VM.Standard.A1.Flex`。
- 解決: 取りやすい **VM.Standard.E2.1.Micro(AMD・Always Free)** に変更して作成。A1にこだわらない。
- 補足: A1を狙うならAD変更/サイズ縮小/時間帯をずらして再試行。

### (2) インスタンスに公開IPが付かない
- 症状: Public IP が「Loading…」のまま/空。
- 解決: インスタンス → Networking → VNIC → IPv4 Addresses → Edit → **Ephemeral public IP** を割り当て。

### (3) MapTiler のオリジン登録でエラー
- 症状: `Invalid origin restriction: https://...github.io/`。
- 解決: **ホスト名のみ**を入力(`https://`・末尾`/`なし)。例 `gerupon-lgtm.github.io`。

### (4) HTTPSにつながらない/証明書が取れない
- 切り分け: `Test-NetConnection ドメイン -Port 443` と `journalctl -u caddy`。
- 原因と解決を順に:
  - `Timeout during connect` = ポート未到達 → **OCIセキュリティリストに 80/443(TCP, 0.0.0.0/0)** を追加。
  - `Error getting validation data` = OS側で拒否 → **iptablesのACCEPTをREJECTより前に**挿入:
    ```bash
    sudo iptables -I INPUT 1 -p tcp -m tcp --dport 80 -j ACCEPT
    sudo iptables -I INPUT 2 -p tcp -m tcp --dport 443 -j ACCEPT
    sudo netfilter-persistent save
    ```
  - ログのCAが `acme-staging` のとき → ステージング指定を消す(本番 `acme-v02` にする)。
  - 失敗を繰り返すとLet's Encryptのレート制限 → 直してから1回だけ試す。

### (5) Caddyfile を保存できない(E212 read only)
- 原因: `sudo` なしで開いた。
- 解決: vi なら `:w !sudo tee /etc/caddy/Caddyfile` → `:q!`、または `sudo nano /etc/caddy/Caddyfile`。

### (6) ブラウザのキャッシュで新JS/地図が反映されない
- 解決: スーパーリロード(Ctrl+F5)。恒久対策として `index.html` のJS/CSS参照に `?v=2` のような版番号を付け、更新時に上げる。

### (7) MapTilerをCloudflare管理のドメインで使う
- `gps.gerupon.uk` のAレコードをVM公開IPへ、**Proxy status = DNS only(グレー雲)**。プロキシONだとCaddyの自動証明書が通りにくい。

### (8) PostgreSQL のパスワードに記号(@)を入れてしまった
- 解決: `sudo -u postgres psql -c "ALTER USER gameuser WITH PASSWORD '記号なし新パスワード';"`。
- `could not change directory to "/home/ubuntu"` は無害な警告(`cd /tmp` してから実行すれば消える)。

### (9) `.env` が編集できない/作れない
- 原因: server ディレクトリにいない/エディタの問題。
- 解決: 正しい `~/app/game/server` へ `cd` し、エディタを使わず作成:
  ```bash
  read -p "DBパスワード: " DBPASS
  SECRET=$(openssl rand -hex 32)
  cat > .env <<EOF2
  DATABASE_URL=postgresql://gameuser:${DBPASS}@localhost:5432/gamedb
  SESSION_SECRET=${SECRET}
  INVITE_CODE=friends2026
  PORT=3000
  START_GOLD=100
  EOF2
  ```

### (10) `npm ci` が失敗(package-lock.json が無い)
- 解決: 初回は **`npm install`**(ロックファイルが生成される)。以降は `npm ci` 可。

### (11) Prisma が `Node.js >= 16.13` を要求
- 原因: Ubuntu標準の古いNode(v12)。
- 解決: NodeSourceでNode20導入。古い `libnode-dev` と衝突したら上書き:
  ```bash
  sudo dpkg -i --force-overwrite /var/cache/apt/archives/nodejs_20*_amd64.deb
  sudo apt -f install
  node -v   # v20系
  ```

### (12) `prisma migrate dev` が P3014(shadow database 権限なし)
- 原因: `gameuser` に `CREATEDB` 権限が無い。
- 解決(趣味規模の最短): マイグレーション履歴を使わず **`npx prisma db push`** でスキーマを直接反映。
  - 履歴管理したい場合は `sudo -u postgres psql -c "ALTER USER gameuser CREATEDB;"` の後に `migrate dev`。

### (13) systemd を使わず手元で test:trade / 単発実行したい
- 症状: `node` や `npm run test:trade` を直接叩くと `.env` が読まれず `DATABASE_URL` 未設定エラー。
- 原因: `.env` はアプリ起動時に自動では読まれない(systemd の `EnvironmentFile` 経由か、手動 export が必要)。
- 解決: 実行前に `.env` を一時的に環境変数へ読み込む:
  ```bash
  cd ~/app/game/server
  export $(grep -v '^#' .env | xargs)   # .env を現在のシェルに展開
  npm run test:trade
  ```
  - 常駐(systemd)では不要。サービスファイルの `EnvironmentFile=/home/ubuntu/app/game/server/.env` が自動で読み込む。

### (14) `npx prisma ...` 実行時に `Ok to proceed? (y)` が出る
- 症状: 初回 `npx prisma generate` 等で prisma CLI の取得確認プロンプトが出る。
- 対応: 想定どおりの動作。**`y` + Enter** で続行してよい(ローカル devDependency の prisma を使う許可)。`npm install` 済みなら以降は出ない。
- 注意: 別コマンドを貼り付け途中でこのプロンプトが出た場合は、いったん `n`/`Ctrl+C` で止め、`npm install` を先に完了させてから1コマンドずつ実行する。

---

## 16. 実績更新(2026-06-15 / サーバーAPI雛形)

- ✅ Node20 導入、`server/`(Fastify+Prisma)を `npm install`
- ✅ `npx prisma db push` でテーブル作成、`npm run seed` でCSV→マスタ投入(enemies=10 / items=10 / spots=37)
- ✅ `npm run test:trade` = 「出品→同時購入の二重購入が起きない(複製なし・整合性OK)」を実証
- 構成確定: API + PostgreSQL を同一VMに同居、HTTPSはCaddy、DBスキーマは `db push` 運用
- ✅ **systemd `gameapi` を本物 `src/index.js` に差し替え完了**(`WorkingDirectory=/home/ubuntu/app/game/server` / `ExecStart=/usr/bin/node src/index.js` / `EnvironmentFile=.env`)。`https://gps.gerupon.uk/api/health` → `{"ok":true}`、`/api/market` → `[]` を外部から確認。
  - 公開ルート: `/api/health` `/api/market`(一覧)。要認証: `/api/auth/*` `/api/me` `/api/inventory` `/api/market/list|buy|cancel`。
  - 差し替え後の確認: `journalctl -u gameapi -n 30 --no-pager` に `API listening on 3000`。502 が出たら `.env` の `DATABASE_URL` / `EnvironmentFile` パスを確認。
- ✅ **認証のブラウザ疎通確認(同一オリジン)**: テストページ `server/public/auth-test.html` を `/var/www/game/` に配置し `https://gps.gerupon.uk/auth-test.html` から実施。register → 200、`/api/me` → 200(プレイヤー情報)、logout 後 `/api/me` → 401
---

## 17. フロント同一オリジン化 + 認証/位置報告(Phase 2a / 2026-06-15)

日常的なデプロイは、影響範囲別の簡易手順 `docs/11_deploy_patterns.md` を優先して参照します。
今後の改修時は「パターンA + C」のように、この資料のパターンでデプロイ範囲を案内します。

PWA本体をCaddyから同一オリジン配信し、認証ゲートと位置報告APIを接続した段階の手順。

### 追加・変更点(コード)
- **API**: `Player` に位置カラム追加(`lastLat` `lastLng` `lastSeenAt` `shareLocation`)。`POST /api/location`(現在地報告・要認証)、`POST /api/location/share`(共有オプトイン切替)を追加。`/api/me` に `shareLocation` を含めた。
- **フロント**: `js/api.js`(fetchラッパー)、`js/authGate.js`(未ログイン時オーバーレイ)を追加。`config.js` に `API_BASE`("" = 同一オリジン)と `LOCATION_REPORT_INTERVAL_MS`(既定30秒)。`app.js` は起動時に `AuthGate.ensureAuth()` を待ち、`onPositionUpdate` で `reportLocationThrottled()` を呼ぶ。
- マスタ(spots/enemies/items)とプレイヤー状態(items/penalty/victory)は**当面 CSV + localStorage のまま**(DB移行は戦闘API #1 とセット)。

### デプロイ手順(VM)

**(0) 一度だけ: MapTiler のオリジン許可に同一オリジンを追加**
- MapTiler の「Allowed HTTP Origins」に **`gps.gerupon.uk`** を追加(ホスト名のみ。`https://`・末尾`/`なし)。これを忘れると地図タイルが表示されない。

**(1) API側: スキーマ反映してAPI再起動**
```bash
cd ~/app/game/server
git pull
npm install                 # 依存変更があれば
npx prisma generate
npx prisma db push          # 位置カラムをDBへ反映
sudo systemctl restart gameapi
journalctl -u gameapi -n 20 --no-pager   # API listening on 3000
```

**(2) フロントを配信先へコピー**
```bash
cd ~/app/game
git pull
sudo mkdir -p /var/www/game
sudo cp -r index.html css js data assets /var/www/game/
```

**(3) MapTilerキー(map-key.js)を配置** ※ `js/map-key.js` は .gitignore 済みで git では来ない
- 手元(ローカル)からscpで送る例:
  ```bash
  scp -i %USERPROFILE%\.ssh\oci_game js\map-key.js ubuntu@141.147.154.4:/home/ubuntu/map-key.js
  ```
  VM側で配置:
  ```bash
  sudo cp /home/ubuntu/map-key.js /var/www/game/js/map-key.js
  ```
- または VM上で直接作成:
  ```bash
  echo 'window.MAP_KEY = "あなたのMapTilerキー";' | sudo tee /var/www/game/js/map-key.js
  ```

**(4) 動作確認**
- `https://gps.gerupon.uk/` を開く → 認証オーバーレイが出る → 登録/ログイン → 地図とゲーム画面へ。
- ヘッダーに名前(G:所持金)とログアウトボタンが出る。
- プレイ中(GPS取得 or モック位置適用)に、サーバーへ位置が送信される(既定30秒間隔)。確認:
  ```bash
  cd /tmp
  sudo -u postgres psql -d gamedb -c 'SELECT name, "lastLat", "lastLng", "lastSeenAt" FROM "Player";'
  ```
  `lastSeenAt` が更新されていれば位置報告が届いている。

### つまずきポイント
- **地図が出ない/タイル403** → MapTiler の Allowed Origins に `gps.gerupon.uk` 未追加、または `map-key.js` 未配置。
- **オーバーレイから進めない(401のまま)** → Cookie未保存。`https://gps.gerupon.uk`(同一オリジン)で開いているか、HTTPSか確認。
- **/ が404、/api は動く** → `/var/www/game` にコピー漏れ。手順(2)を再実行。
- **位置が更新されない** → 未ログイン、またはGPS未取得。デバッグパネルのモック位置で送信を確認できる。`reportLocationThrottled` は既定30秒間隔。

### 先送り(#1 戦闘APIと一緒に)
- items / penalty / victory を localStorage → DB(`PlayerItem` / `PlayerSpotState`)へ。
- マスタ(spots/enemies/items)を CSV → API(`GET /api/spots` 等)へ。
- 「近くのプレイヤー」一覧 `GET /api/players/nearby`(`shareLocation=true` かつ `lastSeenAt` が新しい人のみ、距離は概算で返す)。

---

## 18. 戦闘サーバー権威化 + HP回復/宿屋(#1 / 2026-06-15)

戦闘・報酬・クールダウン・在庫・HPをサーバー(DB)権威に移行し、HP永続化と3系統の回復を追加した段階。

### HPモデル(死亡概念なし)
- **HPは永続**(戦闘間で持ち越し)。戦闘で蓄積ダメージ。HPが0でも「死亡」せず、回復を待って再挑戦できる。
- **回復は3系統**:
  1. **敗北クールダウン後の少量回復**: 敗北するとそのスポットに `penaltyMin` 分のペナルティ。その時刻(`healAt`)を過ぎると、次のアクセス時にMAXの一定%を回復(遅延適用・cron不要)。割合は `DEFEAT_HEAL_PERCENT`(既定0.3)。
  2. **アイテム使用**: `POST /api/item/use`。`ItemMaster.healAmount > 0` のアイテムを1個消費してHP回復(ポーション+30 / 薬草+15 / エリクサー+100)。
  3. **宿屋で全回復**: `POST /api/inn/rest`。地図上の固定地点(`inns.csv`)に近づくと「休む」でHP=MAX。

### 追加・変更(コード/データ)
- **スキーマ**: `Player.healAt`(回復予約)、`ItemMaster.healAmount`、新規 `InnMaster`(innId/name/lat/lng/radiusM)。
- **API**: `POST /api/battle`(全ターンを決定論計算しturns配列を返す。勝敗・報酬・クールダウン・HPを1トランザクションで確定)、`POST /api/item/use`、`POST /api/inn/rest`、`GET /api/spot-states`、`GET /api/inns`。`/api/me` は遅延回復を反映し hp/maxHp/healAt を返す。`/api/inventory` に healAmount を追加。
- **データ**: `items.csv` に `heal` 列、`inns.csv` 新規(活動エリア 35.01,136.66 付近に2件・**要・実地点へ編集**)、`seed.js` を heal/inn 対応に。
- **フロント**: 戦闘はサーバー応答のturnsを攻撃ボタンで再生(`battle.js` のローカル計算は不使用)。クールダウンは `GET /api/spot-states`(`storage.js` はメモリキャッシュ化)、在庫は `GET /api/inventory`。HP表示・回復アイテム「使う」・宿屋「休む」UIを追加。

### チューニング(`server/.env` で上書き可)
```
VICTORY_COOLDOWN_MIN=60      # 勝利後に敵が再出現しない時間(分)
DEFEAT_HEAL_PERCENT=0.3      # 敗北クールダウン後に回復するMAX割合
BATTLE_USE_RANDOM=false      # 戦闘ダメージに乱数を使うか
BATTLE_RANDOM_RANGE=0.2      # 乱数幅(±20%)。USE_RANDOM=true時のみ
```

### デプロイ手順(VM)

**(1) API: スキーマ反映 + 再シード + 再起動**
```bash
cd ~/app/game/server
git pull
npm install
npx prisma generate
npx prisma db push          # healAt / healAmount / InnMaster を反映
npm run seed                # items(heal) と inns を投入。出力: ... inns=2
sudo systemctl restart gameapi
journalctl -u gameapi -n 20 --no-pager
```

**(2) フロント再配置**(`data/inns.csv` も含める)
```bash
cd ~/app/game
git pull
sudo cp -r index.html css js data assets /var/www/game/
```
※ `js/map-key.js` は配置済みなら不要(git では来ないため消さないこと)。

**(3) 動作確認**(`https://gps.gerupon.uk/`)
- ログイン → デバッグパネルでスポット座標にモック移動 → **戦闘開始 → 攻撃**でターン再生 → 勝敗。
- 勝利: 報酬がアイテム一覧(`/api/inventory`)に増える。一定時間「撃破済み」。
- 敗北: そのスポットが「再戦待機中」。クールダウン後、HPがMAXの約30%回復。
- 回復アイテム(ポーション等)を所持していれば一覧の「使う」でHP回復。
- 宿屋座標(inns.csv)に近づくと「🛏 宿屋」が出て「休む」で全回復。
- DB確認:
  ```bash
  cd /tmp
  sudo -u postgres psql -d gamedb -c 'SELECT name, hp, "maxHp", "healAt" FROM "Player";'
  sudo -u postgres psql -d gamedb -c 'SELECT "playerId","spotId","penaltyUntil","victoryUntil" FROM "PlayerSpotState";'
  ```

### つまずきポイント
- **宿屋が出ない** → `inns.csv` を配置(手順2)し座標が現在地付近か確認。半径外。`npm run seed` で `inns=` が出ているか。
- **戦闘が409**(再戦待機/再出現待ち) → 仕様どおり。`/api/spot-states` のクールダウン中。時間経過か別スポットへ。
- **「使う」ボタンが出ない** → そのアイテムは `healAmount=0`(回復アイテムでない)。`items.csv` の heal 列で調整し再seed。
- **HPが回復しすぎ/しなさすぎ** → `.env` の `DEFEAT_HEAL_PERCENT` を調整して `systemctl restart gameapi`。
- **位置偽装** → 仕様どおり対策しない。サーバーは spotId/innId を信頼(クライアントが近接判定)。必要なら将来 `lastLat/lng` で近接チェックを追加可能。

### 先送り(任意の今後)
- マスタ(spots/enemies/items/inns)を CSV → API(`GET /api/spots` 等)へ一本化。
- 「近くのプレイヤー」一覧 `GET /api/players/nearby`(`shareLocation` かつ `lastSeenAt` が新しい人のみ・距離概算)。
