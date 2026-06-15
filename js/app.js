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
  currentShop: null,
  player: null,    // /api/me のプレイヤー状態(HP/gold等)
  waitTimer: null, // 待機(敗北/勝利)カウントダウン用
  downedTimer: null,
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
  if (App.data) setPois(App.data.inns, App.data.shops);
  updateDownedOverlay();
  resumeBattleIfAny();
}

// =====================================================
// イベント登録
// =====================================================
function bindEvents() {
  $("btn-start").addEventListener("click", onStart);
  $("btn-stop").addEventListener("click", onStop);
  $("btn-attack").addEventListener("click", onAttack);
  $("btn-use-item").addEventListener("click", onUseItemInBattle);
  $("battle-item-list").addEventListener("click", onBattleItemClick);
  $("btn-battle-back").addEventListener("click", () => {
    App.currentBattle = null;
    App.currentSpot = null;
    showScreen("explore");
    refreshMapSize();
    updateExplore(App.lastPosition);
  });
  $("btn-start-battle").addEventListener("click", onStartBattle);
  $("items-list").addEventListener("click", onItemListClick);
  $("shop-buy-list").addEventListener("click", onShopBuyClick);
  $("shop-sell-list").addEventListener("click", onShopSellClick);
  $("shop-close").addEventListener("click", closeShopModal);
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
    setJudge("", spot.spot_name + ": あと " + formatTime(sec) + " で再戦可能");
    hideEnemyArea();
    startWaitCountdown(spot, pos, "penalty");
    return;
  }

  // 勝利クールダウン中(撃破後の再出現待ち)
  if (isVictoryCooldownActive(spot.spot_id)) {
    const sec = getVictoryRemainingSeconds(spot.spot_id);
    setJudge("", spot.spot_name + ": あと " + formatTime(sec) + " で敵が再出現");
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
async function openSpotList() {
  show("spot-list-modal");
  await refreshSpotStates();   // 開いた時点の最新状態を取得
  buildSpotList();
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
      if (isVictoryCooldownActive(r.spot.spot_id)) {
        const min = Math.ceil(getVictoryRemainingSeconds(r.spot.spot_id) / 60);
        badge = " <span class=\"spot-badge defeated\">撃破済み 残り" + min + "分</span>";
      } else if (isPenaltyActive(r.spot.spot_id)) {
        const min = Math.ceil(getPenaltyRemainingSeconds(r.spot.spot_id) / 60);
        badge = " <span class=\"spot-badge penalty\">待機中 残り" + min + "分</span>";
      }
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
    $("judge-detail").textContent = spot.spot_name + ": あと " + formatTime(sec) + " " + word;
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
// 戦闘開始: ターン制(サーバー権威)。/api/battle/start でセッション開始。
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
    res = await API.battleStart(spot.spot_id);
  } catch (e) {
    $("btn-start-battle").disabled = false;
    await refreshSpotStates();
    setJudge("", e.message || "戦闘を開始できませんでした");
    updateExplore(App.lastPosition);
    return;
  }
  startBattleUI(res, spot.spot_id);
}

// サーバー応答からバトルUIを構築(新規開始/リロード復帰 共通)
function startBattleUI(res, spotId) {
  if (!App.currentSpot || App.currentSpot.spot_id !== spotId) {
    App.currentSpot = { spot_id: spotId };
  }
  App.currentBattle = {
    enemyName: res.enemy.name,
    enemyMaxHp: res.enemy.maxHp,
    playerMaxHp: res.playerMaxHp,
    enemyImage: res.enemy.image || (App._pendingEnemy && App._pendingEnemy.image) || "",
    curEnemyHp: res.enemyHp,
    curPlayerHp: res.playerHp,
    logLines: [res.resumed ? "戦闘中… (復帰しました)" : ("戦闘開始! " + res.enemy.name + " が現れた")],
    finished: false,
    result: null,
    busy: false,
  };
  if (App.player && typeof res.poisoned !== "undefined") App.player.poisoned = res.poisoned;
  updateHpDisplay();
  hideBattleItemList();
  renderBattle();
  showScreen("battle");
}

