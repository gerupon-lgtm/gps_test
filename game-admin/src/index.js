const path = require("path");
const crypto = require("crypto");
const Fastify = require("fastify");
const cookie = require("@fastify/cookie");
const iconv = require("iconv-lite");
const { z } = require("zod");
const { prisma } = require("./db");
const adminCsv = require("./adminCsv");
const {
  createAdminSession,
  getIdleTimeoutSeconds,
  validateAdminSession,
} = require("./adminSession");

const PORT = Number(process.env.PORT || 3010);
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const COOKIE_SECRET = process.env.ADMIN_COOKIE_SECRET || process.env.SESSION_SECRET || "dev-admin-secret";
const ADMIN_IDLE_TIMEOUT_SECONDS = getIdleTimeoutSeconds(process.env);
const SESSION_COOKIE = "admin_sid";
const sessions = new Map();
const importPreviews = new Map();

const app = Fastify({ logger: true, bodyLimit: 5 * 1024 * 1024 });
app.register(cookie, { secret: COOKIE_SECRET });
app.register(require("@fastify/static"), {
  root: path.join(__dirname, "..", "public"),
  prefix: "/",
});

function requireAdmin(handler) {
  return async (req, reply) => {
    const sid = req.cookies && req.cookies[SESSION_COOKIE];
    const session = sid && sessions.get(sid);
    const validation = validateAdminSession(session, Date.now(), ADMIN_IDLE_TIMEOUT_SECONDS);
    if (!validation.ok) {
      if (sid) sessions.delete(sid);
      return reply.code(401).send({ error: "管理者ログインが必要です" });
    }
    req.adminName = session.adminName;
    return handler(req, reply);
  };
}

function setAdminCookie(reply, sid) {
  reply.setCookie(SESSION_COOKIE, sid, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 8 * 60 * 60,
  });
}

async function audit(adminName, action, targetType, targetId, beforeData, afterData) {
  await prisma.adminAuditLog.create({
    data: {
      adminName,
      action,
      targetType,
      targetId: targetId || null,
      beforeJson: beforeData == null ? null : JSON.stringify(beforeData),
      afterJson: afterData == null ? null : JSON.stringify(afterData),
    },
  });
}

function parseDefeatedSpots(value) {
  return Array.from(new Set(String(value || "").split(",").map((x) => x.trim()).filter(Boolean)));
}

function stringifyDefeatedSpots(ids) {
  return Array.from(new Set(ids || [])).filter(Boolean).join(",");
}

const MASTER_CONFIG = {
  spots: {
    model: "spotMaster",
    idField: "spotId",
    labelField: "name",
    defaults: { active: true },
    idPrefix: "spot",
    fields: {
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
  },
  enemies: {
    model: "enemyMaster",
    idField: "enemyId",
    labelField: "name",
    defaults: { active: true },
    idPrefix: "enemy",
    fields: {
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
  },
  items: {
    model: "itemMaster",
    idField: "itemId",
    labelField: "name",
    defaults: { active: true },
    idPrefix: "item",
    fields: {
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
  },
  inns: {
    model: "innMaster",
    idField: "innId",
    labelField: "name",
    defaults: { active: true },
    idPrefix: "inn",
    fields: { innId: "string", name: "string", lat: "number", lng: "number", radiusM: "int", active: "boolean" },
  },
  shops: {
    model: "shopMaster",
    idField: "shopId",
    labelField: "name",
    defaults: { active: true },
    idPrefix: "shop",
    fields: { shopId: "string", name: "string", lat: "number", lng: "number", radiusM: "int", active: "boolean" },
  },
  postalAreas: {
    model: "postalAreaMaster",
    idField: "areaKey",
    labelField: "regionName",
    defaults: { active: true },
    fields: {
      areaKey: "string",
      postalCode: "nullableString",
      muniCd: "string",
      areaName: "string",
      regionName: "string",
      active: "boolean",
    },
  },
};

function normalizeMasterValue(type, value) {
  if (type === "boolean") return value === true || value === "true" || value === "1" || value === 1;
  if (type === "int") {
    const n = Number(value);
    if (!Number.isInteger(n)) throw new Error("INVALID_NUMBER");
    return n;
  }
  if (type === "number") {
    const n = Number(value);
    if (!Number.isFinite(n)) throw new Error("INVALID_NUMBER");
    return n;
  }
  if (type === "nullableString") {
    const s = value == null ? "" : String(value).trim();
    return s === "" ? null : s;
  }
  return value == null ? "" : String(value);
}

function buildMasterData(config, body, allowId) {
  const data = {};
  for (const [field, type] of Object.entries(config.fields)) {
    if (!allowId && field === config.idField) continue;
    if (!Object.prototype.hasOwnProperty.call(body, field)) continue;
    data[field] = normalizeMasterValue(type, body[field]);
  }
  return data;
}

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function toCsv(rows, headers) {
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((h) => csvEscape(row[h])).join(",")),
  ].join("\n") + "\n";
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  const src = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      if (row.some((v) => String(v).trim() !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  row.push(cell);
  if (row.some((v) => String(v).trim() !== "")) rows.push(row);
  if (rows.length === 0) return [];
  const headers = rows[0].map((h) => String(h).trim());
  return rows.slice(1).map((cols) => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = cols[i] == null ? "" : String(cols[i]).trim(); });
    return obj;
  });
}

