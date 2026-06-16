let selectedPlayerId = null;
let selectedPlayer = null;
let spots = [];

const $ = (id) => document.getElementById(id);

async function api(path, method = "GET", body) {
  const opt = { method, credentials: "include", headers: {} };
  if (body !== undefined) {
    opt.headers["Content-Type"] = "application/json";
    opt.body = JSON.stringify(body);
  }
  const res = await fetch(path, opt);
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.error) || ("HTTP " + res.status));
  return data;
}

function showAdmin(show) {
  $("login-panel").classList.toggle("hidden", show);
  $("admin-panel").classList.toggle("hidden", !show);
  $("btn-logout").classList.toggle("hidden", !show);
}

async function checkLogin() {
  try {
    await api("/api/admin/me");
    showAdmin(true);
    await loadPlayers();
    await loadSpots();
  } catch (e) {
    showAdmin(false);
  }
}

async function login() {
  $("login-msg").textContent = "";
  try {
    await api("/api/admin/login", "POST", { loginId: $("login-id").value, password: $("login-password").value });
    showAdmin(true);
    await loadPlayers();
    await loadSpots();
  } catch (e) {
    $("login-msg").textContent = e.message;
  }
}

async function logout() {
  await api("/api/admin/logout", "POST").catch(() => {});
  showAdmin(false);
}

async function loadPlayers() {
  const players = await api("/api/admin/players");
  $("player-list").innerHTML = players.map((p) =>
    `<li data-player="${p.id}"><div class="player-row"><span>${esc(p.name)} <span class="muted">(${esc(p.loginId)})</span></span><span class="badge ${p.disabled ? "disabled" : "enabled"}">${p.disabled ? "停止" : "有効"}</span></div><div class="muted">Lv${p.level} HP ${p.hp}/${p.maxHp} ${p.gold}G</div></li>`
  ).join("");
}

async function loadSpots() {
  spots = await api("/api/admin/spots");
}

async function loadPlayerDetail(playerId) {
  selectedPlayerId = playerId;
  selectedPlayer = await api("/api/admin/players/" + encodeURIComponent(playerId));
  renderPlayerDetail(selectedPlayer);
}

function renderPlayerDetail(p) {
  const tpl = $("player-detail-template").content.cloneNode(true);
  $("player-detail").innerHTML = "";
  $("player-detail").appendChild(tpl);
  setText("[data-field='name']", p.name);
  setText("[data-field='login']", p.loginId + " / " + p.id);
  const badge = document.querySelector("[data-field='disabled-badge']");
  badge.textContent = p.disabled ? "ログイン停止中" : "有効";
  badge.classList.add(p.disabled ? "disabled" : "enabled");
  setText("[data-field='level']", p.level);
  setText("[data-field='hp']", `${p.hp}/${p.maxHp}`);
  setText("[data-field='gold']", `${p.gold}G`);
  setText("[data-field='poisoned']", p.poisoned ? "毒" : "なし");
  setText("[data-field='downed']", p.downedUntil || "なし");

  $("spot-select").innerHTML = spots.map((s) => `<option value="${escAttr(s.spotId)}">${esc(s.name)} (${esc(s.spotId)})</option>`).join("");
  $("spot-select").addEventListener("change", syncSpotForm);
  $("btn-disable").addEventListener("click", () => setDisabled(true));
  $("btn-enable").addEventListener("click", () => setDisabled(false));
  $("btn-clear-sessions").addEventListener("click", clearSessions);
  $("btn-save-spot").addEventListener("click", saveSpotState);
  renderSpotStateList(p);
  renderItems(p);
  syncSpotForm();
}

function renderSpotStateList(p) {
  const defeated = new Set(p.defeatedSpots || []);
  $("spot-state-list").innerHTML = p.spotStates.length
    ? p.spotStates.map((s) => `<li>${esc(s.spotName)} (${esc(s.spotId)}) / ${defeated.has(s.spotId) ? "撃破済み" : "未撃破"} / victory: ${esc(s.victoryUntil || "-")} / penalty: ${esc(s.penaltyUntil || "-")}</li>`).join("")
    : "<li>状態レコードなし</li>";
}

function renderItems(p) {
  $("item-list").innerHTML = p.items.length
    ? p.items.map((i) => `<li>${esc(i.name)} (${esc(i.itemId)}) x${i.qty} [${esc(i.rarity || "")}]</li>`).join("")
    : "<li>所持アイテムなし</li>";
}

function syncSpotForm() {
  if (!selectedPlayer) return;
  const spotId = $("spot-select").value;
  const defeated = new Set(selectedPlayer.defeatedSpots || []);
  const state = selectedPlayer.spotStates.find((s) => s.spotId === spotId);
  $("spot-defeated").checked = defeated.has(spotId);
  $("spot-victory-until").value = state && state.victoryUntil ? toLocalInputValue(state.victoryUntil) : "";
  $("spot-clear-penalty").checked = false;
}

async function setDisabled(disabled) {
  if (!selectedPlayer) return;
  const reason = $("disable-reason").value;
  await api("/api/admin/users/" + encodeURIComponent(selectedPlayer.userId) + "/disabled", "POST", { disabled, reason });
  $("detail-msg").textContent = disabled ? "ログイン停止しました" : "停止解除しました";
  await loadPlayers();
  await loadPlayerDetail(selectedPlayerId);
}

async function clearSessions() {
  if (!selectedPlayer) return;
  const r = await api("/api/admin/users/" + encodeURIComponent(selectedPlayer.userId) + "/sessions/clear", "POST");
  $("detail-msg").textContent = "セッションを削除しました: " + r.deleted + "件";
}

async function saveSpotState() {
  if (!selectedPlayer) return;
  const body = {
    spotId: $("spot-select").value,
    defeated: $("spot-defeated").checked,
    victoryUntil: fromLocalInputValue($("spot-victory-until").value),
    clearPenalty: $("spot-clear-penalty").checked,
  };
  await api("/api/admin/players/" + encodeURIComponent(selectedPlayer.id) + "/defeated-spots", "POST", body);
  $("detail-msg").textContent = "撃破済みスポットを更新しました";
  await loadPlayerDetail(selectedPlayer.id);
}

function setText(selector, value) {
  const el = document.querySelector(selector);
  if (el) el.textContent = value == null ? "" : String(value);
}

function toLocalInputValue(value) {
  const d = new Date(value);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInputValue(value) {
  return value ? new Date(value).toISOString() : null;
}

function esc(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function escAttr(value) {
  return esc(value).replace(/`/g, "&#96;");
}

$("btn-login").addEventListener("click", login);
$("btn-logout").addEventListener("click", logout);
$("btn-refresh").addEventListener("click", loadPlayers);
$("player-list").addEventListener("click", (e) => {
  const li = e.target.closest("[data-player]");
  if (li) loadPlayerDetail(li.dataset.player);
});

checkLogin();
