// =====================================================
// app.js
// 全体の初期化・画面遷移・状態更新
// =====================================================

const App = {
  data: null,
  watching: false,
  lastPosition: null,
  currentBattle: null,
  currentSpot: null,
  currentInn: null,
  player: null,    // /api/me のプレイヤー状態(HP/gold等)
  waitTimer: null, // 待機(敗北/勝利)カウントダウン用
};

// ---- ユーティリティ ----
function $(id) {
  return document.getElementById(id);
}
function show(id) {
  $(id).classList.remove("hidden");
}
function hide(id) {
  $(id).classList.add("hidden");
}
function showScreen(name) {
  ["screen-top", "screen-explore", "screen-battle"].forEach((s) => hide(s));
  show("screen-" + name);
}

// =====================================================
// 初期化
// =====================================================
async function init() {
  // 認証ゲート: 未ログインなら登録/ログイン画面を表示し、成立まで待つ
  try {
    await AuthGate.ensureAuth();
    App.player = AuthGate.player;
  } catch (e) {
    console.error("認証状態の確認に失敗しました:", e);
  }
  await refreshSpotStates();
  updateHpDisplay();

  try {
    App.data = await loadGameData();
    $("data-status").textContent =
      "スポット " + App.data.spots.length + "件 / 敵 " + App.data.enemies.length +
      "件 / アイテム " + App.data.items.length + "件 を読み込みました";
    $("data-status").classList.remove("error");
  } catch (e) {
    $("data-status").textContent = "データファイルを読み込めませんでした: " + e.message;
    $("data-status").classList.add("error");
    console.error(e);
  }

  renderItems();
  bindEvents();
  buildSpotJumpList();
}

// =====================================================
// イベント登録
// =====================================================
function bindEvents() {
  $("btn-start").addEventListener("click", onStart);
  $("btn-stop").addEventListener("click", onStop);
  $("btn-attack").addEventListener("click", onAttack);
  $("btn-battle-back").addEventListener("click", () => {
    App.currentBattle = null;
    App.currentSpot = null;
    showScreen("explore");
    refreshMapSize();
    updateExplore(App.lastPosition);
  });
  $("btn-start-battle").addEventListener("click", onStartBattle);
  $("btn-rest").addEventListener("click", onRest);
  $("items-list").addEventListener("click", onItemListClick);
  $("btn-recenter").addEventListener("click", () => {
    if (!recenterMap()) {
      $("geo-error").textContent = "現在地がまだ取得できていません";
    }
  });
  $("btn-spot-list").addEventListener("click", openSpotList);
  $("btn-spot-list-close").addEventListener("click", closeSpotList);
  $("spot-list-modal").addEventListener("click", (e) => {
    if (e.target.id === "spot-list-modal") closeSpotList();
  });

  // --- デバッグ機能 ---
  $("btn-apply-mock").addEventListener("click", applyMockFromInputs);
  $("btn-clear-mock").addEventListener("click", () => {
    clearMockPosition();
    $("debug-status").textContent = "モック解除。実GPSの取得を再開しました";
    // 実GPSの監視を再開(モック設定時に停止しているため)
    startWatchPosition(onPositionUpdate, onPositionError);
  });
  $("btn-clear-storage").addEventListener("click", () => {
    clearDebugData();
    renderItems();
    $("debug-status").textContent = "localStorageをクリアしました";
    if (App.lastPosition) updateExplore(App.lastPosition);
  });
  $("debug-toggle").addEventListener("click", () => {
    $("debug-panel").classList.toggle("hidden");
  });
  $("chk-force-lose").addEventListener("change", (e) => {
    CONFIG.DEBUG_FORCE_LOSE = e.target.checked;
    $("debug-status").textContent = e.target.checked
      ? "強制敗北モードON: 次の戦闘で敗北します"
      : "強制敗北モードOFF";
  });
}

