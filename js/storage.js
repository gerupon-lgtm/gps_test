// =====================================================
// storage.js
// サーバー権威版: スポット状態(クールダウン)はサーバーの
// /api/spot-states から取得し、メモリにキャッシュする。
// 関数シグネチャは旧localStorage版と互換(app.js 側の変更を最小化)。
// =====================================================

let _spotStates = {}; // { spotId: { penaltyUntil: ISO|null, victoryUntil: ISO|null } }

// サーバー応答(配列)でキャッシュを差し替える
function setSpotStates(list) {
  _spotStates = {};
  (list || []).forEach((s) => {
    _spotStates[s.spotId] = { penaltyUntil: s.penaltyUntil, victoryUntil: s.victoryUntil };
  });
}

function _activeUntil(v) { return !!v && new Date(v).getTime() > Date.now(); }
function _remain(v) {
  if (!v) return 0;
  const d = new Date(v).getTime() - Date.now();
  return d > 0 ? Math.ceil(d / 1000) : 0;
}
function _ensure(spotId) {
  if (!_spotStates[spotId]) _spotStates[spotId] = { penaltyUntil: null, victoryUntil: null };
  return _spotStates[spotId];
}

// ---- 敗北ペナルティ ----
function savePenalty(spotId, retryAt) { _ensure(spotId).penaltyUntil = retryAt; }
function getPenalty(spotId) {
  return _spotStates[spotId] ? { retryAt: _spotStates[spotId].penaltyUntil } : null;
}
function isPenaltyActive(spotId) {
  return _activeUntil(_spotStates[spotId] && _spotStates[spotId].penaltyUntil);
}
function getPenaltyRemainingSeconds(spotId) {
  return _remain(_spotStates[spotId] && _spotStates[spotId].penaltyUntil);
}

// ---- 勝利クールダウン(撃破後の再出現待ち) ----
function saveVictoryCooldown(spotId, availableAt) { _ensure(spotId).victoryUntil = availableAt; }
function getVictoryCooldown(spotId) {
  return _spotStates[spotId] ? { availableAt: _spotStates[spotId].victoryUntil } : null;
}
function isVictoryCooldownActive(spotId) {
  return _activeUntil(_spotStates[spotId] && _spotStates[spotId].victoryUntil);
}
function getVictoryRemainingSeconds(spotId) {
  return _remain(_spotStates[spotId] && _spotStates[spotId].victoryUntil);
}

// ---- 在庫はサーバーから取得(renderItems が API.inventory を使用) ----
function getItems() { return []; }
function saveItem() { /* サーバー権威化により不要(戦闘勝利でサーバーが付与) */ }

// ---- デバッグ ----
function clearDebugData() { _spotStates = {}; }
