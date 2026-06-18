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
  battleReturnTimer: null,
  marketPollTimer: null,
  marketSeenListings: null,
  defeatedSpotIds: new Set(),
  exploreStartPosition: null,
  exploreResult: null,
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
  refreshDefeatedSpots();
  updateDownedOverlay();
  resumeBattleIfAny();
  startMarketPolling();
}

// =====================================================
// イベント登録
// =====================================================
function bindEvents() {
  $("btn-start").addEventListener("click", onStart);
  $("btn-stop").addEventListener("click", onStop);
  $("explore-result-close").addEventListener("click", closeExploreResult);
  $("explore-result-ok").addEventListener("click", closeExploreResult);
  $("explore-result-modal").addEventListener("click", (e) => {
    if (e.target.id === "explore-result-modal") closeExploreResult();
  });
  $("btn-attack").addEventListener("click", onAttack);
  $("btn-use-item").addEventListener("click", onUseItemInBattle);
  $("btn-flee").addEventListener("click", onFlee);
  $("battle-item-list").addEventListener("click", onBattleItemClick);
  $("btn-battle-back").addEventListener("click", () => {
    returnToExploreFromBattle();
  });
  $("btn-start-battle").addEventListener("click", onStartBattle);
  $("items-list").addEventListener("click", onItemListClick);
  $("shop-buy-list").addEventListener("click", onShopBuyClick);
  $("shop-sell-list").addEventListener("click", onShopSellClick);
  $("shop-close").addEventListener("click", closeShopModal);
  $("shop-confirm-yes").addEventListener("click", onShopConfirmYes);
  $("shop-confirm-no").addEventListener("click", hideShopConfirm);
  $("status-hud").addEventListener("click", openMenu);
  $("menu-content").addEventListener("click", onMenuClick);
  $("menu-overlay").addEventListener("click", function (e) { if (e.target.id === "menu-overlay") closeMenu(); });
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
  App.exploreStartPosition = App.lastPosition ? {
    latitude: App.lastPosition.latitude,
    longitude: App.lastPosition.longitude,
  } : null;
  App.exploreResult = { defeatedCount: 0, farthest: null };
  refreshSpotStates();
  startWatchPosition(onPositionUpdate, onPositionError);
}

function onStop() {
  stopWatchPosition();
  App.watching = false;
  if (App.exploreResult && App.exploreResult.defeatedCount > 0) {
    showExploreResult();
    return;
  }
  clearExploreSession();
  showScreen("top");
}

function onPositionUpdate(pos) {
  App.lastPosition = pos;
  if (App.watching && !App.exploreStartPosition) {
    App.exploreStartPosition = {
      latitude: pos.latitude,
      longitude: pos.longitude,
    };
  }
  $("geo-error").textContent = "";
  updateExplore(pos);
  reportLocationThrottled(pos); // サーバーへ現在地を報告(一定間隔)
}

function clearExploreSession() {
  App.exploreStartPosition = null;
  App.exploreResult = null;
}

function showExploreResult() {
  const farthest = App.exploreResult && App.exploreResult.farthest;
  if (!farthest) {
    clearExploreSession();
    showScreen("top");
    return;
  }
  $("explore-result-spot").textContent = farthest.spotName;
  $("explore-result-distance").textContent = formatDistance(farthest.distance);
  show("explore-result-modal");
}