// =====================================================
// 位置情報の開始/停止
// =====================================================
function onStart() {
  showScreen("explore");
  refreshMapSize();
  $("geo-error").textContent = "";
  App.watching = true;
  refreshSpotStates();
  startWatchPosition(onPositionUpdate, onPositionError);
}

function onStop() {
  stopWatchPosition();
  App.watching = false;
  showScreen("top");
}

function onPositionUpdate(pos) {
  App.lastPosition = pos;
  $("geo-error").textContent = "";
  updateExplore(pos);
  reportLocationThrottled(pos); // サーバーへ現在地を報告(一定間隔)
}

function onPositionError(err) {
  $("geo-error").textContent = err.message;
}

// =====================================================
// 探索画面の更新
// =====================================================
function updateExplore(pos) {
  if (!pos) return;
  $("cur-lat").textContent = pos.latitude.toFixed(6);
  $("cur-lng").textContent = pos.longitude.toFixed(6);
  $("cur-acc").textContent =
    pos.accuracy != null ? Math.round(pos.accuracy) + " m" : "不明";
  $("cur-source").textContent = pos.mock ? "モック(テスト)" : "実GPS";

  // 地図に現在地を反映(スポットは地図に出さない)
  updateMapPosition(pos.latitude, pos.longitude, pos.accuracy);

  // 宿屋の近接判定(スポットとは独立に常に評価)
  updateInnArea(pos);

  if (!App.data || App.data.spots.length === 0) {
    setNearestName("-");
    $("nearest-dist").textContent = "-";
    setJudge("", "");
    hideEnemyArea();
    return;
  }

  const accOk =
    pos.accuracy == null || pos.accuracy <= CONFIG.GPS_ACCURACY_LIMIT_METERS;

  // 最寄りスポット(最上部・2行表示。距離の後ろに状態を付ける)
  const nearest = findNearestForDisplay(pos);
  if (nearest) {
    const d = Math.round(nearest.distance);
    let status;
    if (!accOk) {
      status = "精度不足";
    } else if (nearest.distance <= nearest.spot.radius_meters) {
      if (isPenaltyActive(nearest.spot.spot_id)) status = "再戦待機中";
      else if (isVictoryCooldownActive(nearest.spot.spot_id)) status = "撃破済み";
      else status = "範囲内";
    } else {
      status = "範囲外";
    }
    setNearestName(nearest.spot.spot_name);
    $("nearest-dist").textContent = d + " m(" + status + ")";
  } else {
    setNearestName("-");
    $("nearest-dist").textContent = "-";
  }

  // 精度不足
  if (!accOk) {
    clearWaitTimer();
    setJudge("", "位置精度が低いため判定を保留しています(屋外で再取得してください)");
    hideEnemyArea();
    return;
  }

  // 範囲内スポット(敵出現判定)
  const enterable = findEnterableSpot(pos, App.data.spots, pos.accuracy);
  if (!enterable) {
    clearWaitTimer();
    setJudge("", "");
    hideEnemyArea();
    return;
  }

  const spot = enterable.spot;

  // 敗北ペナルティ中
  if (isPenaltyActive(spot.spot_id)) {
    const sec = getPenaltyRemainingSeconds(spot.spot_id);
    setJudge("", "あと " + formatTime(sec) + " で再戦可能");
    hideEnemyArea();
    startWaitCountdown(spot, pos, "penalty");
    return;
  }

  // 勝利クールダウン中(撃破後の再出現待ち)
  if (isVictoryCooldownActive(spot.spot_id)) {
    const sec = getVictoryRemainingSeconds(spot.spot_id);
    setJudge("", "あと " + formatTime(sec) + " で敵が再出現");
    hideEnemyArea();
    startWaitCountdown(spot, pos, "victory");
    return;
  }

  // 敵定義チェック
  const enemy = App.data.enemyMap[spot.enemy_id];
  if (!enemy) {
    clearWaitTimer();
    setJudge("", "");
    showEnemyAreaError("敵データが見つかりません (enemy_id: " + spot.enemy_id + ")");
    return;
  }

  // 敵出現
  clearWaitTimer();
  setJudge("", "");
  showEnemyArea(spot, enemy);
}