function rowsToCsvObjects(rows, config) {
  const headers = Object.keys(config.fields);
  return {
    headers,
    rows: rows.map((row) => {
      const out = {};
      headers.forEach((h) => { out[h] = row[h]; });
      return out;
    }),
  };
}

function diffMasterRows(config, rows, existingRows) {
  const existingMap = new Map(existingRows.map((row) => [String(row[config.idField]), row]));
  const seen = new Set();
  const changes = [];
  const errors = [];
  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i];
    const rowNo = i + 2;
    const id = String(raw[config.idField] || "").trim();
    if (!id) {
      errors.push({ row: rowNo, error: "IDが空です" });
      continue;
    }
    if (seen.has(id)) {
      errors.push({ row: rowNo, id, error: "IDが重複しています" });
      continue;
    }
    seen.add(id);
    let data;
    try {
      data = buildMasterData(config, raw, true);
    } catch (e) {
      errors.push({ row: rowNo, id, error: "数値項目が不正です" });
      continue;
    }
    const before = existingMap.get(id) || null;
    const type = before ? "update" : "insert";
    if (!before) {
      for (const [field, value] of Object.entries(config.defaults || {})) {
        if (!Object.prototype.hasOwnProperty.call(data, field)) data[field] = value;
      }
      const missing = Object.entries(config.fields)
        .filter(([field, fieldType]) =>
          fieldType !== "nullableString" &&
          !Object.prototype.hasOwnProperty.call(config.defaults || {}, field) &&
          !Object.prototype.hasOwnProperty.call(data, field)
        )
        .map(([field]) => field);
      if (missing.length > 0) {
        errors.push({ row: rowNo, id, error: "新規追加に必要な列が不足しています: " + missing.join(", ") });
        continue;
      }
    }
    const changedFields = [];
    if (before) {
      const fieldsToCompare = Object.keys(data).filter((field) => field !== config.idField);
      for (const field of fieldsToCompare) {
        const a = before[field] == null ? null : before[field];
        const b = data[field] == null ? null : data[field];
        if (String(a) !== String(b)) changedFields.push(field);
      }
    } else {
      changedFields.push(...Object.keys(config.fields));
    }
    changes.push({ row: rowNo, id, type, changedFields, data });
  }
  const missingIds = Array.from(existingMap.keys()).filter((id) => !seen.has(id));
  return { changes, errors, missingIds };
}

function normalizeCsvEncoding(value) {
  const v = String(value || "sjis").toLowerCase();
  return v === "utf8" || v === "utf-8" ? "utf8" : "sjis";
}

function decodeCsvBody(body) {
  const encoding = normalizeCsvEncoding(body && body.encoding);
  if (body && body.csvBase64) {
    const buf = Buffer.from(String(body.csvBase64), "base64");
    return encoding === "sjis" ? iconv.decode(buf, "Shift_JIS") : buf.toString("utf8");
  }
  return String((body && body.csvText) || "");
}

function encodeCsvBody(text, encoding) {
  const normalized = normalizeCsvEncoding(encoding);
  return normalized === "sjis" ? iconv.encode(text, "Shift_JIS") : Buffer.from(text, "utf8");
}

function masterRowToFacility(type, row, idField) {
  return {
    type,
    id: String(row[idField]),
    name: row.name || String(row[idField]),
    lat: row.lat,
    lng: row.lng,
  };
}