function closeExploreResult() {
  hide("explore-result-modal");
  clearExploreSession();
  showScreen("top");
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

  // 撃破済み/待機中はクールダウン中。残り時間は画面に出さず、スポット一覧で確認する。
  if (isPenaltyActive(spot.spot_id) || isVictoryCooldownActive(spot.spot_id)) {
    clearWaitTimer();
    setJudge("", "");
    hideEnemyArea();
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
  await refreshDefeatedSpots(); // 永続的な撃破履歴も同期
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
      } else if (App.defeatedSpotIds && App.defeatedSpotIds.has(r.spot.spot_id)) {
        badge = " <span class=\"spot-badge defeated\">撃破済み</span>";
      }
      return (
        "<li class=\"spot-item\">" +
        "<span class=\"spot-item-name\">" + _esc(r.spot.spot_name) + badge + "</span>" +
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
  $("btn-flee").disabled = true;
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
  const wasPoisoned = !!(App.player && App.player.poisoned);
  (r.logs || []).forEach((l) => b.logLines.push(l));
  b.curPlayerHp = r.playerHp;
  b.curEnemyHp = r.enemyHp;
  if (App.player && typeof r.poisoned !== "undefined") {
    App.player.poisoned = r.poisoned;
    notifyPoisonChange(wasPoisoned, r.poisoned);
  }
  if (r.finished) {
    b.finished = true;
    b.result = r.result;
    if (App.player) App.player.hp = r.playerHp;
    if (r.result === "win") handleWin(r.win);
    else if (r.result === "flee") handleFlee(r);
    else handleLose(r);
    renderBattle();
    updateHpDisplay();
  } else {
    if (App.player) App.player.hp = r.playerHp;
    renderBattle();
    updateHpDisplay();
  }
  if (action === "useItem") renderItems();
}

function onAttack() { doBattleAction("attack"); }
function onFlee() { doBattleAction("flee"); }

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

function clearBattleReturnTimer() {
  if (App.battleReturnTimer) {
    clearTimeout(App.battleReturnTimer);
    App.battleReturnTimer = null;
  }
}

function returnToExploreFromBattle() {
  clearBattleReturnTimer();
  App.currentBattle = null;
  App.currentSpot = null;
  showScreen("explore");
  refreshMapSize();
  updateExplore(App.lastPosition);
}

function scheduleBattleAutoReturn() {
  clearBattleReturnTimer();
  const delay = Math.max(0, Number(CONFIG.BATTLE_RETURN_DELAY_MS || 5000));
  if (!delay) return;
  App.battleReturnTimer = setTimeout(() => {
    if (App.currentBattle && App.currentBattle.finished) returnToExploreFromBattle();
  }, delay);
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
    $("btn-flee").disabled = true;
    hide("btn-use-item");
    hide("btn-flee");
    hideBattleItemList();
    $("battle-result").textContent = b.result === "win" ? "勝利!" : (b.result === "flee" ? "にげだした" : "敗北...");
    $("battle-result").className = "battle-result " + (b.result === "win" ? "win" : (b.result === "flee" ? "flee" : "lose"));
    show("battle-result");
    show("btn-battle-back");
    if (!App.battleReturnTimer) scheduleBattleAutoReturn();
  } else {
    clearBattleReturnTimer();
    $("btn-attack").disabled = b.busy;
    $("btn-use-item").disabled = b.busy;
    $("btn-flee").disabled = b.busy;
    show("btn-use-item");
    show("btn-flee");
    hide("battle-result");
    hide("btn-battle-back");
  }
}

function handleWin(win) {
  const spot = resolveSpot(App.currentSpot);
  const titlesBeforeWin = App.player && Array.isArray(App.player.titles) ? App.player.titles.slice() : null;
  const serverNewTitles = getServerNewTitles(win);
  if (win && win.victoryUntil && spot) saveVictoryCooldown(spot.spot_id, win.victoryUntil);
  recordExploreWin(spot);
  notifyNewTitles(serverNewTitles);
  if (App.player && win) {
    App.player.hp = win.hp; App.player.maxHp = win.maxHp;
    App.player.gold = win.gold; App.player.level = win.level;
    App.player.attack = win.attack; App.player.defense = win.defense;
  }
  const parts = ["勝利! EXP+" + (win ? win.expGain : 0) + " / " + (win ? win.goldGain : 0) + "G"];
  if (win && win.leveledUp) parts.push("レベルアップ! Lv" + win.level + "(HP全回復)");
  if (win && win.leveledUp) notifyLevelUp(win);
  if (win && win.rewards && win.rewards.length) parts.push("入手: " + win.rewards.map((r) => r.name).join("、"));
  if (win && win.repeat) parts.push("(撃破済み: 報酬減)");
  $("battle-reward").textContent = parts.join(" / ");
  show("battle-reward");
  renderItems();
  API.me().then((me) => {
    if (serverNewTitles.length === 0 && titlesBeforeWin) {
      notifyNewTitles(diffTitles(titlesBeforeWin, me && me.titles));
    }
    App.player = me;
    updateHpDisplay();
  }).catch(() => {});
  updateHpDisplay();
  refreshDefeatedSpots();
}

function resolveSpot(spot) {
  if (!spot) return null;
  if (spot.latitude != null && spot.longitude != null) return spot;
  if (!App.data || !App.data.spots) return spot;
  return App.data.spots.find((s) => s.spot_id === spot.spot_id) || spot;
}

function recordExploreWin(spot) {
  if (!spot || spot.latitude == null || spot.longitude == null) return;
  if (!App.exploreResult) App.exploreResult = { defeatedCount: 0, farthest: null };
  App.exploreResult.defeatedCount += 1;
  if (!App.exploreStartPosition && App.lastPosition) {
    App.exploreStartPosition = {
      latitude: App.lastPosition.latitude,
      longitude: App.lastPosition.longitude,
    };
  }
  if (!App.exploreStartPosition) return;
  const distance = calculateDistanceMeters(
    App.exploreStartPosition.latitude,
    App.exploreStartPosition.longitude,
    spot.latitude,
    spot.longitude
  );
  if (!App.exploreResult.farthest || distance > App.exploreResult.farthest.distance) {
    App.exploreResult.farthest = {
      spotId: spot.spot_id,
      spotName: spot.spot_name,
      distance,
    };
  }
}

function getServerNewTitles(win) {
  return win && Array.isArray(win.newTitles) ? win.newTitles : [];
}