// 最寄りスポット名を表示。長さに応じてフォントを縮小する。
// 最寄りスポット(表示用)。撃破済みスポットは指定距離以内でないと候補から除外する。
function findNearestForDisplay(pos) {
  let best = null;
  for (const spot of App.data.spots) {
    if (!spot.active) continue;
    const distance = calculateDistanceMeters(
      pos.latitude, pos.longitude, spot.latitude, spot.longitude
    );
    // 撃破済み(クールダウン中)は閾値より遠いと最寄り候補にしない
    if (
      isVictoryCooldownActive(spot.spot_id) &&
      distance > CONFIG.DEFEATED_HIDE_WITHIN_METERS
    ) {
      continue;
    }
    if (best === null || distance < best.distance) {
      best = { spot, distance };
    }
  }
  return best;
}

// スポット一覧モーダルを開く(近い順に名前・方位・距離)
function openSpotList() {
  buildSpotList();
  show("spot-list-modal");
}

function closeSpotList() {
  hide("spot-list-modal");
}

function buildSpotList() {
  const ul = $("spot-list");
  const note = $("spot-list-note");
  if (!App.data || App.data.spots.length === 0) {
    ul.innerHTML = "";
    note.textContent = "スポットデータがありません";
    return;
  }
  const pos = App.lastPosition;
  if (!pos) {
    ul.innerHTML = "";
    note.textContent = "現在地が未取得です。先に位置情報を取得してください。";
    return;
  }

  const rows = App.data.spots
    .filter((s) => s.active)
    .map((s) => {
      const distance = calculateDistanceMeters(
        pos.latitude, pos.longitude, s.latitude, s.longitude
      );
      const bearing = calculateBearing(
        pos.latitude, pos.longitude, s.latitude, s.longitude
      );
      return { spot: s, distance, compass: bearingToCompass(bearing) };
    })
    .sort((a, b) => a.distance - b.distance);

  note.textContent = "有効スポット " + rows.length + "件(現在地から)";
  ul.innerHTML = rows
    .map((r) => {
      let badge = "";
      if (isVictoryCooldownActive(r.spot.spot_id)) badge = " <span class=\"spot-badge defeated\">撃破済み</span>";
      else if (isPenaltyActive(r.spot.spot_id)) badge = " <span class=\"spot-badge penalty\">待機中</span>";
      return (
        "<li class=\"spot-item\">" +
        "<span class=\"spot-item-name\">" + r.spot.spot_name + badge + "</span>" +
        "<span class=\"spot-item-meta\">" + r.compass + " / " + formatDistance(r.distance) + "</span>" +
        "</li>"
      );
    })
    .join("");
}

// 距離を読みやすく整形(1km以上はkm表記)
function formatDistance(m) {
  if (m >= 1000) return (m / 1000).toFixed(m >= 10000 ? 0 : 1) + " km";
  return Math.round(m) + " m";
}

function setNearestName(name) {
  const el = $("nearest-name");
  el.textContent = name;
  el.classList.remove("is-long", "is-xlong");
  const len = Array.from(name).length;
  if (len >= 13) el.classList.add("is-xlong");
  else if (len >= 9) el.classList.add("is-long");
}

function setJudge(state, detail) {
  const st = $("judge-state");
  if (state) {
    st.textContent = state;
    st.classList.remove("hidden");
  } else {
    st.textContent = "";
    st.classList.add("hidden");
  }
  $("judge-detail").textContent = detail || "";
}

function hideEnemyArea() {
  hide("enemy-area");
}