async function loadFacilityRows(tx) {
  const [spots, inns, shops] = await Promise.all([
    tx.spotMaster.findMany({ select: { spotId: true, name: true, lat: true, lng: true } }),
    tx.innMaster.findMany({ select: { innId: true, name: true, lat: true, lng: true } }),
    tx.shopMaster.findMany({ select: { shopId: true, name: true, lat: true, lng: true } }),
  ]);
  return [
    ...spots.map((row) => masterRowToFacility("spots", row, "spotId")),
    ...inns.map((row) => masterRowToFacility("inns", row, "innId")),
    ...shops.map((row) => masterRowToFacility("shops", row, "shopId")),
  ];
}

function previewFacilities(type, config, changes) {
  if (!["spots", "inns", "shops"].includes(type)) return [];
  return changes
    .filter((change) => change.type === "insert" || change.changedFields.includes("lat") || change.changedFields.includes("lng"))
    .map((change) => masterRowToFacility(type, change.data, config.idField));
}

function importChangeToResponse(change) {
  const duplicate = change.type === "update";
  return {
    row: change.row,
    id: change.id,
    type: change.type,
    duplicate,
    import: change.import,
    warnings: change.warnings || [],
    changedFields: change.changedFields,
    data: change.data,
  };
}

app.get("/api/health", async () => ({ ok: true, time: new Date().toISOString() }));

app.post("/api/admin/login", async (req, reply) => {
  const schema = z.object({ loginId: z.string(), password: z.string() });
  const p = schema.safeParse(req.body);
  if (!p.success) return reply.code(400).send({ error: "入力が不正です" });
  if (!ADMIN_PASSWORD || p.data.loginId !== ADMIN_USER || p.data.password !== ADMIN_PASSWORD) {
    return reply.code(401).send({ error: "管理者IDまたはパスワードが違います" });
  }
  const sid = crypto.randomBytes(32).toString("hex");
  sessions.set(sid, createAdminSession(ADMIN_USER, Date.now()));
  setAdminCookie(reply, sid);
  return { ok: true, adminName: ADMIN_USER, idleTimeoutSeconds: ADMIN_IDLE_TIMEOUT_SECONDS };
});

app.post("/api/admin/logout", async (req, reply) => {
  const sid = req.cookies && req.cookies[SESSION_COOKIE];
  if (sid) sessions.delete(sid);
  reply.clearCookie(SESSION_COOKIE, { path: "/" });
  return { ok: true };
});

app.get("/api/admin/me", requireAdmin(async (req) => ({
  ok: true,
  adminName: req.adminName,
  idleTimeoutSeconds: ADMIN_IDLE_TIMEOUT_SECONDS,
})));

app.get("/api/admin/players", requireAdmin(async () => {
  const players = await prisma.player.findMany({
    include: { user: true },
    orderBy: { updatedAt: "desc" },
    take: 500,
  });
  return players.map((p) => ({
    id: p.id,
    userId: p.userId,
    loginId: p.user.loginId,
    name: p.name,
    level: p.level,
    hp: p.hp,
    maxHp: p.maxHp,
    gold: p.gold,
    disabled: p.user.disabled,
    disabledReason: p.user.disabledReason,
    updatedAt: p.updatedAt,
  }));
}));

app.get("/api/admin/players/:playerId", requireAdmin(async (req, reply) => {
  const player = await prisma.player.findUnique({
    where: { id: req.params.playerId },
    include: {
      user: true,
      items: { include: { item: true }, orderBy: { itemId: "asc" } },
      spotStates: { include: { spot: true }, orderBy: { spotId: "asc" } },
    },
  });
  if (!player) return reply.code(404).send({ error: "プレイヤーが見つかりません" });
  const defeated = new Set(parseDefeatedSpots(player.defeatedSpots));
  return {
    id: player.id,
    userId: player.userId,
    loginId: player.user.loginId,
    name: player.name,
    level: player.level,
    exp: player.exp,
    hp: player.hp,
    maxHp: player.maxHp,
    attack: player.attack,
    defense: player.defense,
    gold: player.gold,
    poisoned: player.poisoned,
    downedUntil: player.downedUntil,
    disabled: player.user.disabled,
    disabledReason: player.user.disabledReason,
    defeatedSpots: Array.from(defeated),
    items: player.items.map((r) => ({ itemId: r.itemId, name: r.item.name, qty: r.qty, rarity: r.item.rarity })),
    spotStates: player.spotStates.map((s) => ({
      spotId: s.spotId,
      spotName: s.spot ? s.spot.name : s.spotId,
      defeated: defeated.has(s.spotId),
      victoryUntil: s.victoryUntil,
      penaltyUntil: s.penaltyUntil,
    })),
  };
}));

