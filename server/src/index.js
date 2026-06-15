// =====================================================
// GPS連動ブラウザゲーム API(案A: Fastify + Prisma)
// サーバー権威型・DBトランザクションで整合性を担保
// =====================================================
const Fastify = require("fastify");
const cookie = require("@fastify/cookie");
const { z } = require("zod");
const { prisma } = require("./db");
const { hashPassword, verifyPassword } = require("./hash");

const PORT = Number(process.env.PORT || 3000);
const INVITE_CODE = process.env.INVITE_CODE || "friends-only";
const START_GOLD = Number(process.env.START_GOLD || 100);
const SESSION_DAYS = 30;

const app = Fastify({ logger: true });
app.register(cookie, { secret: process.env.SESSION_SECRET || "dev-secret" });

// ---- 認証ヘルパー ----
async function getPlayerFromReq(req) {
  const sid = req.cookies && req.cookies.sid;
  if (!sid) return null;
  const session = await prisma.session.findUnique({ where: { id: sid } });
  if (!session || session.expiresAt < new Date()) return null;
  return prisma.player.findUnique({ where: { userId: session.userId } });
}

function requireAuth(handler) {
  return async (req, reply) => {
    const player = await getPlayerFromReq(req);
    if (!player) return reply.code(401).send({ error: "認証が必要です" });
    req.player = player;
    return handler(req, reply);
  };
}

function setSessionCookie(reply, sid) {
  reply.setCookie("sid", sid, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

// ---- ヘルスチェック ----
app.get("/api/health", async () => ({ ok: true, time: new Date().toISOString() }));

// ---- 認証 ----
app.post("/api/auth/register", async (req, reply) => {
  const schema = z.object({
    loginId: z.string().min(3).max(40),
    password: z.string().min(8).max(200),
    name: z.string().min(1).max(40),
    inviteCode: z.string(),
  });
  const p = schema.safeParse(req.body);
  if (!p.success) return reply.code(400).send({ error: "入力が不正です", detail: p.error.issues });
  const { loginId, password, name, inviteCode } = p.data;
  if (inviteCode !== INVITE_CODE) return reply.code(403).send({ error: "招待コードが違います" });

  const exists = await prisma.user.findUnique({ where: { loginId } });
  if (exists) return reply.code(409).send({ error: "そのIDは使われています" });

  const user = await prisma.$transaction(async (tx) => {
    const u = await tx.user.create({
      data: { loginId, passwordHash: hashPassword(password) },
    });
    await tx.player.create({ data: { userId: u.id, name, gold: START_GOLD } });
    return u;
  });

  const session = await prisma.session.create({
    data: { userId: user.id, expiresAt: new Date(Date.now() + SESSION_DAYS * 864e5) },
  });
  setSessionCookie(reply, session.id);
  return { ok: true };
});

app.post("/api/auth/login", async (req, reply) => {
  const schema = z.object({ loginId: z.string(), password: z.string() });
  const p = schema.safeParse(req.body);
  if (!p.success) return reply.code(400).send({ error: "入力が不正です" });
  const user = await prisma.user.findUnique({ where: { loginId: p.data.loginId } });
  if (!user || !verifyPassword(p.data.password, user.passwordHash)) {
    return reply.code(401).send({ error: "IDまたはパスワードが違います" });
  }
  const session = await prisma.session.create({
    data: { userId: user.id, expiresAt: new Date(Date.now() + SESSION_DAYS * 864e5) },
  });
  setSessionCookie(reply, session.id);
  return { ok: true };
});

app.post("/api/auth/logout", async (req, reply) => {
  const sid = req.cookies && req.cookies.sid;
  if (sid) await prisma.session.deleteMany({ where: { id: sid } });
  reply.clearCookie("sid", { path: "/" });
  return { ok: true };
});

app.get("/api/me", requireAuth(async (req) => {
  const pl = req.player;
  return {
    id: pl.id, name: pl.name, level: pl.level, exp: pl.exp,
    hp: pl.hp, maxHp: pl.maxHp, attack: pl.attack, defense: pl.defense, gold: pl.gold,
    shareLocation: pl.shareLocation,
  };
}));

// ---- 位置報告(「近くのプレイヤー」用。非リアルタイム) ----
// プレイ中にクライアントが一定間隔で現在地を送る。サーバーは最終位置のみ保持。
app.post("/api/location", requireAuth(async (req, reply) => {
  const schema = z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  });
  const p = schema.safeParse(req.body);
  if (!p.success) return reply.code(400).send({ error: "緯度経度が不正です" });
  await prisma.player.update({
    where: { id: req.player.id },
    data: { lastLat: p.data.lat, lastLng: p.data.lng, lastSeenAt: new Date() },
  });
  return { ok: true };
}));

// 位置共有のオプトイン切替
app.post("/api/location/share", requireAuth(async (req, reply) => {
  const schema = z.object({ share: z.boolean() });
  const p = schema.safeParse(req.body);
  if (!p.success) return reply.code(400).send({ error: "入力が不正です" });
  await prisma.player.update({
    where: { id: req.player.id },
    data: { shareLocation: p.data.share },
  });
  return { ok: true, shareLocation: p.data.share };
}));

// ---- 在庫 ----
app.get("/api/inventory", requireAuth(async (req) => {
  const items = await prisma.playerItem.findMany({
    where: { playerId: req.player.id },
    include: { item: true },
  });
  return items.map((r) => ({ itemId: r.itemId, name: r.item.name, qty: r.qty, rarity: r.item.rarity }));
}));