// 1アクションをサーバーへ送信(attack / useItem)。1アクション=1ターン。
async function doBattleAction(action, itemId) {
  const b = App.currentBattle;
  if (!b || b.finished || b.busy) return;
  b.busy = true;
  $("btn-attack").disabled = true;
  $("btn-use-item").disabled = true;
  hideBattleItemList();
  let r;
  try {
    r = await API.battleAction(action, itemId);
  } catch (e) {
    b.busy = false;
    renderBattle();
    $("battle-reward").textContent = e.message || "行動できませんでした";
    show("battle-reward");
    return;
  }
  b.busy = false;
  (r.logs || []).forEach((l) => b.logLines.push(l));
  b.curPlayerHp = r.playerHp;
  b.curEnemyHp = r.enemyHp;
  if (App.player && typeof r.poisoned !== "undefined") App.player.poisoned = r.poisoned;
  if (r.finished) {
    b.finished = true;
    b.result = r.result;
    if (App.player) App.player.hp = r.playerHp;
    if (r.result === "win") handleWin(r.win);
    else handleLose(r);
    renderBattle();
    updateHpDisplay();
  } else {
    if (App.player) App.player.hp = r.playerHp;
    renderBattle();
    updateHpDisplay();
  }
}

function onAttack() { doBattleAction("attack"); }

// 戦闘中の回復アイテム選択リストを開閉
async function onUseItemInBattle() {
  const el = $("battle-item-list");
  if (!el) return;
  if (!el.classList.contains("hidden")) { el.classList.add("hidden"); return; }
  let items = [];
  try { items = await API.inventory(); } catch (e) { items = []; }
  const usable = (items || []).filter((i) => (i.healAmount > 0 || i.curePoison) && i.qty > 0);
  if (usable.length === 0) {
    el.innerHTML = "<div class=\"muted small\">使えるアイテムがありません</div>";
  } else {
    el.innerHTML = usable.map((i) => {
      const eff = i.healAmount > 0 ? ("+" + i.healAmount) : "毒消し";
      return "<button class=\"battle-item-btn\" data-item=\"" + i.itemId + "\">" + i.name + "(" + eff + ") x" + i.qty + "</button>";
    }).join("");
  }
  el.classList.remove("hidden");
}

function hideBattleItemList() {
  const el = $("battle-item-list");
  if (el) el.classList.add("hidden");
}

function onBattleItemClick(e) {
  const btn = e.target.closest(".battle-item-btn");
  if (!btn) return;
  doBattleAction("useItem", btn.dataset.item);
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
    $("btn-use-item").disabled = true;
    hide("btn-use-item");
    hideBattleItemList();
    $("battle-result").textContent = b.result === "win" ? "勝利!" : "敗北...";
    $("battle-result").className = "battle-result " + (b.result === "win" ? "win" : "lose");
    show("battle-result");
    show("btn-battle-back");
  } else {
    $("btn-attack").disabled = b.busy;
    $("btn-use-item").disabled = b.busy;
    show("btn-use-item");
    hide("battle-result");
    hide("btn-battle-back");
  }
}

function handleWin(win) {
  const spot = App.currentSpot;
  if (win && win.victoryUntil && spot) saveVictoryCooldown(spot.spot_id, win.victoryUntil);
  if (App.player && win) {
    App.player.hp = win.hp; App.player.maxHp = win.maxHp;
    App.player.gold = win.gold; App.player.level = win.level;
    App.player.attack = win.attack; App.player.defense = win.defense;
  }
  const parts = ["勝利! EXP+" + (win ? win.expGain : 0) + " / " + (win ? win.goldGain : 0) + "G"];
  if (win && win.leveledUp) parts.push("レベルアップ! Lv" + win.level + "(HP全回復)");
  if (win && win.rewards && win.rewards.length) parts.push("入手: " + win.rewards.map((r) => r.name).join("、"));
  $("battle-reward").textContent = parts.join(" / ");
  show("battle-reward");
  renderItems();
  updateHpDisplay();
}