app.post("/api/admin/users/:userId/disabled", requireAdmin(async (req, reply) => {
  const schema = z.object({ disabled: z.boolean(), reason: z.string().max(200).optional() });
  const p = schema.safeParse(req.body);
  if (!p.success) return reply.code(400).send({ error: "入力が不正です" });
  const before = await prisma.user.findUnique({ where: { id: req.params.userId } });
  if (!before) return reply.code(404).send({ error: "ユーザーが見つかりません" });
  const after = await prisma.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id: req.params.userId },
      data: {
        disabled: p.data.disabled,
        disabledAt: p.data.disabled ? new Date() : null,
        disabledReason: p.data.disabled ? (p.data.reason || null) : null,
      },
    });
    if (p.data.disabled) await tx.session.deleteMany({ where: { userId: req.params.userId } });
    return user;
  });
  await audit(req.adminName, p.data.disabled ? "disable_user" : "enable_user", "User", before.id, before, after);
  return { ok: true, disabled: after.disabled };
}));

app.post("/api/admin/users/:userId/sessions/clear", requireAdmin(async (req, reply) => {
  const before = await prisma.session.findMany({ where: { userId: req.params.userId } });
  await prisma.session.deleteMany({ where: { userId: req.params.userId } });
  await audit(req.adminName, "clear_sessions", "User", req.params.userId, before, []);
  return { ok: true, deleted: before.length };
}));

app.get("/api/admin/spots", requireAdmin(async () => {
  const spots = await prisma.spotMaster.findMany({ where: { active: true }, orderBy: { spotId: "asc" } });
  return spots.map((s) => ({ spotId: s.spotId, name: s.name }));
}));

app.get("/api/admin/facilities/proximity", requireAdmin(async (req) => {
  const thresholdM = Math.max(1, Math.min(1000, Number(req.query.thresholdM || 10)));
  const warnings = adminCsv.findExistingProximityWarnings({
    thresholdM,
    facilities: await loadFacilityRows(prisma),
  });
  return {
    thresholdM,
    count: warnings.length,
    warnings: warnings.slice(0, 500).map((warning) => ({
      message: `${warning.a.name} (${warning.a.type}:${warning.a.id}) と ${warning.b.name} (${warning.b.type}:${warning.b.id}) が約${warning.distanceM}mです`,
      distanceM: warning.distanceM,
      a: warning.a,
      b: warning.b,
    })),
    truncated: warnings.length > 500,
  };
}));

app.post("/api/admin/players/:playerId/defeated-spots", requireAdmin(async (req, reply) => {
  const schema = z.object({
    spotId: z.string(),
    defeated: z.boolean(),
    victoryUntil: z.string().datetime().nullable().optional(),
    clearPenalty: z.boolean().optional(),
  });
  const p = schema.safeParse(req.body);
  if (!p.success) return reply.code(400).send({ error: "入力が不正です", detail: p.error.issues });
  const { spotId, defeated, victoryUntil, clearPenalty } = p.data;

  const before = await prisma.player.findUnique({
    where: { id: req.params.playerId },
    include: { spotStates: { where: { spotId } } },
  });
  if (!before) return reply.code(404).send({ error: "プレイヤーが見つかりません" });

  const spot = await prisma.spotMaster.findUnique({ where: { spotId } });
  if (!spot) return reply.code(404).send({ error: "スポットが見つかりません" });

  const result = await prisma.$transaction(async (tx) => {
    const ids = parseDefeatedSpots(before.defeatedSpots);
    const nextIds = defeated ? Array.from(new Set(ids.concat(spotId))) : ids.filter((id) => id !== spotId);
    const player = await tx.player.update({
      where: { id: before.id },
      data: { defeatedSpots: stringifyDefeatedSpots(nextIds) },
    });
    const state = await tx.playerSpotState.upsert({
      where: { playerId_spotId: { playerId: before.id, spotId } },
      update: {
        victoryUntil: defeated ? (victoryUntil ? new Date(victoryUntil) : null) : null,
        ...(clearPenalty ? { penaltyUntil: null } : {}),
      },
      create: {
        playerId: before.id,
        spotId,
        victoryUntil: defeated && victoryUntil ? new Date(victoryUntil) : null,
        penaltyUntil: null,
      },
    });
    return { player, state };
  });
  await audit(req.adminName, defeated ? "add_defeated_spot" : "remove_defeated_spot", "Player", before.id, before, result);
  return { ok: true };
}));