function showEnemyAreaError(msg) {
  show("enemy-area");
  $("enemy-area-name").textContent = "-";
  $("enemy-area-enemy").textContent = msg;
  $("btn-start-battle").disabled = true;
}

function showEnemyArea(spot, enemy) {
  show("enemy-area");
  $("enemy-area-name").textContent = spot.spot_name;
  $("enemy-area-enemy").textContent = enemy.enemy_name;
  $("btn-start-battle").disabled = false;
  App.currentSpot = spot;
  App._pendingEnemy = enemy;
}

// 待機カウントダウン(敗北ペナルティ/勝利クールダウン共通)
function clearWaitTimer() {
  if (App.waitTimer) {
    clearInterval(App.waitTimer);
    App.waitTimer = null;
  }
}

function startWaitCountdown(spot, pos, kind) {
  clearWaitTimer();
  App.waitTimer = setInterval(() => {
    const active =
      kind === "penalty"
        ? isPenaltyActive(spot.spot_id)
        : isVictoryCooldownActive(spot.spot_id);
    if (!active) {
      clearWaitTimer();
      updateExplore(App.lastPosition || pos);
      return;
    }
    const sec =
      kind === "penalty"
        ? getPenaltyRemainingSeconds(spot.spot_id)
        : getVictoryRemainingSeconds(spot.spot_id);
    const word = kind === "penalty" ? "で再戦可能" : "で敵が再出現";
    $("judge-detail").textContent = "あと " + formatTime(sec) + " " + word;
  }, 1000);
}

function formatTime(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return h + "時間" + String(m).padStart(2, "0") + "分";
  return m + "分" + String(s).padStart(2, "0") + "秒";
}

// =====================================================
// 戦闘
// =====================================================
// 戦闘開始: サーバーが結果を確定(全ターン)し、クライアントはそれを再生する。
async function onStartBattle() {
  const spot = App.currentSpot;
  if (!spot) return;
  if (isPenaltyActive(spot.spot_id) || isVictoryCooldownActive(spot.spot_id)) {
    updateExplore(App.lastPosition);
    return;
  }
  $("btn-start-battle").disabled = true;
  let res;
  try {
    res = await API.battle(spot.spot_id);
  } catch (e) {
    $("btn-start-battle").disabled = false;
    await refreshSpotStates();
    setJudge("", e.message || "戦闘を開始できませんでした");
    updateExplore(App.lastPosition);
    return;
  }
  const enemy = App._pendingEnemy || {};
  App.currentBattle = {
    res: res,
    enemyName: res.enemyName,
    enemyMaxHp: res.enemyMaxHp,
    playerMaxHp: res.playerMaxHp,
    enemyImage: enemy.image || "",
    turnIndex: 0,
    curEnemyHp: res.enemyMaxHp,
    curPlayerHp: res.startPlayerHp,
    logLines: ["戦闘開始! " + res.enemyName + " が現れた"],
    finished: false,
    result: null,
  };
  renderBattle();
  showScreen("battle");
}

// 攻撃ボタン: サーバーが返したターンを1つずつ再生する。
function onAttack() {
  const b = App.currentBattle;
  if (!b || b.finished) return;
  const turn = b.res.turns[b.turnIndex];
  if (!turn) { finishBattle(); return; }
  turn.logs.forEach((l) => b.logLines.push(l));
  b.curPlayerHp = turn.playerHp;
  b.curEnemyHp = turn.enemyHp;
  b.turnIndex++;
  renderBattle();
  if (b.turnIndex >= b.res.turns.length) finishBattle();
}

function finishBattle() {
  const b = App.currentBattle;
  b.finished = true;
  b.result = b.res.result;
  if (App.player) App.player.hp = b.res.finalPlayerHp;
  if (b.result === "win") handleWin(b.res);
  else handleLose(b.res);
  renderBattle();
  updateHpDisplay();
}

