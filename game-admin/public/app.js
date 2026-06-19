let selectedPlayerId = null;
let selectedPlayer = null;
let spots = [];
let selectedMaster = null;
let masterMode = "edit";
let currentImportPreview = null;
let currentMasterData = null;
let currentAdminMeta = null;
let adminUsers = [];
let selectedAdminUser = null;
const { formatLocalDateTime } = window.adminTime;
const ADMIN_APP_VERSION = window.ADMIN_APP_VERSION || { version: "dev" };
let masterOptions = { enemies: [], items: [], itemFieldValues: { rarity: [], type: [], category: [] }, assetImages: [], avatarImages: [] };
let idleTimeoutSeconds = 600;
let idleTimer = null;
let loggedIn = false;
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
    shopBuyable: "boolean",
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

function setOptionalHtml(id, value) {
  const el = $(id);
  if (el) el.innerHTML = value;
}

function setOptionalText(id, value) {
  const el = $(id);
  if (el) el.textContent = value;
}

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

function applyAdminMeta(data) {
  currentAdminMeta = data || null;
  const canManageAdmins = data && data.adminRole === "superadmin";
  if ($("tab-admin-users")) $("tab-admin-users").classList.toggle("hidden", !canManageAdmins);
  if (data && Number.isInteger(data.idleTimeoutSeconds) && data.idleTimeoutSeconds > 0) {
    idleTimeoutSeconds = data.idleTimeoutSeconds;
  }
  scheduleIdleTimeout();
}

function scheduleIdleTimeout() {
  if (idleTimer) window.clearTimeout(idleTimer);
  if (!loggedIn) return;
  idleTimer = window.setTimeout(handleIdleTimeout, idleTimeoutSeconds * 1000);
}

async function handleIdleTimeout() {
  if (!loggedIn) return;
  await api("/api/admin/logout", "POST").catch(() => {});
  loggedIn = false;
  showAdmin(false);
  $("login-msg").textContent = "無操作タイムアウトのためログアウトしました";
}

function resetIdleTimeout() {
  if (loggedIn) scheduleIdleTimeout();
}

function resetAdminScreenState() {
  selectedPlayerId = null;
  selectedPlayer = null;
  spots = [];
  selectedMaster = null;
  masterMode = "edit";
  currentImportPreview = null;
  currentMasterData = null;
  currentAdminMeta = null;
  adminUsers = [];
  selectedAdminUser = null;

  $("player-list").innerHTML = "";
  $("master-list").innerHTML = "";
  if ($("admin-user-list")) $("admin-user-list").innerHTML = "";
  setOptionalText("player-detail", "プレイヤーを選択してください。");
  setOptionalText("master-detail", "マスタを選択してください。");
  setOptionalText("admin-user-detail", "管理者を選択してください。");
  setOptionalHtml("spot-state-list", "");
  $("import-preview").classList.add("hidden");
  $("import-summary").textContent = "";
  $("import-errors").innerHTML = "";
  $("import-warnings").innerHTML = "";
  $("import-changes").innerHTML = "";
  $("btn-master-apply").disabled = false;
  $("proximity-result").classList.add("hidden");
  $("proximity-summary").textContent = "";
  $("proximity-list").innerHTML = "";
  $("master-import-file").value = "";
  $("master-type").value = "spots";
  $("csv-encoding").value = "sjis";
  $("proximity-threshold").value = "10";
  showTab("players");
}

function showAdmin(show) {
  loggedIn = show;
  $("login-panel").classList.toggle("hidden", show);
  $("admin-panel").classList.toggle("hidden", !show);
  $("btn-logout").classList.toggle("hidden", !show);
  if (show) {
    scheduleIdleTimeout();
  } else if (idleTimer) {
    window.clearTimeout(idleTimer);
    idleTimer = null;
  }
}

function showTab(tab) {
  const players = tab === "players";
  const masters = tab === "masters";
  const adminUsersTab = tab === "adminUsers";
  $("players-panel").classList.toggle("hidden", !players);
  $("masters-panel").classList.toggle("hidden", !masters);
  if ($("admin-users-panel")) $("admin-users-panel").classList.toggle("hidden", !adminUsersTab);
  $("tab-players").classList.toggle("active", players);
  $("tab-masters").classList.toggle("active", masters);
  if ($("tab-admin-users")) $("tab-admin-users").classList.toggle("active", adminUsersTab);
  if (masters) loadMasters();
  if (adminUsersTab) loadAdminUsers();
}