function diffTitles(beforeTitles, afterTitles) {
  if (!Array.isArray(afterTitles) || afterTitles.length === 0) return [];
  const beforeSet = new Set(Array.isArray(beforeTitles) ? beforeTitles : []);
  return afterTitles.filter((title) => !beforeSet.has(title));
}

function notifyNewTitles(titles) {
  if (!titles || titles.length === 0) return;
  showToast("称号獲得: " + titles.join(" / "), { kind: "title", duration: 6500 });
}

// 撃破済みスポットをマップに反映
function notifyLevelUp(win) {
  if (!win || !win.leveledUp) return;
  showToast("LEVEL UP! Lv" + win.level + "  HP全回復!", { kind: "level event", duration: 6200 });
}

function notifyPoisonChange(before, after) {
  if (!before && after) {
    showToast("毒におかされた!", { kind: "poison event", duration: 5600 });
  } else if (before && !after) {
    showToast("毒が消えた!", { kind: "cure event", duration: 4800 });
  }
}

async function refreshDefeatedSpots() {
  if (!App.data) return;
  let ids = [];
  try { ids = await API.defeatedSpots(); } catch (e) { return; }
  App.defeatedSpotIds = new Set(ids || []);
  const set = {};
  (ids || []).forEach((id) => { set[id] = true; });
  const list = (App.data.spots || []).filter((sp) => set[sp.spot_id]);
  if (typeof setDefeatedSpots === "function") setDefeatedSpots(list);
}

function handleLose(r) {
  if (App.player && r.downedUntil) App.player.downedUntil = r.downedUntil;
  $("battle-reward").textContent = "敗北... 戦闘不能になった";
  show("battle-reward");
  updateDownedOverlay();
}

function handleFlee(r) {
  if (App.player && typeof r.playerHp !== "undefined") App.player.hp = r.playerHp;
  $("battle-reward").textContent = "戦闘からにげだした。報酬はありません。";
  show("battle-reward");
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
function showToast(msg, opts) {
  const el = $("toast");
  if (!el) return;
  const options = opts || {};
  el.textContent = msg;
  el.className = "toast";
  if (options.kind) String(options.kind).split(/\s+/).filter(Boolean).forEach((kind) => el.classList.add("toast-" + kind));
  el.classList.remove("hidden");
  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.add("hidden"), options.duration || 3500);
}

async function pollMarketListings() {
  let listings = [];
  try { listings = await API.market(); } catch (e) { return; }
  const openListings = (listings || []).filter((l) => !App.player || l.sellerId !== App.player.id);
  if (!App.marketSeenListings) {
    App.marketSeenListings = new Set(openListings.map((l) => l.id));
    return;
  }
  const fresh = openListings.filter((l) => !App.marketSeenListings.has(l.id));
  openListings.forEach((l) => App.marketSeenListings.add(l.id));
  if (!fresh.length || $("screen-explore").classList.contains("hidden")) return;
  const first = fresh[0];
  const more = fresh.length > 1 ? " ほか" + (fresh.length - 1) + "件" : "";
  showToast("まーけっと: " + first.itemName + " が出品されました" + more, { duration: 4500 });
}

function startMarketPolling() {
  if (App.marketPollTimer) clearInterval(App.marketPollTimer);
  pollMarketListings();
  const interval = Math.max(10000, Number(CONFIG.MARKET_POLL_INTERVAL_MS || 30000));
  App.marketPollTimer = setInterval(pollMarketListings, interval);
}

function onPickup(pickup) {
  showToast("✨ " + pickup.name + " を拾った!");
  renderItems();
}

// ---- POIアイコンのタップ操作(宿屋/道具屋) ----
// マップのポップアップ内ボタンから呼ばれる(グローバル)。範囲内のみ利用可。
// POIの範囲判定(共通)
function _poiInRange(kind, id) {
  const arr = kind === "inn" ? (App.data && App.data.inns || []) : (App.data && App.data.shops || []);
  const key = kind === "inn" ? "inn_id" : "shop_id";
  const o = arr.find((x) => x[key] === id);
  if (!o) return { ok: false, dist: Infinity, obj: null };
  const pos = App.lastPosition;
  const d = pos ? calculateDistanceMeters(pos.latitude, pos.longitude, o.latitude, o.longitude) : Infinity;
  return { ok: d <= (CONFIG.CHECKIN_DISTANCE_METERS || 10), dist: d, obj: o };
}

// ポップアップ表示時にボタンの活性/非活性とヒントを更新
function onPoiPopupOpen(kind, id, popupEl) {
  const root = popupEl || document.querySelector(".leaflet-popup");
  if (!root) return;
  const r = _poiInRange(kind, id);
  const btn = root.querySelector(".poi-btn");
  const hint = root.querySelector(".poi-hint");
  const wallet = root.querySelector(".poi-wallet");
  const cost = kind === "inn" ? innCost() : 0;
  const insufficient = kind === "inn" && playerGold() < cost;
  if (wallet) {
    wallet.textContent = kind === "inn"
      ? ("所持金 " + playerGold() + "G / 宿代 " + cost + "G")
      : ("所持金 " + playerGold() + "G");
  }
  if (btn) btn.classList.toggle("poi-btn-disabled", !r.ok || insufficient);
  if (hint) {
    hint.textContent = !r.ok
      ? ("範囲外(あと約" + (isFinite(r.dist) ? Math.round(r.dist) : "?") + "m)")
      : (insufficient ? ("所持金不足(" + playerGold() + "G/" + cost + "G)") : "");
  }
}

