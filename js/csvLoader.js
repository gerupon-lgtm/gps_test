// =====================================================
// csvLoader.js
// CSVファイルを読み込み、オブジェクト配列へ変換する
// =====================================================

// 1ファイルを取得してテキストを返す
async function loadCsv(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`CSV読み込み失敗: ${path} (HTTP ${res.status})`);
  }
  return await res.text();
}

// CSVテキストをオブジェクト配列へ変換する。
// 値は文字列のまま返す(型変換は呼び出し側 or 後段で行う)。
// 簡易パーサー(カンマ区切り・引用符なし前提)。前後の空白はトリムする。
function parseCsv(text) {
  const lines = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((line) => line.trim() !== "");
  if (lines.length === 0) return [];

  const headers = lines[0].split(",").map((h) => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = (cols[idx] ?? "").trim();
    });
    rows.push(obj);
  }
  return rows;
}

// 文字列を数値へ。空文字や不正値は null。
function toNumberOrNull(v) {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

// spots を型変換する
function normalizeSpots(rows) {
  return rows.map((r) => ({
    spot_id: r.spot_id,
    spot_name: r.spot_name,
    latitude: toNumberOrNull(r.latitude),
    longitude: toNumberOrNull(r.longitude),
    radius_meters: toNumberOrNull(r.radius_meters),
    enemy_id: r.enemy_id,
    reward_item_id: r.reward_item_id,
    penalty_minutes: toNumberOrNull(r.penalty_minutes),
    active: String(r.active).toLowerCase() === "true",
  }));
}

function normalizeEnemies(rows) {
  return rows.map((r) => ({
    enemy_id: r.enemy_id,
    enemy_name: r.enemy_name,
    hp: toNumberOrNull(r.hp),
    attack: toNumberOrNull(r.attack),
    defense: toNumberOrNull(r.defense),
    image: r.image || "",
  }));
}

function normalizeItems(rows) {
  return rows.map((r) => ({
    item_id: r.item_id,
    item_name: r.item_name,
    description: r.description || "",
    rarity: r.rarity || "",
  }));
}

function normalizeInns(rows) {
  return rows.map((r) => ({
    inn_id: r.inn_id,
    inn_name: r.inn_name,
    latitude: toNumberOrNull(r.latitude),
    longitude: toNumberOrNull(r.longitude),
    radius_meters: toNumberOrNull(r.radius_meters),
  }));
}

// 3ファイルをまとめて読み込む
async function loadGameData() {
  const [spotsText, enemiesText, itemsText] = await Promise.all([
    loadCsv(CONFIG.PATHS.spots),
    loadCsv(CONFIG.PATHS.enemies),
    loadCsv(CONFIG.PATHS.items),
  ]);

  const spots = normalizeSpots(parseCsv(spotsText));
  const enemies = normalizeEnemies(parseCsv(enemiesText));
  const items = normalizeItems(parseCsv(itemsText));

  // 宿屋(任意。inns.csv が無ければ空配列)
  let inns = [];
  try {
    const innsText = await loadCsv(CONFIG.PATHS.inns);
    inns = normalizeInns(parseCsv(innsText));
  } catch (e) {
    inns = [];
  }

  // インデックス化
  const enemyMap = {};
  enemies.forEach((e) => (enemyMap[e.enemy_id] = e));
  const itemMap = {};
  items.forEach((i) => (itemMap[i.item_id] = i));

  return { spots, enemies, items, enemyMap, itemMap, inns };
}