// ---- マーケット ----
app.get("/api/market", async () => {
  const listings = await prisma.marketListing.findMany({
    where: { status: "open" },
    include: { item: true, seller: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
  return listings.map((l) => ({
    id: l.id, itemId: l.itemId, itemName: l.item.name,
    qty: l.qty, price: l.price, seller: l.seller.name, createdAt: l.createdAt,
  }));
});

// 出品(在庫をエスクローへ移す)
app.post("/api/market/list", requireAuth(async (req, reply) => {
  const schema = z.object({
    itemId: z.string(),
    qty: z.number().int().positive(),
    price: z.number().int().nonnegative(),
  });
  const p = schema.safeParse(req.body);
  if (!p.success) return reply.code(400).send({ error: "入力が不正です" });
  const { itemId, qty, price } = p.data;

  try {
    const listing = await prisma.$transaction(async (tx) => {
      const inv = await tx.playerItem.findUnique({
        where: { playerId_itemId: { playerId: req.player.id, itemId } },
      });
      if (!inv || inv.qty < qty) throw new Error("INSUFFICIENT_ITEM");
      if (inv.qty === qty) {
        await tx.playerItem.delete({ where: { id: inv.id } });
      } else {
        await tx.playerItem.update({ where: { id: inv.id }, data: { qty: inv.qty - qty } });
      }
      return tx.marketListing.create({
        data: { sellerId: req.player.id, itemId, qty, price, status: "open" },
      });
    });
    return { ok: true, listingId: listing.id };
  } catch (e) {
    if (e.message === "INSUFFICIENT_ITEM") return reply.code(400).send({ error: "在庫が足りません" });
    throw e;
  }
}));

// 購入(原子的に決済+受け渡し。行ロックで二重購入防止)
app.post("/api/market/buy", requireAuth(async (req, reply) => {
  const schema = z.object({ listingId: z.string() });
  const p = schema.safeParse(req.body);
  if (!p.success) return reply.code(400).send({ error: "入力が不正です" });
  const { listingId } = p.data;
  const buyerId = req.player.id;

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 行ロック(同時購入を直列化)
      const rows = await tx.$queryRaw`SELECT id, "sellerId", "itemId", qty, price, status
        FROM "MarketListing" WHERE id = ${listingId} FOR UPDATE`;
      const listing = rows[0];
      if (!listing) throw new Error("NOT_FOUND");
      if (listing.status !== "open") throw new Error("ALREADY_SOLD");
      if (listing.sellerId === buyerId) throw new Error("SELF_BUY");

      const buyer = await tx.player.findUnique({ where: { id: buyerId } });
      if (buyer.gold < listing.price) throw new Error("INSUFFICIENT_GOLD");

      // 決済
      await tx.player.update({ where: { id: buyerId }, data: { gold: { decrement: listing.price } } });
      await tx.player.update({ where: { id: listing.sellerId }, data: { gold: { increment: listing.price } } });

      // 受け渡し(買い手の在庫へ加算)
      const existing = await tx.playerItem.findUnique({
        where: { playerId_itemId: { playerId: buyerId, itemId: listing.itemId } },
      });
      if (existing) {
        await tx.playerItem.update({ where: { id: existing.id }, data: { qty: existing.qty + listing.qty } });
      } else {
        await tx.playerItem.create({ data: { playerId: buyerId, itemId: listing.itemId, qty: listing.qty } });
      }

      await tx.marketListing.update({
        where: { id: listingId },
        data: { status: "sold", buyerId, soldAt: new Date() },
      });
      return { itemId: listing.itemId, qty: listing.qty, price: listing.price };
    });
    return { ok: true, ...result };
  } catch (e) {
    const map = {
      NOT_FOUND: [404, "出品が見つかりません"],
      ALREADY_SOLD: [409, "すでに売却/取消済みです"],
      SELF_BUY: [400, "自分の出品は買えません"],
      INSUFFICIENT_GOLD: [400, "所持金が足りません"],
    };
    const m = map[e.message];
    if (m) return reply.code(m[0]).send({ error: m[1] });
    throw e;
  }
}));

// 出品取消(在庫を戻す)
app.post("/api/market/cancel", requireAuth(async (req, reply) => {
  const schema = z.object({ listingId: z.string() });
  const p = schema.safeParse(req.body);
  if (!p.success) return reply.code(400).send({ error: "入力が不正です" });
  const { listingId } = p.data;

  try {
    await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw`SELECT id, "sellerId", "itemId", qty, status
        FROM "MarketListing" WHERE id = ${listingId} FOR UPDATE`;
      const listing = rows[0];
      if (!listing) throw new Error("NOT_FOUND");
      if (listing.sellerId !== req.player.id) throw new Error("NOT_OWNER");
      if (listing.status !== "open") throw new Error("NOT_OPEN");

      const existing = await tx.playerItem.findUnique({
        where: { playerId_itemId: { playerId: listing.sellerId, itemId: listing.itemId } },
      });
      if (existing) {
        await tx.playerItem.update({ where: { id: existing.id }, data: { qty: existing.qty + listing.qty } });
      } else {
        await tx.playerItem.create({ data: { playerId: listing.sellerId, itemId: listing.itemId, qty: listing.qty } });
      }
      await tx.marketListing.update({ where: { id: listingId }, data: { status: "cancelled" } });
    });
    return { ok: true };
  } catch (e) {
    const map = {
      NOT_FOUND: [404, "出品が見つかりません"],
      NOT_OWNER: [403, "自分の出品ではありません"],
      NOT_OPEN: [409, "取消できない状態です"],
    };
    const m = map[e.message];
    if (m) return reply.code(m[0]).send({ error: m[1] });
    throw e;
  }
}));

app.listen({ port: PORT, host: "127.0.0.1" })
  .then(() => app.log.info("API listening on " + PORT))
  .catch((err) => { app.log.error(err); process.exit(1); });