function renderBattle() {
  const b = App.currentBattle;
  $("battle-enemy-name").textContent = b.enemyName;
  $("battle-enemy-hp").textContent = b.curEnemyHp;
  $("battle-enemy-hp-max").textContent = b.enemyMaxHp;
  $("battle-player-hp").textContent = b.curPlayerHp;
  $("battle-player-hp-max").textContent = b.playerMaxHp;

  $("enemy-hp-bar").style.width = (b.enemyMaxHp ? (b.curEnemyHp / b.enemyMaxHp) * 100 : 0) + "%";
  $("player-hp-bar").style.width = (b.playerMaxHp ? (b.curPlayerHp / b.playerMaxHp) * 100 : 0) + "%";

  const img = $("battle-enemy-img");
  if (b.enemyImage) {
    img.src = b.enemyImage;
    img.alt = b.enemyName;
    img.onerror = () => { img.style.display = "none"; };
    img.style.display = "block";
  } else {
    img.style.display = "none";
  }

  const logEl = $("battle-log");
  logEl.innerHTML = b.logLines.map((l) => "<div>" + l + "</div>").join("");
  logEl.scrollTop = logEl.scrollHeight;

  if (b.finished) {
    $("btn-attack").disabled = true;
    $("battle-result").textContent = b.result === "win" ? "勝利!" : "敗北...";
    $("battle-result").className = "battle-result " + (b.result === "win" ? "win" : "lose");
    show("battle-result");
    show("btn-battle-back");
  } else {
    $("btn-attack").disabled = false;
    hide("battle-result");
    hide("btn-battle-back");
  }
}

function handleWin(res) {
  const spot = App.currentSpot;
  if (res.victoryUntil) saveVictoryCooldown(spot.spot_id, res.victoryUntil);
  let txt;
  if (res.reward) {
    txt = "「" + res.reward.name + "」を手に入れた!(この敵は約" + res.cooldownMin + "分後に再出現)";
  } else {
    txt = "勝利した!(この敵は約" + res.cooldownMin + "分後に再出現)";
  }
  $("battle-reward").textContent = txt;
  show("battle-reward");
  renderItems();
}

function handleLose(res) {
  const spot = App.currentSpot;
  if (res.penaltyUntil) savePenalty(spot.spot_id, res.penaltyUntil);
  $("battle-reward").textContent =
    res.cooldownMin + "分間このスポットでは再戦できません(時間経過後に少しHPが回復します)";
  show("battle-reward");
}

// ---- 宿屋・回復・状態 ----
function updateHpDisplay() {
  const el = document.getElementById("auth-status");
  if (el && App.player) {
    el.textContent = App.player.name + " HP:" + App.player.hp + "/" + App.player.maxHp + " G:" + App.player.gold;
  }
}

async function refreshSpotStates() {
  try { setSpotStates(await API.spotStates()); } catch (e) { /* 未ログイン等は無視 */ }
}

function updateInnArea(pos) {
  const area = $("inn-area");
  if (!area) return;
  const inns = (App.data && App.data.inns) || [];
  let near = null;
  for (const inn of inns) {
    if (inn.latitude == null || inn.longitude == null) continue;
    const d = calculateDistanceMeters(pos.latitude, pos.longitude, inn.latitude, inn.longitude);
    const radius = inn.radius_meters || 50;
    if (d <= radius && (near === null || d < near.distance)) near = { inn: inn, distance: d };
  }
  if (near) {
    show("inn-area");
    $("inn-area-name").textContent = near.inn.inn_name;
    App.currentInn = near.inn;
    $("btn-rest").disabled = false;
  } else {
    hide("inn-area");
    App.currentInn = null;
  }
}

async function onRest() {
  const inn = App.currentInn;
  if (!inn) return;
  $("btn-rest").disabled = true;
  try {
    const r = await API.innRest(inn.inn_id);
    if (App.player) App.player.hp = r.hp;
    updateHpDisplay();
    $("inn-msg").textContent = r.innName + "で休んだ。HP全回復! (" + r.hp + "/" + r.maxHp + ")";
  } catch (e) {
    $("inn-msg").textContent = e.message;
  }
  $("btn-rest").disabled = false;
}