function handleLose(r) {
  if (App.player && r.downedUntil) App.player.downedUntil = r.downedUntil;
  $("battle-reward").textContent = "敗北... 戦闘不能になった";
  show("battle-reward");
  updateDownedOverlay();
}

// ---- 戦闘不能オーバーレイ ----
function updateDownedOverlay() {
  const ov = $("downed-overlay");
  if (!ov) return;
  const until = App.player && App.player.downedUntil ? new Date(App.player.downedUntil).getTime() : 0;
  const remain = until - Date.now();
  if (remain > 0) {
    ov.classList.remove("hidden");
    $("downed-sec").textContent = Math.ceil(remain / 1000);
    if (!App.downedTimer) App.downedTimer = setInterval(onDownedTick, 1000);
  } else {
    ov.classList.add("hidden");
    if (App.downedTimer) { clearInterval(App.downedTimer); App.downedTimer = null; }
  }
}

async function onDownedTick() {
  const until = App.player && App.player.downedUntil ? new Date(App.player.downedUntil).getTime() : 0;
  const remain = until - Date.now();
  if (remain > 0) {
    $("downed-sec").textContent = Math.ceil(remain / 1000);
    return;
  }
  if (App.downedTimer) { clearInterval(App.downedTimer); App.downedTimer = null; }
  try { App.player = await API.me(); } catch (e) {}
  $("downed-overlay").classList.add("hidden");
  updateHpDisplay();
  if (App.lastPosition) updateExplore(App.lastPosition);
}

// ---- 散策拾いトースト ----
let _toastTimer = null;
function showToast(msg) {
  const el = $("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.remove("hidden");
  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.add("hidden"), 3500);
}
function onPickup(pickup) {
  showToast("✨ " + pickup.name + " を拾った!");
  renderItems();
}

// ---- POIアイコンのタップ操作(宿屋/道具屋) ----
// マップのポップアップ内ボタンから呼ばれる(グローバル)。範囲内のみ利用可。
function onInnEnter(innId) {
  const inn = ((App.data && App.data.inns) || []).find((n) => n.inn_id === innId);
  if (!inn) return;
  const pos = App.lastPosition;
  const d = pos ? calculateDistanceMeters(pos.latitude, pos.longitude, inn.latitude, inn.longitude) : Infinity;
  if (d > (CONFIG.CHECKIN_DISTANCE_METERS || 10)) { showToast("近づいてください(あと約" + Math.round(d) + "m)"); return; }
  API.innRest(inn.inn_id).then((r) => {
    if (App.player) { App.player.hp = r.hp; App.player.gold = r.gold; App.player.poisoned = false; App.player.downedUntil = null; }
    updateHpDisplay();
    updateDownedOverlay();
    showToast(inn.inn_name + "で休んだ。HP全回復! (-" + (r.cost || 0) + "G)");
    closePoiPopups();
  }).catch((e) => showToast(e.message));
}

function onShopEnter(shopId) {
  const shop = ((App.data && App.data.shops) || []).find((s) => s.shop_id === shopId);
  if (!shop) return;
  const pos = App.lastPosition;
  const d = pos ? calculateDistanceMeters(pos.latitude, pos.longitude, shop.latitude, shop.longitude) : Infinity;
  if (d > (CONFIG.CHECKIN_DISTANCE_METERS || 10)) { showToast("近づいてください(あと約" + Math.round(d) + "m)"); return; }
  App.currentShop = shop;
  closePoiPopups();
  $("shop-area-name").textContent = shop.shop_name;
  $("shop-msg").textContent = "";
  show("shop-modal");
  buildShopLists();
}

function closeShopModal() { hide("shop-modal"); App.currentShop = null; }

