# Prisma StudioでDBを確認・編集する手順

検証中のDBをGUIで確認・編集するための簡易手順です。
Prisma Studioは一時的なメンテナンス用途です。恒久的な運用管理は、後続で作成する管理Webアプリを正とします。

## 前提

- VM上のアプリ配置: `~/app/game/server`
- systemdサービス名: `gameapi`
- DB接続情報: `~/app/game/server/.env` の `DATABASE_URL`
- Prisma Studioは外部公開せず、SSHトンネル経由で利用する

## VM側でPrisma Studioを起動

VMへSSH接続し、サーバーディレクトリで起動します。

```bash
cd ~/app/game/server
npx prisma studio --hostname 127.0.0.1 --port 5555
```

`Prisma Studio is up on ...` のような表示が出れば起動中です。
このターミナルは閉じずに開いたままにします。

## ローカルPCからSSHトンネルを張る

別のターミナルを開き、ローカルPC側で実行します。

Windows PowerShell例:

```powershell
ssh -i $env:USERPROFILE\.ssh\oci_game -L 5555:localhost:5555 ubuntu@gps.gerupon.uk
```

Mac/Linux例:

```bash
ssh -i ~/.ssh/oci_game -L 5555:localhost:5555 ubuntu@gps.gerupon.uk
```

このSSHも開いたままにします。

## ブラウザで開く

ローカルPCのブラウザで開きます。

```text
http://localhost:5555
```

## 主に確認するテーブル

- `User`: ログインID、停止フラグ追加後はログイン停止状態
- `Player`: HP、レベル、経験値、ゴールド、毒、撃破済みスポット
- `PlayerItem`: 所持アイテム
- `PlayerSpotState`: 撃破クールダウン、敗北ペナルティ
- `BattleSession`: 進行中の戦闘
- `SpotMaster`: スポットマスタ
- `EnemyMaster`: 敵マスタ
- `ItemMaster`: アイテムマスタ
- `InnMaster`: 宿屋マスタ
- `ShopMaster`: 道具屋マスタ
- `PostalAreaMaster`: 地域/称号用マスタ

## 注意点

- 本番運用ではDBの直接編集は最小限にする
- 編集前に対象レコードの値を控える
- `defeatedSpots` はカンマ区切りのspotIdなので、余計な空白や重複に注意する
- 撃破済みスポットを手編集する場合は、関連する `PlayerSpotState.victoryUntil` も確認する
- マスタはDBを正とする方針。CSVは初期投入・インポート・エクスポート用途にする
- Prisma Studioを使い終わったら、起動しているターミナルを `Ctrl+C` で停止する

## うまく開けない場合

VM上でPrisma Studioが起動しているか確認します。

```bash
cd ~/app/game/server
npx prisma studio --hostname 127.0.0.1 --port 5555
```

DB接続エラーが出る場合は `.env` の `DATABASE_URL` を確認します。

```bash
cd ~/app/game/server
grep DATABASE_URL .env
```

API本体の状態確認:

```bash
systemctl status gameapi --no-pager
journalctl -u gameapi -n 30 --no-pager
```