app.get("/api/admin/masters/:type", requireAdmin(async (req, reply) => {
  const config = MASTER_CONFIG[req.params.type];
  if (!config) return reply.code(404).send({ error: "マスタ種別が見つかりません" });
  const rows = await prisma[config.model].findMany({ orderBy: { [config.idField]: "asc" }, take: 1000 });
  return rows.map((row) => ({
    id: row[config.idField],
    label: row[config.labelField],
    active: Object.prototype.hasOwnProperty.call(row, "active") ? row.active : true,
  }));
}));

app.post("/api/admin/masters/:type", requireAdmin(async (req, reply) => {
  const config = MASTER_CONFIG[req.params.type];
  if (!config) return reply.code(404).send({ error: "マスタ種別が見つかりません" });
  const existing = await prisma[config.model].findMany();
  const prepared = adminCsv.prepareMasterInsert(config, req.body || {}, existing);
  if (prepared.errors.length > 0 || !prepared.change) {
    return reply.code(400).send({ error: prepared.errors.map((e) => e.error).join(", "), errors: prepared.errors });
  }
  const thresholdM = Math.max(1, Math.min(1000, Number((req.body && req.body.proximityThresholdM) || 10)));
  const warnings = ["spots", "inns", "shops"].includes(req.params.type)
    ? adminCsv.findProximityWarnings({
        thresholdM,
        existingFacilities: await loadFacilityRows(prisma),
        importedFacilities: previewFacilities(req.params.type, config, [prepared.change]),
      })
    : [];
  const row = await prisma[config.model].create({ data: prepared.change.data });
  await audit(req.adminName, "create_master", req.params.type, prepared.change.id, null, row);
  return {
    ok: true,
    id: prepared.change.id,
    data: row,
    warnings: warnings.slice(0, 100).map((warning) => ({
      message: `${warning.a.name} (${warning.a.type}:${warning.a.id}) と ${warning.b.name} (${warning.b.type}:${warning.b.id}) が約${warning.distanceM}mです`,
      distanceM: warning.distanceM,
      a: warning.a,
      b: warning.b,
    })),
  };
}));

app.get("/api/admin/masters/:type/:id", requireAdmin(async (req, reply) => {
  const config = MASTER_CONFIG[req.params.type];
  if (!config) return reply.code(404).send({ error: "マスタ種別が見つかりません" });
  const row = await prisma[config.model].findUnique({ where: { [config.idField]: req.params.id } });
  if (!row) return reply.code(404).send({ error: "マスタが見つかりません" });
  return { fields: config.fields, data: row };
}));

app.put("/api/admin/masters/:type/:id", requireAdmin(async (req, reply) => {
  const config = MASTER_CONFIG[req.params.type];
  if (!config) return reply.code(404).send({ error: "マスタ種別が見つかりません" });
  const before = await prisma[config.model].findUnique({ where: { [config.idField]: req.params.id } });
  if (!before) return reply.code(404).send({ error: "マスタが見つかりません" });
  let data;
  try {
    data = buildMasterData(config, req.body || {}, false);
  } catch (e) {
    return reply.code(400).send({ error: "数値項目が不正です" });
  }
  const after = await prisma[config.model].update({
    where: { [config.idField]: req.params.id },
    data,
  });
  await audit(req.adminName, "update_master", req.params.type, req.params.id, before, after);
  return { ok: true, data: after };
}));

app.get("/api/admin/masters/:type/export.csv", requireAdmin(async (req, reply) => {
  const config = MASTER_CONFIG[req.params.type];
  if (!config) return reply.code(404).send({ error: "マスタ種別が見つかりません" });
  const rows = await prisma[config.model].findMany({ orderBy: { [config.idField]: "asc" } });
  const csv = adminCsv.rowsToCsvObjects(rows, config);
  const encoding = normalizeCsvEncoding(req.query && req.query.encoding);
  const body = encodeCsvBody(adminCsv.toCsv(csv.rows, csv.headers), encoding);
  reply
    .header("Content-Type", `text/csv; charset=${encoding === "sjis" ? "Shift_JIS" : "utf-8"}`)
    .header("Content-Disposition", `attachment; filename="${req.params.type}.csv"`);
  return body;
}));