async function onItemListClick(e) {
  const btn = e.target.closest(".item-use-btn");
  if (!btn) return;
  btn.disabled = true;
  $("items-msg").textContent = "";
  try {
    const r = await API.useItem(btn.dataset.item);
    if (App.player) App.player.hp = r.hp;
    updateHpDisplay();
    $("items-msg").textContent = r.itemName + " を使った(+" + r.healed + " HP / 現在 " + r.hp + "/" + r.maxHp + ")";
  } catch (err) {
    $("items-msg").textContent = err.message;
  }
  renderItems();
}

// =====================================================
// 所持アイテム表示
// =====================================================
async function renderItems() {
  const el = $("items-list");
  let items = [];
  try { items = await API.inventory(); } catch (e) { items = []; }
  if (!items || items.length === 0) {
    el.innerHTML = "<li class='muted'>まだアイテムを持っていません</li>";
    $("items-count").textContent = "0";
    return;
  }
  const total = items.reduce((a, i) => a + i.qty, 0);
  $("items-count").textContent = String(total);
  el.innerHTML = items
    .map((it) => {
      const rarity = it.rarity ? " [" + it.rarity + "]" : "";
      const useBtn = it.healAmount > 0
        ? " <button class=\"item-use-btn\" data-item=\"" + it.itemId + "\">使う(+" + it.healAmount + ")</button>"
        : "";
      return "<li>" + it.name + rarity + " <span class=\"muted\">x" + it.qty + "</span>" + useBtn + "</li>";
    })
    .join("");
}

// =====================================================
// デバッグ: 位置モック
// =====================================================
function applyMockFromInputs() {
  const lat = parseFloat($("mock-lat").value);
  const lng = parseFloat($("mock-lng").value);
  const acc = parseFloat($("mock-acc").value);
  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    $("debug-status").textContent = "緯度・経度を正しく入力してください";
    return;
  }
  const accuracy = Number.isNaN(acc) ? 10 : acc;
  setMockPosition(lat, lng, accuracy);
  $("debug-status").textContent =
    "モック位置を適用: " + lat.toFixed(6) + ", " + lng.toFixed(6) + " (精度" + accuracy + "m)";
  if ($("screen-explore").classList.contains("hidden")) {
    showScreen("explore");
    refreshMapSize();
  }
  App.lastPosition = { latitude: lat, longitude: lng, accuracy, mock: true };
  updateExplore(App.lastPosition);
}

// スポットへワープ(プルダウン選択 → そのスポット座標をモック適用)
function buildSpotJumpList() {
  const sel = $("spot-jump");
  if (!App.data) return;
  sel.innerHTML =
    "<option value=''>-- スポットを選択してワープ --</option>" +
    App.data.spots
      .map((s) => "<option value=\"" + s.spot_id + "\">" + s.spot_name + " (" + s.spot_id + ")</option>")
      .join("");
  sel.addEventListener("change", () => {
    const spot = App.data.spots.find((s) => s.spot_id === sel.value);
    if (!spot) return;
    $("mock-lat").value = spot.latitude;
    $("mock-lng").value = spot.longitude;
    $("mock-acc").value = 10;
    setMockPosition(spot.latitude, spot.longitude, 10);
    $("debug-status").textContent = "「" + spot.spot_name + "」中心へワープしました";
    if ($("screen-explore").classList.contains("hidden")) {
      showScreen("explore");
      refreshMapSize();
    }
    App.lastPosition = {
      latitude: spot.latitude,
      longitude: spot.longitude,
      accuracy: 10,
      mock: true,
    };
    updateExplore(App.lastPosition);
  });
}

// 起動
window.addEventListener("DOMContentLoaded", init);
