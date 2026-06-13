// =====================================================
// storage.js
// localStorage への保存・読み込み
// =====================================================

function _read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    console.warn("localStorage読み込み失敗:", key, e);
    return fallback;
  }
}

function _write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn("localStorage保存失敗:", key, e);
  }
}

// ---- アイテム ----

// itemRecord: { itemId, spotId, acquiredAt }
function saveItem(itemRecord) {
  const items = getItems();
  items.push(itemRecord);
  _write(CONFIG.STORAGE_KEYS.items, items);
}

function getItems() {
  return _read(CONFIG.STORAGE_KEYS.items, []);
}

// ---- ペナルティ ----

// spotId 単位で再戦可能時刻(ISO文字列)を保存
function savePenalty(spotId, retryAt) {
  const penalties = _read(CONFIG.STORAGE_KEYS.penalties, {});
  penalties[spotId] = { retryAt };
  _write(CONFIG.STORAGE_KEYS.penalties, penalties);
}

function getPenalty(spotId) {
  const penalties = _read(CONFIG.STORAGE_KEYS.penalties, {});
  return penalties[spotId] || null;
}

// 現在ペナルティ中(再戦不可)かどうか
function isPenaltyActive(spotId) {
  const p = getPenalty(spotId);
  if (!p || !p.retryAt) return false;
  return Date.now() < new Date(p.retryAt).getTime();
}

// 再戦可能までの残り秒数(ペナルティ中でなければ0)
function getPenaltyRemainingSeconds(spotId) {
  const p = getPenalty(spotId);
  if (!p || !p.retryAt) return 0;
  const diff = new Date(p.retryAt).getTime() - Date.now();
  return diff > 0 ? Math.ceil(diff / 1000) : 0;
}

// ---- デバッグ ----

function clearDebugData() {
  localStorage.removeItem(CONFIG.STORAGE_KEYS.items);
  localStorage.removeItem(CONFIG.STORAGE_KEYS.penalties);
}
