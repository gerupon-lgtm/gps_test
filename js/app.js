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

  // --- デバッグ機能 ---
  $("btn-apply-mock").addEventListener("click", applyMockFromInputs);
  $("btn-clear-mock").addEventListener("click", () => {
    clearMockPosition();
    $("debug-status").textContent = "モック解除。実GPSを使用します(再取得は開始ボタン)";
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
    $("nearest-name").textContent = "-";
    $("nearest-dist").textContent = "-";
    setJudge("", "");
    hideEnemyArea();
    return;
  }

  const accOk =
    pos.accuracy == null || pos.accuracy <= CONFIG.GPS_ACCURACY_LIMIT_METERS;

  // 最寄りスポット(最上部・2行表示。距離の後ろに状態を付ける)
  const nearest = findNearestSpot(pos, App.data.spots);
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
    $("nearest-name").textContent = nearest.spot.spot_name;
    $("nearest-dist").textContent = d + " m(" + status + ")";
  } else {
    $("nearest-name").textContent = "-";
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
function onStartBattle() {
  const spot = App.currentSpot;
  const enemy = App._pendingEnemy;
  if (!spot || !enemy) return;
  // 念のため: クールダウン/ペナルティ中は戦闘開始しない
  if (isPenaltyActive(spot.spot_id) || isVictoryCooldownActive(spot.spot_id)) {
    updateExplore(App.lastPosition);
    return;
  }
  App.currentBattle = createBattleState(enemy);
  renderBattle();
  showScreen("battle");
}

function onAttack() {
  if (!App.currentBattle || App.currentBattle.finished) return;
  processTurn(App.currentBattle);
  renderBattle();

  if (App.currentBattle.finished) {
    if (App.currentBattle.result === "win") {
      handleWin();
    } else {
      handleLose();
    }
  }
}

function renderBattle() {
  const b = App.currentBattle;
  $("battle-enemy-name").textContent = b.enemy.enemy_name;
  $("battle-enemy-hp").textContent = b.enemyHp;
  $("battle-enemy-hp-max").textContent = b.enemy.hp;
  $("battle-player-hp").textContent = b.playerHp;
  $("battle-player-hp-max").textContent = b.playerMaxHp;

  $("enemy-hp-bar").style.width = (b.enemyHp / b.enemy.hp) * 100 + "%";
  $("player-hp-bar").style.width = (b.playerHp / b.playerMaxHp) * 100 + "%";

  const img = $("battle-enemy-img");
  if (b.enemy.image) {
    img.src = b.enemy.image;
    img.alt = b.enemy.enemy_name;
    img.onerror = () => {
      img.style.display = "none";
    };
    img.style.display = "block";
  } else {
    img.style.display = "none";
  }

  const logEl = $("battle-log");
  logEl.innerHTML = b.log.map((l) => "<div>" + l + "</div>").join("");
  logEl.scrollTop = logEl.scrollHeight;

  if (b.finished) {
    $("btn-attack").disabled = true;
    $("battle-result").textContent = b.result === "win" ? "勝利!" : "敗北...";
    $("battle-result").className =
      "battle-result " + (b.result === "win" ? "win" : "lose");
    show("battle-result");
    show("btn-battle-back");
  } else {
    $("btn-attack").disabled = false;
    hide("battle-result");
    hide("btn-battle-back");
  }
}

function handleWin() {
  const spot = App.currentSpot;

  // 勝利クールダウンを保存(同じ敵が一定時間再出現しない)
  const cdMin = CONFIG.VICTORY_COOLDOWN_MINUTES || 0;
  const availableAt = new Date(Date.now() + cdMin * 60 * 1000).toISOString();
  saveVictoryCooldown(spot.spot_id, availableAt);

  const item = App.data.itemMap[spot.reward_item_id];
  if (!item) {
    $("battle-reward").textContent =
      "アイテムデータが見つかりません (item_id: " + spot.reward_item_id + ")";
    show("battle-reward");
    return;
  }
  const record = {
    itemId: item.item_id,
    spotId: spot.spot_id,
    acquiredAt: new Date().toISOString(),
  };
  saveItem(record);
  $("battle-reward").textContent =
    "「" + item.item_name + "」を手に入れた!(このスポットの敵は約" + cdMin + "分後に再出現)";
  show("battle-reward");
  renderItems();
}

function handleLose() {
  const spot = App.currentSpot;
  const minutes = spot.penalty_minutes || 0;
  const retryAt = new Date(Date.now() + minutes * 60 * 1000).toISOString();
  savePenalty(spot.spot_id, retryAt);
  $("battle-reward").textContent = minutes + "分間、このスポットでは再戦できません";
  show("battle-reward");
}

// =====================================================
// 所持アイテム表示
// =====================================================
function renderItems() {
  const items = getItems();
  const el = $("items-list");
  if (items.length === 0) {
    el.innerHTML = "<li class='muted'>まだアイテムを持っていません</li>";
    $("items-count").textContent = "0";
    return;
  }
  $("items-count").textContent = String(items.length);
  el.innerHTML = items
    .slice()
    .reverse()
    .map((rec) => {
      const item = App.data ? App.data.itemMap[rec.itemId] : null;
      const name = item ? item.item_name : rec.itemId;
      const rarity = item && item.rarity ? " [" + item.rarity + "]" : "";
      const t = new Date(rec.acquiredAt).toLocaleString("ja-JP");
      return "<li>" + name + rarity + " <span class=\"muted\">(" + rec.spotId + " / " + t + ")</span></li>";
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