async function buildShopLists() {
  let buy = [];
  try { buy = await API.shopItems(); } catch (e) { buy = []; }
  $("shop-buy-list").innerHTML = (buy && buy.length)
    ? buy.map((it) => "<li><span>" + it.name + " <span class=\"muted\">" + it.price + "G</span></span><button class=\"shop-buy-btn\" data-item=\"" + it.itemId + "\">買う</button></li>").join("")
    : "<li class=\"muted\">商品なし</li>";
  let inv = [];
  try { inv = await API.inventory(); } catch (e) { inv = []; }
  const sellable = (inv || []).filter((i) => i.sellable && i.qty > 0);
  $("shop-sell-list").innerHTML = sellable.length
    ? sellable.map((i) => "<li><span>" + i.name + " <span class=\"muted\">x" + i.qty + "</span></span><button class=\"shop-sell-btn\" data-item=\"" + i.itemId + "\">売(" + i.sellPrice + ")</button></li>").join("")
    : "<li class=\"muted\">売れる物なし</li>";
}

async function onShopBuyClick(e) {
  const btn = e.target.closest(".shop-buy-btn");
  if (!btn || !App.currentShop) return;
  btn.disabled = true;
  try {
    const r = await API.buyItem(App.currentShop.shop_id, btn.dataset.item, 1);
    if (App.player) App.player.gold = r.gold;
    updateHpDisplay();
    $("shop-msg").textContent = r.itemName + " を買った(残り " + r.gold + "G)";
  } catch (err) { $("shop-msg").textContent = err.message; }
  buildShopLists();
}

async function onShopSellClick(e) {
  const btn = e.target.closest(".shop-sell-btn");
  if (!btn) return;
  btn.disabled = true;
  try {
    const r = await API.sellItem(btn.dataset.item, 1);
    if (App.player) App.player.gold = r.gold;
    updateHpDisplay();
    $("shop-msg").textContent = r.itemName + " を売った(+" + r.gain + "G / 残り " + r.gold + "G)";
  } catch (err) { $("shop-msg").textContent = err.message; }
  buildShopLists();
}

// リロード時に進行中の戦闘があれば復帰
async function resumeBattleIfAny() {
  let cur;
  try { cur = await API.battleCurrent(); } catch (e) { return; }
  if (!cur || !cur.active) return;
  startBattleUI(cur, cur.spotId);
}

// ---- 宿屋・回復・状態 ----
function _esc(x) {
  return String(x).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}

function updateHpDisplay() {
  const p = App.player;
  const hud = document.getElementById("status-hud");
  if (hud && p) {
    const pct = p.maxHp ? Math.max(0, Math.min(100, (p.hp / p.maxHp) * 100)) : 0;
    const color = pct > 50 ? "#22c55e" : pct > 25 ? "#eab308" : "#ef4444";
    hud.innerHTML =
      '<div class="hud-row hud-name">' + _esc(p.name) + ' <span class="hud-lv">Lv' + (p.level || 1) + '</span>' +
        (p.poisoned ? ' <span class="hud-poison">毒</span>' : '') + '</div>' +
      '<div class="hud-row"><span class="hud-label">HP</span><span class="hud-bar"><span class="hud-bar-fill" style="width:' + pct + '%;background:' + color + '"></span></span><span class="hud-val">' + p.hp + '/' + p.maxHp + '</span></div>' +
      '<div class="hud-row"><span class="hud-label">G</span><span class="hud-gold">' + p.gold + '</span></div>';
    hud.classList.remove("hidden");
  }
}

async function refreshSpotStates() {
  try { setSpotStates(await API.spotStates()); } catch (e) { /* 未ログイン等は無視 */ }
}



async function onItemListClick(e) {
  const btn = e.target.closest(".item-use-btn");
  if (!btn) return;
  btn.disabled = true;
  $("items-msg").textContent = "";
  try {
    const r = await API.useItem(btn.dataset.item);
    if (App.player) { App.player.hp = r.hp; if (typeof r.poisoned !== "undefined") App.player.poisoned = r.poisoned; }
    updateHpDisplay();
    $("items-msg").textContent = (r.message || (r.itemName + "を使った")) + " / 現在 " + r.hp + "/" + r.maxHp;
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
      const usable = it.healAmount > 0 || it.curePoison;
      const eff = it.healAmount > 0 ? ("+" + it.healAmount) : "毒消し";
      const useBtn = usable
        ? " <button class=\"item-use-btn\" data-item=\"" + it.itemId + "\">使う(" + eff + ")</button>"
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
