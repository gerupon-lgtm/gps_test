const path = require("path");
const crypto = require("crypto");
const Fastify = require("fastify");
const cookie = require("@fastify/cookie");
const { z } = require("zod");
const { prisma } = require("./db");

const PORT = Number(process.env.PORT || 3010);
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const COOKIE_SECRET = process.env.ADMIN_COOKIE_SECRET || process.env.SESSION_SECRET || "dev-admin-secret";
const SESSION_COOKIE = "admin_sid";
const sessions = new Map();

const app = Fastify({ logger: true });
app.register(cookie, { secret: COOKIE_SECRET });
app.register(require("@fastify/static"), {
  root: path.join(__dirname, "..", "public"),
  prefix: "/",
});

function requireAdmin(handler) {
  return async (req, reply) => {
    const sid = req.cookies && req.cookies[SESSION_COOKIE];
    const session = sid && sessions.get(sid);
    if (!session || session.expiresAt < Date.now()) {
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

app.get("/api/health", async () => ({ ok: true, time: new Date().toISOString() }));

app.post("/api/admin/login", async (req, reply) => {
  const schema = z.object({ loginId: z.string(), password: z.string() });
  const p = schema.safeParse(req.body);
  if (!p.success) return reply.code(400).send({ error: "入力が不正です" });
  if (!ADMIN_PASSWORD || p.data.loginId !== ADMIN_USER || p.data.password !== ADMIN_PASSWORD) {
    return reply.code(401).send({ error: "管理者IDまたはパスワードが違います" });
  }
  const sid = crypto.randomBytes(32).toString("hex");
  sessions.set(sid, { adminName: ADMIN_USER, expiresAt: Date.now() + 8 * 60 * 60 * 1000 });
  setAdminCookie(reply, sid);
  return { ok: true, adminName: ADMIN_USER };
});

app.post("/api/admin/logout", async (req, reply) => {
  const sid = req.cookies && req.cookies[SESSION_COOKIE];
  if (sid) sessions.delete(sid);
  reply.clearCookie(SESSION_COOKIE, { path: "/" });
  return { ok: true };
});

app.get("/api/admin/me", requireAdmin(async (req) => ({ ok: true, adminName: req.adminName })));

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

app.listen({ port: PORT, host: "127.0.0.1" })
  .then(() => app.log.info("Admin listening on " + PORT))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