app.post("/api/admin/masters/:type/import/preview", requireAdmin(async (req, reply) => {
  const config = MASTER_CONFIG[req.params.type];
  if (!config) return reply.code(404).send({ error: "マスタ種別が見つかりません" });
  const schema = z.object({
    csvText: z.string().optional(),
    csvBase64: z.string().optional(),
    encoding: z.string().optional(),
    proximityThresholdM: z.number().min(1).max(1000).optional(),
  }).refine((v) => Boolean(v.csvText || v.csvBase64));
  const p = schema.safeParse(req.body);
  if (!p.success) return reply.code(400).send({ error: "CSVが空です" });
  const rows = adminCsv.parseCsv(decodeCsvBody(p.data));
  const existing = await prisma[config.model].findMany();
  const preview = adminCsv.diffMasterRows(config, rows, existing);
  const proximityWarnings = ["spots", "inns", "shops"].includes(req.params.type)
    ? adminCsv.findProximityWarnings({
        thresholdM: p.data.proximityThresholdM || 10,
        existingFacilities: await loadFacilityRows(prisma),
        importedFacilities: previewFacilities(req.params.type, config, preview.changes),
      })
    : [];
  const previewId = crypto.randomBytes(16).toString("hex");
  importPreviews.set(previewId, {
    adminName: req.adminName,
    type: req.params.type,
    createdAt: Date.now(),
    changes: preview.changes,
  });
  return {
    previewId,
    fields: config.fields,
    insertCount: preview.changes.filter((c) => c.type === "insert").length,
    updateCount: preview.changes.filter((c) => c.type === "update" && c.changedFields.length > 0).length,
    noChangeCount: preview.changes.filter((c) => c.type === "update" && c.changedFields.length === 0).length,
    missingCount: preview.missingIds.length,
    errors: preview.errors,
    warnings: proximityWarnings.slice(0, 100).map((warning) => ({
      type: "proximity",
      message: `${warning.a.name} (${warning.a.type}:${warning.a.id}) と ${warning.b.name} (${warning.b.type}:${warning.b.id}) が約${warning.distanceM}mです`,
      distanceM: warning.distanceM,
      a: warning.a,
      b: warning.b,
    })),
    missingIds: preview.missingIds.slice(0, 100),
    changes: adminCsv.attachImportWarnings(req.params.type, preview.changes, proximityWarnings)
      .slice(0, 100)
      .map((c) => importChangeToResponse(c)),
  };
}));

app.post("/api/admin/masters/:type/import/apply", requireAdmin(async (req, reply) => {
  const config = MASTER_CONFIG[req.params.type];
  if (!config) return reply.code(404).send({ error: "マスタ種別が見つかりません" });
  const schema = z.object({
    previewId: z.string(),
    selectedChanges: z.array(z.object({
      id: z.string(),
      import: z.boolean(),
      data: z.record(z.any()).optional(),
    })).optional(),
  });
  const p = schema.safeParse(req.body);
  if (!p.success) return reply.code(400).send({ error: "入力が不正です" });
  const preview = importPreviews.get(p.data.previewId);
  if (!preview || preview.type !== req.params.type || preview.adminName !== req.adminName) {
    return reply.code(404).send({ error: "プレビューが見つかりません。再度プレビューしてください" });
  }
  if (Date.now() - preview.createdAt > 30 * 60 * 1000) {
    importPreviews.delete(p.data.previewId);
    return reply.code(410).send({ error: "プレビューの期限が切れました。再度プレビューしてください" });
  }
  const selected = adminCsv.prepareSelectedImportChanges(config, preview.changes, p.data.selectedChanges);
  if (selected.errors.length > 0) {
    return reply.code(400).send({ error: selected.errors.map((e) => e.error).join(", "), errors: selected.errors });
  }
  const targets = selected.changes.filter((c) => c.type === "insert" || c.changedFields.length > 0);
  const beforeRows = await prisma[config.model].findMany({
    where: { [config.idField]: { in: targets.map((c) => c.id) } },
  });
  await prisma.$transaction(async (tx) => {
    for (const change of targets) {
      await tx[config.model].upsert({
        where: { [config.idField]: change.id },
        update: buildMasterData(config, change.data, false),
        create: change.data,
      });
    }
  });
  importPreviews.delete(p.data.previewId);
  await audit(req.adminName, "import_master_csv", req.params.type, null, beforeRows, {
    applied: targets.map((c) => ({ id: c.id, type: c.type, changedFields: c.changedFields })),
  });
  return { ok: true, applied: targets.length };
}));

app.listen({ port: PORT, host: "127.0.0.1" })
  .then(() => app.log.info("Admin listening on " + PORT))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
