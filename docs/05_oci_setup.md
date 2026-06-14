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

APIコードを `/home/ubuntu/app/server` に配置(git clone 等)。

```bash
cd /home/ubuntu/app/server
npm ci
npx prisma migrate deploy
node prisma/seed.js     # 既存CSVをDBへ投入(初回のみ)
npm run build           # TypeScriptをビルド(構成による)
```

`/etc/systemd/system/gameapi.service`:

```ini
[Unit]
Description=GPS Game API
After=network.target postgresql.service

[Service]
WorkingDirectory=/home/ubuntu/app/server
ExecStart=/usr/bin/node dist/index.js
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=DATABASE_URL=postgresql://gameuser:強いパスワード@localhost:5432/gamedb
Environment=SESSION_SECRET=長いランダム文字列
Restart=always
User=ubuntu

[Install]
WantedBy=multi-user.target
```

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

### 残タスク(次の段階)

1. **PostgreSQL 導入**(本ドキュメント手順6)+ DB/ユーザー作成 + 軽量設定。
2. 本物のAPI(Fastify+Prisma)に差し替え、systemdの `ExecStart` を更新。
3. `prisma migrate` → 既存CSVを seed 投入。
4. 取引トランザクションの同時実行実証(設計書 7.3)。
5. フロントの取得先をCSV/localStorage → API へ差し替え(別オリジンのためCookieはSameSite=None;Secure+CORS、または将来同一オリジン化)。
