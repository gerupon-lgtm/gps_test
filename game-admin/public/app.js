let selectedPlayerId = null;
let selectedPlayer = null;
let spots = [];
let selectedMaster = null;
let masterMode = "edit";
let currentImportPreview = null;
const MASTER_PRIMARY_IDS = {
  spots: "spotId",
  enemies: "enemyId",
  items: "itemId",
  inns: "innId",
  shops: "shopId",
  postalAreas: "areaKey",
};
const MASTER_FIELDS = {
  spots: {
    spotId: "string",
    name: "string",
    lat: "number",
    lng: "number",
    radiusM: "int",
    postalCode: "nullableString",
    muniCd: "nullableString",
    areaName: "nullableString",
    areaKey: "nullableString",
    enemyId: "string",
    rewardItemId: "string",
    penaltyMin: "int",
    active: "boolean",
  },
  enemies: {
    enemyId: "string",
    name: "string",
    hp: "int",
    attack: "int",
    defense: "int",
    image: "string",
    expBase: "int",
    goldBase: "int",
    dropItemId: "nullableString",
    dropRate: "number",
    poisonChance: "number",
    active: "boolean",
  },
  items: {
    itemId: "string",
    name: "string",
    description: "string",
    rarity: "string",
    type: "string",
    basePrice: "int",
    healAmount: "int",
    category: "string",
    curePoison: "boolean",
    sellable: "boolean",
    active: "boolean",
  },
  inns: { innId: "string", name: "string", lat: "number", lng: "number", radiusM: "int", active: "boolean" },
  shops: { shopId: "string", name: "string", lat: "number", lng: "number", radiusM: "int", active: "boolean" },
  postalAreas: {
    areaKey: "string",
    postalCode: "nullableString",
    muniCd: "string",
    areaName: "string",
    regionName: "string",
    active: "boolean",
  },
};

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