async function checkLogin() {
  try {
    const meta = await api("/api/admin/me");
    resetAdminScreenState();
    showAdmin(true);
    applyAdminMeta(meta);
    await loadMasterOptions();
    await loadPlayers();
    await loadSpots();
  } catch (e) {
    resetAdminScreenState();
    showAdmin(false);
  }
}

async function login() {
  $("login-msg").textContent = "";
  try {
    const meta = await api("/api/admin/login", "POST", { loginId: $("login-id").value, password: $("login-password").value });
    resetAdminScreenState();
    showAdmin(true);
    applyAdminMeta(meta);
    await loadMasterOptions();
    await loadPlayers();
    await loadSpots();
  } catch (e) {
    $("login-msg").textContent = e.message;
  }
}

async function logout() {
  await api("/api/admin/logout", "POST").catch(() => {});
  resetAdminScreenState();
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

async function loadMasterOptions() {
  masterOptions = await api("/api/admin/master-options");
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

async function loadAdminUsers() {
  if (!currentAdminMeta || currentAdminMeta.adminRole !== "superadmin") return;
  adminUsers = await api("/api/admin/admin-users");
  $("admin-user-list").innerHTML = adminUsers.map((u) =>
    `<li data-admin-user="${escAttr(u.id)}"><div class="player-row"><span>${esc(u.displayName || u.loginId)} <span class="muted">(${esc(u.loginId)})</span></span><span class="badge ${u.disabled ? "disabled" : "enabled"}">${u.disabled ? "停止" : esc(u.role)}</span></div><div class="muted">${esc(u.authSource || "db")} ${esc(u.lastLoginAt ? formatLocalDateTime(u.lastLoginAt) : "未ログイン")}</div></li>`
  ).join("");
}

function showNewAdminUserForm() {
  selectedAdminUser = null;
  renderAdminUserDetail({
    id: "",
    loginId: "",
    displayName: "",
    role: "admin",
    disabled: false,
    disabledReason: "",
  }, true);
}

function loadAdminUserDetail(id) {
  const row = adminUsers.find((u) => u.id === id);
  if (!row) return;
  selectedAdminUser = row;
  renderAdminUserDetail(row, false);
}

function renderAdminUserDetail(user, isNew) {
  const tpl = $("admin-user-detail-template").content.cloneNode(true);
  $("admin-user-detail").innerHTML = "";
  $("admin-user-detail").appendChild(tpl);
  $("admin-user-title").textContent = isNew ? "新規管理者" : (user.displayName || user.loginId);
  $("admin-user-id").textContent = isNew ? "DB管理者を追加します" : user.id;
  const badge = $("admin-user-badge");
  badge.textContent = user.disabled ? "停止" : user.role;
  badge.classList.add(user.disabled ? "disabled" : "enabled");
  const form = $("admin-user-form");
  form.elements.loginId.value = user.loginId || "";
  form.elements.loginId.readOnly = !isNew;
  form.elements.displayName.value = user.displayName || "";
  form.elements.role.value = user.role || "admin";
  form.elements.disabled.checked = Boolean(user.disabled);
  form.elements.disabledReason.value = user.disabledReason || "";
  $("admin-user-password-row").classList.toggle("hidden", !isNew);
  $("btn-admin-user-reset-password").classList.toggle("hidden", isNew);
  $("btn-admin-user-save").addEventListener("click", saveAdminUser);
  $("btn-admin-user-reset-password").addEventListener("click", resetAdminUserPassword);
}

async function saveAdminUser() {
  const form = $("admin-user-form");
  const body = {
    displayName: form.elements.displayName.value,
    role: form.elements.role.value,
    disabled: form.elements.disabled.checked,
    disabledReason: form.elements.disabledReason.value,
  };
  if (!selectedAdminUser) {
    body.loginId = form.elements.loginId.value;
    body.password = form.elements.password.value;
    const result = await api("/api/admin/admin-users", "POST", body);
    await loadAdminUsers();
    loadAdminUserDetail(result.adminUser.id);
    $("admin-user-msg").textContent = "登録しました";
    return;
  }
  const result = await api("/api/admin/admin-users/" + encodeURIComponent(selectedAdminUser.id), "PUT", body);
  await loadAdminUsers();
  loadAdminUserDetail(result.adminUser.id);
  $("admin-user-msg").textContent = "保存しました";
}

async function resetAdminUserPassword() {
  if (!selectedAdminUser) return;
  const password = window.prompt("新しいパスワードを入力してください（8文字以上）");
  if (!password) return;
  await api("/api/admin/admin-users/" + encodeURIComponent(selectedAdminUser.id) + "/password", "POST", { password });
  $("admin-user-msg").textContent = "パスワードを再設定しました";
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
  const type = $("master-type").value;
  const fields = preview.fields || MASTER_FIELDS[type] || {};
  const missingEditableData = preview.changes.some((change) => !change.data);
  $("import-preview").classList.remove("hidden");
  $("import-summary").textContent =
    `追加 ${preview.insertCount} / 更新 ${preview.updateCount} / 変更なし ${preview.noChangeCount} / CSV未掲載 ${preview.missingCount} / エラー ${preview.errors.length}`;
  $("import-errors").innerHTML = preview.errors.length
    ? preview.errors.map((e) => `<li class="danger">行${e.row || "-"} ${esc(e.id || "")}: ${esc(e.error)}</li>`).join("")
    : (missingEditableData ? "<li class=\"danger\">編集可能なプレビュー情報が不足しています。管理APIを更新してから再度プレビューしてください。</li>" : "<li>エラーなし</li>");
  $("import-warnings").innerHTML = preview.warnings && preview.warnings.length
    ? preview.warnings.map((w) => `<li class="warning">${esc(w.message)}</li>`).join("")
    : "<li>警告なし</li>";
  $("import-changes").innerHTML = preview.changes.length
    ? preview.changes.map((c, index) => renderImportChange(fields, c, index)).join("")
    : "<li>変更なし</li>";
  $("btn-master-apply").disabled = preview.errors.length > 0 || missingEditableData;
}

function renderImportChange(fields, change, index) {
  const duplicateLabel = change.duplicate ? " / 重複" : "";
  const checked = change.import === false ? "" : " checked";
  const data = change.data || {};
  const changedFields = change.changedFields || [];
  const warnings = (change.warnings || []).map((warning) => `<div class="warning inline-warning">${esc(warning.message)}</div>`).join("");
  return `<li class="import-change" data-import-index="${index}">
    <label class="check-row"><input class="import-include" type="checkbox"${checked}> 取込む</label>
    <div><strong>${esc(change.type)}: ${esc(change.id)}</strong><span class="muted">${duplicateLabel} / ${esc(changedFields.join(", ") || "変更なし")}</span></div>
    ${warnings}
    <div class="master-form">${Object.entries(fields).map(([field, fieldType]) => renderImportField(field, fieldType, data[field])).join("")}</div>
  </li>`;
}

function renderImportField(field, fieldType, value) {
  const readonly = MASTER_PRIMARY_IDS[$("master-type").value] === field;
  if (fieldType === "boolean") {
    return `<label class="check-row">${esc(field)}<input name="${escAttr(field)}" type="checkbox" ${value ? "checked" : ""}></label>`;
  }
  const inputType = fieldType === "int" || fieldType === "number" ? "number" : "text";
  const step = fieldType === "number" ? " step=\"any\"" : "";
  return `<label>${esc(field)}<input name="${escAttr(field)}" type="${inputType}"${step} value="${escAttr(value == null ? "" : value)}" ${readonly ? "readonly" : ""}></label>`;
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
  const r = await api("/api/admin/masters/" + encodeURIComponent(type) + "/import/apply", "POST", {
    previewId: currentImportPreview.previewId,
    selectedChanges: collectSelectedImportChanges(),
  });
  $("import-summary").textContent = "反映しました: " + r.applied + "件";
  currentImportPreview = null;
  await loadMasters();
  $("master-detail").textContent = "CSVを反映しました: " + r.applied + "件";
}

function collectSelectedImportChanges() {
  return Array.from(document.querySelectorAll("[data-import-index]")).map((row) => {
    const change = currentImportPreview.changes[Number(row.dataset.importIndex)];
    const data = {};
    row.querySelectorAll("input[name]").forEach((input) => {
      data[input.name] = input.type === "checkbox" ? input.checked : input.value;
    });
    return {
      id: change.id,
      import: Boolean(row.querySelector(".import-include").checked),
      data,
    };
  });
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

function copyMasterAsNew() {
  if (!selectedMaster || !currentMasterData) return;
  const type = selectedMaster.type;
  const fields = MASTER_FIELDS[type];
  const data = { ...currentMasterData };
  data[MASTER_PRIMARY_IDS[type]] = "";
  masterMode = "new";
  selectedMaster = { type, id: null };
  renderMasterDetail(type, "", fields, data);
  $("master-title").textContent = "コピーして新規登録";
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
  setText("[data-field='downed']", formatLocalDateTime(p.downedUntil, "なし"));

  $("spot-select").innerHTML = spots.map((s) => `<option value="${escAttr(s.spotId)}">${esc(s.name)} (${esc(s.spotId)})</option>`).join("");
  $("spot-select").addEventListener("change", syncSpotForm);
  $("btn-disable").addEventListener("click", () => setDisabled(true));
  $("btn-enable").addEventListener("click", () => setDisabled(false));
  $("btn-clear-sessions").addEventListener("click", clearSessions);
  $("btn-save-avatar").addEventListener("click", savePlayerAvatar);
  $("player-avatar-select").addEventListener("input", () => syncImagePreview($("player-avatar-select"), "player-avatar-preview"));
  $("btn-save-spot").addEventListener("click", saveSpotState);
  renderPlayerAvatarEditor(p);
  renderSpotStateList(p);
  renderItems(p);
  syncSpotForm();
}

function renderPlayerAvatarEditor(p) {
  const options = masterOptions.avatarImages || [];
  $("player-avatar-options").innerHTML = options.map((src) => `<option value="${escAttr(src)}"></option>`).join("");
  $("player-avatar-select").value = p.avatar || "assets/avatar_dog_bold_2.png";
  syncImagePreview($("player-avatar-select"), "player-avatar-preview");
}

function renderSpotStateList(p) {
  const defeated = new Set(p.defeatedSpots || []);
  $("spot-state-list").innerHTML = p.spotStates.length
    ? p.spotStates.map((s) => `<li>${esc(s.spotName)} (${esc(s.spotId)}) / ${defeated.has(s.spotId) ? "撃破済み" : "未撃破"} / victory: ${esc(formatLocalDateTime(s.victoryUntil))} / penalty: ${esc(formatLocalDateTime(s.penaltyUntil))}</li>`).join("")
    : "<li>状態レコードなし</li>";
}

function renderItems(p) {
  $("item-list").innerHTML = p.items.length
    ? p.items.map((i) => `<li>${esc(i.name)} (${esc(i.itemId)}) x${i.qty} [${esc(i.rarity || "")}]</li>`).join("")
    : "<li>所持アイテムなし</li>";
}

function renderMasterDetail(type, id, fields, data) {
  currentMasterData = { ...data };
  const tpl = $("master-detail-template").content.cloneNode(true);
  $("master-detail").innerHTML = "";
  $("master-detail").appendChild(tpl);
  $("master-title").textContent = data.name || data.regionName || id;
  $("master-id").textContent = type + " / " + id;
  const form = $("master-form");
  form.innerHTML = Object.entries(fields).map(([field, fieldType]) => renderMasterField(type, field, fieldType, data[field])).join("");
  $("btn-master-copy").classList.toggle("hidden", masterMode === "new");
  $("btn-master-copy").addEventListener("click", copyMasterAsNew);
  $("btn-master-save").addEventListener("click", saveMaster);
  const imageInput = form.querySelector("input[name='image']");
  if (imageInput) imageInput.addEventListener("input", () => syncImagePreview(imageInput, "master-image-preview"));
}

function renderMasterField(masterType, field, fieldType, value) {
  const readonly = MASTER_PRIMARY_IDS[masterType] === field && masterMode !== "new";
  if (fieldType === "boolean") {
    return `<label class="check-row"><input name="${escAttr(field)}" type="checkbox" ${value ? "checked" : ""} ${readonly ? "disabled" : ""}> ${esc(field)}</label>`;
  }
  if (masterType === "spots" && field === "enemyId") {
    return renderReferenceSelect(field, value, masterOptions.enemies || [], false, readonly);
  }
  if (masterType === "spots" && field === "rewardItemId") {
    return renderReferenceSelect(field, value, masterOptions.items || [], false, readonly);
  }
  if (masterType === "enemies" && field === "dropItemId") {
    return renderReferenceSelect(field, value, masterOptions.items || [], true, readonly);
  }
  if (masterType === "enemies" && field === "image") {
    return renderDatalistInput(field, fieldType, value, masterOptions.assetImages || [], readonly);
  }
  if (masterType === "items" && ["rarity", "type", "category"].includes(field)) {
    return renderDatalistInput(field, fieldType, value, (masterOptions.itemFieldValues && masterOptions.itemFieldValues[field]) || [], readonly);
  }
  const inputType = fieldType === "int" || fieldType === "number" ? "number" : "text";
  const step = fieldType === "number" ? " step=\"any\"" : "";
  return `<label>${esc(field)}<input name="${escAttr(field)}" type="${inputType}"${step} value="${escAttr(value == null ? "" : value)}" ${readonly ? "readonly" : ""}></label>`;
}

function renderReferenceSelect(field, value, options, allowEmpty, readonly) {
  const current = value == null ? "" : String(value);
  const known = new Set(options.map((option) => String(option.id)));
  const extra = current && !known.has(current)
    ? `<option value="${escAttr(current)}">${esc(current)}:現在値</option>`
    : "";
  return `<label>${esc(field)}<select name="${escAttr(field)}" ${readonly ? "disabled" : ""}>${allowEmpty ? "<option value=\"\">(なし)</option>" : ""}${extra}${options.map((option) => `<option value="${escAttr(option.id)}" ${String(option.id) === current ? "selected" : ""}>${esc(option.id)}:${esc(option.name)}</option>`).join("")}</select></label>`;
}

function renderDatalistInput(field, fieldType, value, options, readonly) {
  const listId = "list-" + field;
  const inputType = fieldType === "int" || fieldType === "number" ? "number" : "text";
  const input = `<label>${esc(field)}<input name="${escAttr(field)}" type="${inputType}" list="${escAttr(listId)}" value="${escAttr(value == null ? "" : value)}" ${readonly ? "readonly" : ""}><datalist id="${escAttr(listId)}">${options.map((option) => `<option value="${escAttr(option)}"></option>`).join("")}</datalist></label>`;
  return field === "image" ? input + renderImagePreview(value, "master-image-preview") : input;
}

function resolveAssetSrc(value) {
  const src = String(value || "").trim();
  if (!src) return "";
  if (/^(https?:)?\/\//.test(src) || src.startsWith("/") || src.startsWith("./")) return src;
  return "/" + src.replace(/^\/+/, "");
}

function renderImagePreview(value, id) {
  const src = resolveAssetSrc(value);
  return `<img id="${escAttr(id)}" class="image-preview${src ? "" : " hidden"}" src="${escAttr(src)}" alt="image preview">`;
}

function syncImagePreview(input, previewId) {
  const preview = $(previewId);
  if (!preview || !input) return;
  const src = resolveAssetSrc(input.value);
  if (src) {
    preview.src = src;
    preview.classList.remove("hidden");
  } else {
    preview.removeAttribute("src");
    preview.classList.add("hidden");
  }
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

async function savePlayerAvatar() {
  if (!selectedPlayer) return;
  const avatar = $("player-avatar-select").value;
  const result = await api("/api/admin/players/" + encodeURIComponent(selectedPlayer.id) + "/avatar", "POST", { avatar });
  $("detail-msg").textContent = "画像を保存しました";
  selectedPlayer.avatar = result.avatar;
  await loadPlayers();
  await loadPlayerDetail(selectedPlayer.id);
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
if ($("tab-admin-users")) $("tab-admin-users").addEventListener("click", () => showTab("adminUsers"));
$("master-type").addEventListener("change", loadMasters);
$("btn-master-refresh").addEventListener("click", loadMasters);
$("btn-master-new").addEventListener("click", showNewMasterForm);
$("btn-master-export").addEventListener("click", exportMasterCsv);
if ($("btn-admin-users-refresh")) $("btn-admin-users-refresh").addEventListener("click", loadAdminUsers);
if ($("btn-admin-user-new")) $("btn-admin-user-new").addEventListener("click", showNewAdminUserForm);
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
if ($("admin-user-list")) {
  $("admin-user-list").addEventListener("click", (e) => {
    const li = e.target.closest("[data-admin-user]");
    if (li) loadAdminUserDetail(li.dataset.adminUser);
  });
}

if ($("admin-version")) {
  $("admin-version").textContent = "管理アプリ v" + ADMIN_APP_VERSION.version;
}
["click", "keydown", "pointermove", "input"].forEach((eventName) => {
  document.addEventListener(eventName, resetIdleTimeout, { passive: true });
});

checkLogin();
