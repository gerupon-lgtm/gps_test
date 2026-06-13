# GPS連動ブラウザゲーム 検証版(PoC)

スマートフォンのブラウザから取得したGPS情報を使い、CSVに登録した地点との距離判定で敵を出現させ、簡易戦闘・報酬取得・敗北ペナルティまでを検証する技術検証版です。

- 配信: GitHub Pages(HTTPS)
- データ: 同一リポジトリ内のCSV(`data/`)
- 保存: localStorage
- バックエンド: なし(ブラウザJavaScriptのみ)

## ディレクトリ構成

```text
.
├─ index.html
├─ .nojekyll
├─ README.md
├─ css/style.css
├─ js/
│   ├─ config.js     パラメータ集約(ここを編集して調整)
│   ├─ geo.js        Geolocation API
│   ├─ csvLoader.js  CSV読み込み・パース
│   ├─ distance.js   Haversine距離・スポット探索
│   ├─ battle.js     簡易戦闘
│   ├─ storage.js    localStorage
│   └─ app.js        画面遷移・全体制御
├─ data/
│   ├─ spots.csv
│   ├─ enemies.csv
│   └─ items.csv
├─ assets/
│   ├─ enemy_slime.png
│   └─ enemy_golem.png
└─ docs/
    ├─ specification.md
    ├─ design.md
    └─ test-plan.md
```

## GitHub Pagesでの公開手順

1. このフォルダ一式を新規リポジトリにpushする。
2. Settings → Pages で、Branch を `main`(または該当ブランチ)/ root に設定。
3. 発行された `https://<ユーザー名>.github.io/<リポジトリ名>/` にアクセス。
4. スマートフォンで開き、位置情報の利用を許可する。

`.nojekyll` を含めているため、Jekyll処理を無効化して `js/` などがそのまま配信されます。

## 検証用パラメータ(js/config.js)

| 項目 | 既定値 | 説明 |
|---|---|---|
| GPS_ACCURACY_LIMIT_METERS | 100 | accuracyがこの値以下のときだけ距離判定 |
| PLAYER_HP | 100 | プレイヤーHP |
| PLAYER_ATTACK | 15 | プレイヤー攻撃力 |
| PLAYER_DEFENSE | 3 | プレイヤー防御力 |
| ダメージ式 | max(1, 攻撃力 − 相手防御力) | 最低1ダメージ保証 |
| BATTLE_USE_RANDOM | false | trueで±20%の乱数 |
| DEBUG_FORCE_LOSE | false | trueで次戦闘を必ず敗北(テスト用) |

判定半径(radius_meters)とペナルティ時間(penalty_minutes)は spots.csv 側で指定します。

## テスト機能(実際に移動せず検証)

画面右上の「🛠 テスト」ボタンでパネルを開きます。

- スポット選択ワープ: プルダウンで選んだスポット中心に現在地をモックします。
- 位置の手動入力: 任意の緯度・経度・精度をモック位置として適用します。
- モック解除: 実GPSに戻します(再取得は開始ボタン)。
- localStorageクリア: 所持アイテム・ペナルティを初期化します。
- 「次の戦闘を必ず敗北させる」: 敗北ペナルティ(test-plan TC-012/013)の確認用。

モック中は探索画面の「取得元」が「モック(テスト)」と表示されます。

## 既定の検証パラメータの根拠

- 計算は決定論的(乱数なし)にしているため、テストの再現性が高い。
- 既定値ではプレイヤーが必ず勝つため、敗北側の検証は「強制敗北」スイッチで行う。
- 本番では戦闘バランス調整・乱数化・敗北条件の見直しを想定。

## 注意

- CSVは公開URLから誰でも参照可能。非公開にしたい座標・個人情報は載せない。
- Geolocation APIはHTTPS(またはlocalhost)が前提。
- 実地検証では公園・広場・建物入口など安全な場所を選び、歩きスマホはしない。

## 地図表示

探索画面に Leaflet + OpenStreetMap の地図を表示します(APIキー不要、CDN読み込み)。

- 表示するのは「自分の現在地」のみ(青い点)。周囲の薄い円はGPS精度(accuracy)の範囲。
- スポットは地図上にピン表示せず、最寄りスポットとの距離は数字(m)でのみ表示します。
- 地図はインターネット接続時にタイル画像を取得します。オフライン時は地図領域が空になりますが、ゲーム動作には影響しません。

## 更新履歴(主な仕様)

- 勝利後クールダウン: 同じスポットの敵は撃破後 60分間 再出現しません(localStorageの `gps_game_victory_cooldowns` で管理)。時間は `config.js` の `VICTORY_COOLDOWN_MINUTES` で変更可。
- チェックイン距離: 全スポット 50m(spots.csv の `radius_meters`)。
- 地図: 表示を拡大し、デフォルト拡大率を上げました(`config.js` の `MAP_DEFAULT_ZOOM`、既定18)。
- 探索画面のレイアウト: 上から「最寄りスポット名+距離」→「判定/敵出現」→「地図」→「座標などの詳細(折りたたみ)」の順。スマホで一画面に収まるよう縦フレックスで構成。