function showTab(tab) {
  const players = tab === "players";
  $("players-panel").classList.toggle("hidden", !players);
  $("masters-panel").classList.toggle("hidden", players);
  $("tab-players").classList.toggle("active", players);
  $("tab-masters").classList.toggle("active", !players);
  if (!players) loadMasters();
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

async function loadMasters() {
  const type = $("master-type").value;
  currentImportPreview = null;
  $("import-preview").classList.add("hidden");
  const rows = await api("/api/admin/masters/" + encodeURIComponent(type));
  $("master-list").innerHTML = rows.map((r) =>
    `<li data-master="${escAttr(r.id)}"><div class="player-row"><span>${esc(r.label)} <span class="muted">(${esc(r.id)})</span></span><span class="badge ${r.active ? "enabled" : "disabled"}">${r.active ? "有効" : "非表示"}</span></div></li>`
  ).join("");
}

function exportMasterCsv() {
  const type = $("master-type").value;
  const encoding = $("csv-encoding").value;
  window.location.href = "/api/admin/masters/" + encodeURIComponent(type) + "/export.csv?encoding=" + encodeURIComponent(encoding);
}

async function previewMasterImport() {
  const file = $("master-import-file").files[0];
  if (!file) {
    $("master-detail").textContent = "CSVファイルを選択してください。";
    return;
  }
  const csvBase64 = await fileToBase64(file);
  const type = $("master-type").value;
  const proximityThresholdM = Number($("proximity-threshold").value || 10);
  const preview = await api("/api/admin/masters/" + encodeURIComponent(type) + "/import/preview", "POST", {
    csvBase64,
    encoding: $("csv-encoding").value,
    proximityThresholdM,
  });
  currentImportPreview = preview;
  renderImportPreview(preview);
}

async function checkExistingProximity() {
  const thresholdM = Number($("proximity-threshold").value || 10);
  const result = await api("/api/admin/facilities/proximity?thresholdM=" + encodeURIComponent(thresholdM));
  $("proximity-result").classList.remove("hidden");
  $("proximity-summary").textContent =
    `距離 ${result.thresholdM}m 以内: ${result.count}件` + (result.truncated ? "（500件まで表示）" : "");
  $("proximity-list").innerHTML = result.warnings.length
    ? result.warnings.map((w) => `<li class="warning">${esc(w.message)}</li>`).join("")
    : "<li>近接施設はありません</li>";
}

function renderImportPreview(preview) {
  $("import-preview").classList.remove("hidden");
  $("import-summary").textContent =
    `追加 ${preview.insertCount} / 更新 ${preview.updateCount} / 変更なし ${preview.noChangeCount} / CSV未掲載 ${preview.missingCount} / エラー ${preview.errors.length}`;
  $("import-errors").innerHTML = preview.errors.length
    ? preview.errors.map((e) => `<li class="danger">行${e.row || "-"} ${esc(e.id || "")}: ${esc(e.error)}</li>`).join("")
    : "<li>エラーなし</li>";
  $("import-warnings").innerHTML = preview.warnings && preview.warnings.length
    ? preview.warnings.map((w) => `<li class="warning">${esc(w.message)}</li>`).join("")
    : "<li>警告なし</li>";
  $("import-changes").innerHTML = preview.changes.length
    ? preview.changes.map((c) => `<li>${esc(c.type)}: ${esc(c.id)} / ${esc(c.changedFields.join(", ") || "変更なし")}</li>`).join("")
    : "<li>変更なし</li>";
  $("btn-master-apply").disabled = preview.errors.length > 0;
}

async function fileToBase64(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function applyMasterImport() {
  if (!currentImportPreview) return;
  const type = $("master-type").value;
  const r = await api("/api/admin/masters/" + encodeURIComponent(type) + "/import/apply", "POST", { previewId: currentImportPreview.previewId });
  $("import-summary").textContent = "反映しました: " + r.applied + "件";
  currentImportPreview = null;
  await loadMasters();
  $("master-detail").textContent = "CSVを反映しました: " + r.applied + "件";
}

async function loadMasterDetail(type, id) {
  masterMode = "edit";
  selectedMaster = { type, id };
  const detail = await api("/api/admin/masters/" + encodeURIComponent(type) + "/" + encodeURIComponent(id));
  renderMasterDetail(type, id, detail.fields, detail.data);
}

function showNewMasterForm() {
  const type = $("master-type").value;
  masterMode = "new";
  selectedMaster = { type, id: null };
  const fields = MASTER_FIELDS[type];
  const data = {};
  for (const [field, fieldType] of Object.entries(fields)) {
    data[field] = fieldType === "boolean" ? field === "active" : "";
  }
  renderMasterDetail(type, "", fields, data);
  $("master-title").textContent = "新規登録";
  $("master-id").textContent = type + " / ID空欄なら自動採番";
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

function renderMasterDetail(type, id, fields, data) {
  const tpl = $("master-detail-template").content.cloneNode(true);
  $("master-detail").innerHTML = "";
  $("master-detail").appendChild(tpl);
  $("master-title").textContent = data.name || data.regionName || id;
  $("master-id").textContent = type + " / " + id;
  const form = $("master-form");
  form.innerHTML = Object.entries(fields).map(([field, fieldType]) => renderMasterField(type, field, fieldType, data[field])).join("");
  $("btn-master-save").addEventListener("click", saveMaster);
}

function renderMasterField(masterType, field, fieldType, value) {
  const readonly = MASTER_PRIMARY_IDS[masterType] === field && masterMode !== "new";
  if (fieldType === "boolean") {
    return `<label class="check-row"><input name="${escAttr(field)}" type="checkbox" ${value ? "checked" : ""} ${readonly ? "disabled" : ""}> ${esc(field)}</label>`;
  }
  const inputType = fieldType === "int" || fieldType === "number" ? "number" : "text";
  const step = fieldType === "number" ? " step=\"any\"" : "";
  return `<label>${esc(field)}<input name="${escAttr(field)}" type="${inputType}"${step} value="${escAttr(value == null ? "" : value)}" ${readonly ? "readonly" : ""}></label>`;
}

async function saveMaster() {
  if (!selectedMaster) return;
  const form = $("master-form");
  const body = {};
  for (const el of Array.from(form.elements)) {
    if (!el.name || el.disabled || (el.readOnly && masterMode !== "new")) continue;
    body[el.name] = el.type === "checkbox" ? el.checked : el.value;
  }
  if (masterMode === "new") {
    body.proximityThresholdM = Number($("proximity-threshold").value || 10);
    const result = await api("/api/admin/masters/" + encodeURIComponent(selectedMaster.type), "POST", body);
    const createdType = selectedMaster.type;
    masterMode = "edit";
    selectedMaster = { type: createdType, id: result.id };
    await loadMasters();
    await loadMasterDetail(createdType, result.id);
    $("master-msg").textContent = "登録しました: " + result.id + ((result.warnings && result.warnings.length) ? " / 近接警告 " + result.warnings.length + "件" : "");
    return;
  }
  await api("/api/admin/masters/" + encodeURIComponent(selectedMaster.type) + "/" + encodeURIComponent(selectedMaster.id), "PUT", body);
  $("master-msg").textContent = "保存しました";
  await loadMasters();
  await loadMasterDetail(selectedMaster.type, selectedMaster.id);
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
$("tab-players").addEventListener("click", () => showTab("players"));
$("tab-masters").addEventListener("click", () => showTab("masters"));
$("master-type").addEventListener("change", loadMasters);
$("btn-master-refresh").addEventListener("click", loadMasters);
$("btn-master-new").addEventListener("click", showNewMasterForm);
$("btn-master-export").addEventListener("click", exportMasterCsv);
$("btn-proximity-check").addEventListener("click", () => checkExistingProximity().catch((e) => {
  $("master-detail").textContent = e.message;
}));
$("btn-master-preview").addEventListener("click", () => previewMasterImport().catch((e) => {
  $("master-detail").textContent = e.message;
}));
$("btn-master-apply").addEventListener("click", () => applyMasterImport().catch((e) => {
  $("master-detail").textContent = e.message;
}));
$("player-list").addEventListener("click", (e) => {
  const li = e.target.closest("[data-player]");
  if (li) loadPlayerDetail(li.dataset.player);
});
$("master-list").addEventListener("click", (e) => {
  const li = e.target.closest("[data-master]");
  if (li) loadMasterDetail($("master-type").value, li.dataset.master);
});

checkLogin();
