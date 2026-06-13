// =====================================================
// config.js
// 検証用パラメータ。ここを書き換えるだけで挙動を調整できる。
// =====================================================
const CONFIG = {
  // GPS精度の許容値(メートル)。accuracy がこの値以下のときだけ距離判定を行う。
  GPS_ACCURACY_LIMIT_METERS: 100,

  // プレイヤーの戦闘パラメータ
  PLAYER_HP: 100,
  PLAYER_ATTACK: 15,
  PLAYER_DEFENSE: 3,

  // 戦闘の乱数(false=決定論的でテスト再現しやすい)
  BATTLE_USE_RANDOM: false,
  BATTLE_RANDOM_RANGE: 0.2, // ±20%(BATTLE_USE_RANDOM=true のときのみ有効)

  // テスト用: true にすると次のターンで必ず敗北する(敗北ペナルティ検証用)
  DEBUG_FORCE_LOSE: false,

  // Geolocation API のオプション
  GEO_OPTIONS: {
    enableHighAccuracy: true,
    timeout: 10000,
    maximumAge: 5000,
  },

  // CSVファイルのパス(GitHub Pages 相対パス)
  PATHS: {
    spots: "./data/spots.csv",
    enemies: "./data/enemies.csv",
    items: "./data/items.csv",
  },

  // localStorage キー
  STORAGE_KEYS: {
    items: "gps_game_items",
    penalties: "gps_game_penalties",
  },
};