// ポップアップ内ヒントを目立たせて表示(非活性ボタンのタップ時など)
function showPoiHint(msg) {
  const hint = document.querySelector(".leaflet-popup-content .poi-hint");
  if (!hint) { showToast(msg); return; }
  hint.textContent = msg;
  hint.classList.remove("flash"); void hint.offsetWidth; hint.classList.add("flash");
}

function playerGold() {
  return Number(App.player && App.player.gold || 0);
}

function innCost() {
  const perLevel = Number(App.player && App.player.innCostPerLevel || 5);
  const level = Number(App.player && App.player.level || 1);
  return level * perLevel;
}

function updateShopWallet() {
  const el = $("shop-wallet");
  if (el) el.textContent = "所持金 " + playerGold() + "G";
}

function onInnEnter(innId) {
  const r = _poiInRange("inn", innId);
  if (!r.obj) return;
  if (!r.ok) { showPoiHint("範囲外(あと約" + (isFinite(r.dist) ? Math.round(r.dist) : "?") + "m)"); return; }
  if (playerGold() < innCost()) { showPoiHint("所持金不足(" + playerGold() + "G/" + innCost() + "G)"); return; }
  const inn = r.obj;
  const wasPoisoned = !!(App.player && App.player.poisoned);
  API.innRest(inn.inn_id).then((r) => {
    if (App.player) { App.player.hp = r.hp; App.player.gold = r.gold; App.player.poisoned = false; App.player.downedUntil = null; }
    updateHpDisplay();
    updateDownedOverlay();
    showToast(inn.inn_name + "で休んだ。HP全回復! (-" + (r.cost || 0) + "G)");
    notifyPoisonChange(wasPoisoned, false);
    closePoiPopups();
  }).catch((e) => showToast(e.message));
}

function onShopEnter(shopId) {
  const r = _poiInRange("shop", shopId);
  if (!r.obj) return;
  if (!r.ok) { showPoiHint("範囲外(あと約" + (isFinite(r.dist) ? Math.round(r.dist) : "?") + "m)"); return; }
  const shop = r.obj;
  App.currentShop = shop;
  closePoiPopups();
  $("shop-area-name").textContent = shop.shop_name;
  $("shop-msg").textContent = "";
  updateShopWallet();
  show("shop-modal");
  buildShopLists();
}

function closeShopModal() { hide("shop-confirm"); App._pendingShop = null; hide("shop-modal"); App.currentShop = null; }

async function buildShopLists() {
  updateShopWallet();
  let buy = [];
  try { buy = await API.shopItems(); } catch (e) { buy = []; }
  $("shop-buy-list").innerHTML = (buy && buy.length)
    ? buy.map((it) => {
      const disabled = playerGold() < Number(it.price || 0);
      return "<li><span>" + _esc(it.name) + " <span class=\"muted\">" + it.price + "G</span></span><button class=\"shop-buy-btn\" data-item=\"" + it.itemId + "\" data-name=\"" + _esc(it.name) + "\" data-price=\"" + it.price + "\"" + (disabled ? " disabled" : "") + ">" + (disabled ? "不足" : "買う") + "</button></li>";
    }).join("")
    : "<li class=\"muted\">商品なし</li>";
  let inv = [];
  try { inv = await API.inventory(); } catch (e) { inv = []; }
  const sellable = (inv || []).filter((i) => i.sellable && i.qty > 0);
  $("shop-sell-list").innerHTML = sellable.length
    ? sellable.map((i) => "<li><span>" + _esc(i.name) + " <span class=\"muted\">x" + i.qty + "</span></span><button class=\"shop-sell-btn\" data-item=\"" + i.itemId + "\" data-name=\"" + _esc(i.name) + "\" data-price=\"" + i.sellPrice + "\">売(" + i.sellPrice + ")</button></li>").join("")
    : "<li class=\"muted\">売れる物なし</li>";
}

function onShopBuyClick(e) {
  const btn = e.target.closest(".shop-buy-btn");
  if (!btn || btn.disabled || !App.currentShop) return;
  askShopConfirm("buy", btn.dataset.item, btn.dataset.name, Number(btn.dataset.price));
}

function onShopSellClick(e) {
  const btn = e.target.closest(".shop-sell-btn");
  if (!btn) return;
  askShopConfirm("sell", btn.dataset.item, btn.dataset.name, Number(btn.dataset.price));
}

// 確認ダイアログ
function askShopConfirm(kind, itemId, name, price) {
  App._pendingShop = { kind: kind, itemId: itemId };
  const verb = kind === "buy" ? "買い" : "売り";
  $("shop-confirm-msg").textContent = "「" + name + "」を " + price + "G で" + verb + "ますか？";
  show("shop-confirm");
}

function hideShopConfirm() { hide("shop-confirm"); App._pendingShop = null; }

async function onShopConfirmYes() {
  const pend = App._pendingShop;
  if (!pend || !App.currentShop) { hideShopConfirm(); return; }
  hide("shop-confirm");
  try {
    if (pend.kind === "buy") {
      const r = await API.buyItem(App.currentShop.shop_id, pend.itemId, 1);
      if (App.player) App.player.gold = r.gold;
      updateShopWallet();
      $("shop-msg").textContent = r.itemName + " を買った(残り " + r.gold + "G)";
    } else {
      const r = await API.sellItem(pend.itemId, 1);
      if (App.player) App.player.gold = r.gold;
      updateShopWallet();
      $("shop-msg").textContent = r.itemName + " を売った(+" + r.gain + "G / 残り " + r.gold + "G)";
    }
    updateHpDisplay();
  } catch (err) { $("shop-msg").textContent = err.message; }
  App._pendingShop = null;
  buildShopLists();
  renderItems();
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

function playerAvatarSrc(value) {
  const src = String(value || "assets/avatar_dog_bold_2.png").trim();
  if (/^(https?:)?\/\//.test(src) || src.startsWith("/") || src.startsWith("./")) return src;
  return "./" + src.replace(/^\/+/, "");
}

function updateHpDisplay() {
  const p = App.player;
  const hud = document.getElementById("status-hud");
  if (hud && p) {
    const pct = p.maxHp ? Math.max(0, Math.min(100, (p.hp / p.maxHp) * 100)) : 0;
    const color = pct > 50 ? "#22c55e" : pct > 25 ? "#eab308" : "#ef4444";
    hud.innerHTML =
      '<img class="hud-avatar" src="' + _esc(playerAvatarSrc(p.avatar)) + '" alt="プレイヤー">' +
      '<div class="hud-main">' +
        '<div class="hud-row hud-name">' + _esc(p.name) + ' <span class="hud-lv">Lv' + (p.level || 1) + '</span>' +
          (p.poisoned ? ' <span class="hud-poison">毒</span>' : '') + '</div>' +
        '<div class="hud-row"><span class="hud-label">HP</span><span class="hud-bar"><span class="hud-bar-fill" style="width:' + pct + '%;background:' + color + '"></span></span><span class="hud-val">' + p.hp + '/' + p.maxHp + '</span></div>' +
        '<div class="hud-row"><span class="hud-label">G</span><span class="hud-gold">' + p.gold + '</span></div>' +
      '</div>';
    hud.classList.remove("hidden");
  }
}

// ---- DQ風 コマンドメニュー(HUDタップ) ----
function openMenu() {
  if (!App.player) return;
  show("menu-overlay");
  $("menu-msg").textContent = "";
  renderMenuRoot();
}
function closeMenu() { hide("menu-overlay"); }

function renderMenuRoot() {
  $("menu-content").innerHTML =
    '<div class="dq-title">コマンド</div>' +
    '<ul class="dq-list">' +
      '<li data-cmd="item">どうぐ</li>' +
      '<li data-cmd="status">つよさ</li>' +
      '<li data-cmd="friends">なかま</li>' +
      '<li data-cmd="market">まーけっと</li>' +
      '<li data-cmd="close">とじる</li>' +
    '</ul>';
}

async function renderItemMenu() {
  let inv = [];
  try { inv = await API.inventory(); } catch (e) { inv = []; }
  let rows;
  if (!inv || !inv.length) {
    rows = '<li class="dq-empty">なにも もっていない</li>';
  } else {
    rows = inv.map(function (it) {
      const usable = it.healAmount > 0 || it.curePoison;
      const eff = it.healAmount > 0 ? ("HP+" + it.healAmount) : (it.curePoison ? "毒消し" : "");
      const attr = usable ? ' data-use="' + it.itemId + '"' : ' class="dq-dim"';
      return '<li' + attr + '>' + _esc(it.name) + ' <span class="dq-qty">x' + it.qty + '</span>' +
        (eff ? ' <span class="dq-eff">' + eff + '</span>' : '') + '</li>';
    }).join("");
  }
  $("menu-content").innerHTML =
    '<div class="dq-title">どうぐ</div><ul class="dq-list">' + rows + '</ul>' +
    '<ul class="dq-list"><li data-cmd="back">もどる</li></ul>';
}

function renderMarketRoot() {
  $("menu-content").innerHTML =
    '<div class="dq-title">まーけっと</div>' +
    '<ul class="dq-list">' +
      '<li data-cmd="marketBuy">かう</li>' +
      '<li data-cmd="marketSell">うる</li>' +
      '<li data-cmd="marketCancel">とりけし</li>' +
      '<li data-cmd="back">もどる</li>' +
    '</ul>';
}

function clientMarketFee(price) {
  return Math.max(0, Number(CONFIG.MARKET_FEE_FIXED || 0)) + Math.ceil(Math.max(0, Number(price) || 0) * Math.max(0, Number(CONFIG.MARKET_FEE_RATE || 0)));
}

function clientMarketCancelFee(price) {
  return Math.max(0, Number(CONFIG.MARKET_CANCEL_FEE_FIXED || 0)) + Math.ceil(Math.max(0, Number(price) || 0) * Math.max(0, Number(CONFIG.MARKET_CANCEL_FEE_RATE || 0)));
}

function clientMarketSettlement(price, payerSide) {
  const p = Math.max(0, Number(price) || 0);
  const fee = clientMarketFee(p);
  if (payerSide === "buyer") return { fee, buyerPays: p + fee, sellerReceives: p };
  return { fee, buyerPays: p, sellerReceives: Math.max(0, p - fee) };
}

async function renderMarketSell() {
  let inv = [];
  try { inv = await API.inventory(); } catch (e) { inv = []; }
  const rows = (inv || []).filter((it) => it.qty > 0).map((it) =>
    '<li data-market-sell="' + _esc(it.itemId) + '">' + _esc(it.name) +
    ' <span class="dq-qty">x' + it.qty + '</span> <span class="dq-eff">どうぐや ' + (it.sellPrice || 0) + 'G</span></li>'
  ).join("");
  $("menu-content").innerHTML =
    '<div class="dq-title">うるもの</div><div class="dq-wallet">所持金 ' + playerGold() + 'G</div><ul class="dq-list">' + (rows || '<li class="dq-empty">うれるものがない</li>') + '</ul>' +
    '<ul class="dq-list"><li data-cmd="market">もどる</li></ul>';
}

async function renderMarketSellForm(itemId) {
  let inv = [];
  try { inv = await API.inventory(); } catch (e) { inv = []; }
  const item = (inv || []).find((it) => it.itemId === itemId);
  if (!item) { $("menu-msg").textContent = "そのどうぐはありません"; return renderMarketSell(); }
  const price = Math.max(1, Number(item.sellPrice || 1));
  const s = clientMarketSettlement(price, "seller");
  App._pendingMarket = { kind: "sell", itemId: item.itemId, itemName: item.name, qty: 1, shopSellPrice: item.sellPrice || 0 };
  $("menu-content").innerHTML =
    '<div class="dq-title">いくらで だしますか？</div>' +
    '<div class="dq-stats">' +
      '<div>所持金 ' + playerGold() + 'G</div>' +
      '<div>' + _esc(item.name) + ' x1</div>' +
      '<div>どうぐやなら ' + (item.sellPrice || 0) + 'G でうれる</div>' +
      '<label>価格 <input id="market-price" type="number" min="1" value="' + price + '"> G</label>' +
      '<div class="market-fee-row"><span>てすうりょう</span><label><input type="radio" name="market-fee-side" value="seller" checked>じぶん</label><label><input type="radio" name="market-fee-side" value="buyer">かいぬし</label></div>' +
      '<div id="market-fee-preview">手数料 ' + s.fee + 'G / 買い手 ' + s.buyerPays + 'G / 受取 ' + s.sellerReceives + 'G</div>' +
    '</div>' +
    '<ul class="dq-list"><li data-market-action="listConfirm">だす</li><li data-cmd="marketSell">もどる</li></ul>';
  const priceEl = $("market-price");
  const update = () => {
    const side = document.querySelector("input[name='market-fee-side']:checked").value;
    const st = clientMarketSettlement(Number(priceEl.value || 0), side);
    $("market-fee-preview").textContent = "手数料 " + st.fee + "G / 買い手 " + st.buyerPays + "G / 受取 " + st.sellerReceives + "G";
  };
  priceEl.addEventListener("input", update);
  Array.from(document.querySelectorAll("input[name='market-fee-side']")).forEach((el) => el.addEventListener("change", update));
}

function renderMarketListConfirm() {
  const p = App._pendingMarket;
  if (!p) return renderMarketRoot();
  const price = Number($("market-price").value || 0);
  const side = document.querySelector("input[name='market-fee-side']:checked").value;
  const st = clientMarketSettlement(price, side);
  App._pendingMarket = { ...p, price, feePayerSide: side };
  $("menu-content").innerHTML =
    '<div class="dq-title">ほんとうに だしますか？</div>' +
    '<div class="dq-stats">' +
      '<div>所持金 ' + playerGold() + 'G</div>' +
      '<div>' + _esc(p.itemName) + ' x1</div>' +
      '<div>買い手支払い: ' + st.buyerPays + 'G</div>' +
      '<div>手数料: ' + st.fee + 'G</div>' +
      '<div>受取: ' + st.sellerReceives + 'G</div>' +
    '</div>' +
    '<ul class="dq-list"><li data-market-action="listDo">はい</li><li data-cmd="marketSell">いいえ</li></ul>';
}

async function doMarketList() {
  const p = App._pendingMarket;
  if (!p) return renderMarketRoot();
  try {
    const r = await API.marketList(p.itemId, 1, p.price, p.feePayerSide);
    $("menu-msg").textContent = "出品しました。買い手 " + r.buyerPays + "G";
    showToast("まーけっとに出品しました", { duration: 3500 });
    App._pendingMarket = null;
    renderMarketRoot();
    renderItems();
  } catch (e) { $("menu-msg").textContent = e.message; }
}

async function renderMarketBuy() {
  let listings = [];
  try { listings = await API.market(); } catch (e) { listings = []; }
  listings = (listings || []).filter((l) => !App.player || l.sellerId !== App.player.id);
  const rows = listings.map((l) => {
    const disabled = playerGold() < Number(l.buyerPays || 0);
    return '<li' + (disabled ? ' class="dq-dim"' : ' data-market-buy="' + _esc(l.id) + '"') + '>' + _esc(l.itemName) + ' <span class="dq-qty">x' + l.qty + '</span> <span class="dq-eff">' + l.buyerPays + 'G</span>' + (disabled ? ' <span class="dq-qty">G不足</span>' : '') + '<br><span class="muted">売り手 ' + _esc(l.seller) + '</span></li>';
  }).join("");
  App._marketListings = listings;
  $("menu-content").innerHTML =
    '<div class="dq-title">かう</div><div class="dq-wallet">所持金 ' + playerGold() + 'G</div><ul class="dq-list">' + (rows || '<li class="dq-empty">でていない</li>') + '</ul>' +
    '<ul class="dq-list"><li data-cmd="market">もどる</li></ul>';
}

function renderMarketBuyConfirm(listingId) {
  const l = (App._marketListings || []).find((x) => x.id === listingId);
  if (!l) return renderMarketBuy();
  if (playerGold() < Number(l.buyerPays || 0)) { $("menu-msg").textContent = "所持金が足りません"; return renderMarketBuy(); }
  App._pendingMarket = { kind: "buy", listingId: l.id };
  $("menu-content").innerHTML =
    '<div class="dq-title">ほんとうに かいますか？</div>' +
    '<div class="dq-stats">' +
      '<div>所持金 ' + playerGold() + 'G</div>' +
      '<div>' + _esc(l.itemName) + ' x' + l.qty + '</div>' +
      '<div>支払い: ' + l.buyerPays + 'G</div>' +
      '<div>手数料: ' + l.feeAmount + 'G</div>' +
      '<div>売り手: ' + _esc(l.seller) + '</div>' +
    '</div>' +
    '<ul class="dq-list"><li data-market-action="buyDo">はい</li><li data-cmd="marketBuy">いいえ</li></ul>';
}

async function doMarketBuy() {
  const p = App._pendingMarket;
  if (!p) return renderMarketBuy();
  try {
    const r = await API.marketBuy(p.listingId);
    App.player = await API.me();
    updateHpDisplay();
    $("menu-msg").textContent = "買いました。支払い " + r.buyerPays + "G";
    App._pendingMarket = null;
    renderMarketRoot();
    renderItems();
  } catch (e) { $("menu-msg").textContent = e.message; }
}

async function renderMarketCancel() {
  let listings = [];
  try { listings = await API.marketMine(); } catch (e) { listings = []; }
  App._marketListings = listings || [];
  const rows = App._marketListings.map((l) =>
    '<li data-market-cancel="' + _esc(l.id) + '">' + _esc(l.itemName) + ' <span class="dq-qty">x' + l.qty + '</span> <span class="dq-eff">' + l.buyerPays + 'G</span></li>'
  ).join("");
  $("menu-content").innerHTML =
    '<div class="dq-title">とりけし</div><ul class="dq-list">' + (rows || '<li class="dq-empty">出品していない</li>') + '</ul>' +
    '<ul class="dq-list"><li data-cmd="market">もどる</li></ul>';
}

function renderMarketCancelConfirm(listingId) {
  const l = (App._marketListings || []).find((x) => x.id === listingId);
  if (!l) return renderMarketCancel();
  const fee = clientMarketCancelFee(l.price);
  App._pendingMarket = { kind: "cancel", listingId: l.id };
  $("menu-content").innerHTML =
    '<div class="dq-title">とりけしますか？</div>' +
    '<div class="dq-stats">' +
      '<div>' + _esc(l.itemName) + ' x' + l.qty + '</div>' +
      '<div>取消手数料: ' + fee + 'G</div>' +
    '</div>' +
    '<ul class="dq-list"><li data-market-action="cancelDo">はい</li><li data-cmd="marketCancel">いいえ</li></ul>';
}

async function doMarketCancel() {
  const p = App._pendingMarket;
  if (!p) return renderMarketCancel();
  try {
    const r = await API.marketCancel(p.listingId);
    if (App.player && typeof r.gold !== "undefined") App.player.gold = r.gold;
    updateHpDisplay();
    $("menu-msg").textContent = "取り消しました。手数料 " + r.fee + "G";
    App._pendingMarket = null;
    renderMarketRoot();
    renderItems();
  } catch (e) { $("menu-msg").textContent = e.message; }
}

function renderStatus() {
  const p = App.player || {};
  const titleRows = p.titles && p.titles.length
    ? p.titles.map((t) => '<div>・' + _esc(t) + '</div>').join("")
    : '<div>なし</div>';
  $("menu-content").innerHTML =
    '<div class="dq-title">つよさ</div>' +
    '<div class="dq-stats">' +
      '<div>なまえ: ' + _esc(p.name || "") + '</div>' +
      '<div>レベル: ' + (p.level || 1) + '</div>' +
      '<div>HP: ' + p.hp + " / " + p.maxHp + '</div>' +
      '<div>こうげき: ' + p.attack + '</div>' +
      '<div>しゅび: ' + p.defense + '</div>' +
      '<div>けいけん: ' + p.exp + (p.nextExp ? " / " + p.nextExp : "") + '</div>' +
      '<div>ゴールド: ' + p.gold + '</div>' +
      '<div>じょうたい: ' + (p.poisoned ? "どく" : "なし") + '</div>' +
      '<div>しょうごう:</div>' +
      '<div class="dq-titles">' + titleRows + '</div>' +
    '</div>' +
    '<ul class="dq-list"><li data-cmd="back">もどる</li></ul>';
}

async function renderFriends() {
  let list = [];
  try { list = await API.playersNearby(); } catch (e) { list = []; }
  const pos = App.lastPosition;
  let rows;
  if (!list || !list.length) {
    rows = '<li class="dq-empty">だれもいない</li>';
  } else {
    list.forEach((f) => { f._d = pos ? calculateDistanceMeters(pos.latitude, pos.longitude, f.lat, f.lng) : null; });
    if (pos) list.sort((a, b) => a._d - b._d);
    rows = list.map((f) => {
      const dist = f._d == null ? "?" : (f._d >= 1000 ? (f._d / 1000).toFixed(1) + "km" : Math.round(f._d) + "m");
      return '<li class="dq-flat">' + _esc(f.name) + ' <span class="dq-qty">Lv' + (f.level || 1) + '</span> <span class="dq-eff">' + dist + '</span></li>';
    }).join("");
  }
  $("menu-content").innerHTML =
    '<div class="dq-title">なかま</div><ul class="dq-list">' + rows + '</ul>' +
    '<ul class="dq-list"><li data-cmd="back">もどる</li></ul>';
}

async function onMenuClick(e) {
  const li = e.target.closest("li");
  if (!li) return;
  const cmd = li.dataset.cmd;
  if (cmd === "close") { closeMenu(); return; }
  if (cmd === "back") { $("menu-msg").textContent = ""; renderMenuRoot(); return; }
  if (cmd === "item") { renderItemMenu(); return; }
  if (cmd === "status") { renderStatus(); return; }
  if (cmd === "friends") { renderFriends(); return; }
  if (cmd === "market") { renderMarketRoot(); return; }
  if (cmd === "marketBuy") { await renderMarketBuy(); return; }
  if (cmd === "marketSell") { await renderMarketSell(); return; }
  if (cmd === "marketCancel") { await renderMarketCancel(); return; }
  if (li.dataset.marketSell) { await renderMarketSellForm(li.dataset.marketSell); return; }
  if (li.dataset.marketBuy) { renderMarketBuyConfirm(li.dataset.marketBuy); return; }
  if (li.dataset.marketCancel) { renderMarketCancelConfirm(li.dataset.marketCancel); return; }
  if (li.dataset.marketAction === "listConfirm") { renderMarketListConfirm(); return; }
  if (li.dataset.marketAction === "listDo") { await doMarketList(); return; }
  if (li.dataset.marketAction === "buyDo") { await doMarketBuy(); return; }
  if (li.dataset.marketAction === "cancelDo") { await doMarketCancel(); return; }
  if (li.dataset.use) {
    try {
      const wasPoisoned = !!(App.player && App.player.poisoned);
      const r = await API.useItem(li.dataset.use);
      if (App.player) { App.player.hp = r.hp; if (typeof r.poisoned !== "undefined") App.player.poisoned = r.poisoned; }
      if (typeof r.poisoned !== "undefined") notifyPoisonChange(wasPoisoned, r.poisoned);
      updateHpDisplay();
      $("menu-msg").textContent = r.message || (r.itemName + "をつかった");
    } catch (err) { $("menu-msg").textContent = err.message; }
    renderItemMenu();
    renderItems();
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
    const wasPoisoned = !!(App.player && App.player.poisoned);
    const r = await API.useItem(btn.dataset.item);
    if (App.player) { App.player.hp = r.hp; if (typeof r.poisoned !== "undefined") App.player.poisoned = r.poisoned; }
    if (typeof r.poisoned !== "undefined") notifyPoisonChange(wasPoisoned, r.poisoned);
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
