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
const VICTORY_COOLDOWN_MIN = Number(process.env.VICTORY_COOLDOWN_MIN || 60); // 勝利後に敵が再出現しない時間(分)
const DEFEAT_HEAL_PERCENT = Number(process.env.DEFEAT_HEAL_PERCENT || 0.3); // 敗北クールダウン後に回復するMAX割合
const BATTLE_USE_RANDOM = String(process.env.BATTLE_USE_RANDOM || "false").toLowerCase() === "true";
const BATTLE_RANDOM_RANGE = Number(process.env.BATTLE_RANDOM_RANGE || 0.2);
const MAX_TURNS = 500; // 戦闘の安全上限
const BONUS_RANGE = Number(process.env.BONUS_RANGE || 0.2);        // EXP/ゴールドの乱数幅(±)
const LEVEL_EXP_FACTOR = Number(process.env.LEVEL_EXP_FACTOR || 100); // 次Lv必要EXP = level×factor
const LV_HP = Number(process.env.LV_HP || 10);
const LV_ATK = Number(process.env.LV_ATK || 2);
const LV_DEF = Number(process.env.LV_DEF || 1);
const POISON_INTERVAL_SEC = Number(process.env.POISON_INTERVAL_SEC || 30); // 毒ダメージ間隔(秒)
const POISON_DMG = Number(process.env.POISON_DMG || 1);                    // 毒の1tickダメージ
const ANTIDOTE_BOOST = Number(process.env.ANTIDOTE_BOOST || 2);            // 毒中の散策antidoteブースト
const DOWNED_MIN = Number(process.env.DOWNED_MIN || 1);                    // 戦闘不能の継続(分)
const PICKUP_BASE_RATE = Number(process.env.PICKUP_BASE_RATE || 0.03);     // 散策拾いの基本確率
const PICKUP_COOLDOWN_MIN = Number(process.env.PICKUP_COOLDOWN_MIN || 5);  // 散策拾いのクールダウン(分)
const SELL_RATE = Number(process.env.SELL_RATE || 0.5);                    // 道具屋の売値(basePrice比)
const INN_COST_PER_LEVEL = Number(process.env.INN_COST_PER_LEVEL || 5);    // 宿泊費 = level × これ
const REPEAT_REWARD_FACTOR = Number(process.env.REPEAT_REWARD_FACTOR || 0.3); // 撃破済み再戦の報酬倍率(EXP/ドロップ率)

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

async function generateTitlesForDefeated(defeatedSpots, db = prisma) {
  const defeated = new Set((defeatedSpots || "").split(",").filter(Boolean));
  if (defeated.size === 0) return [];

  const [spots, areas] = await Promise.all([
    db.spotMaster.findMany({
      where: { active: true },
      select: { spotId: true, areaKey: true },
    }),
    db.postalAreaMaster.findMany({
      select: { areaKey: true, regionName: true },
    }),
  ]);

  const areaMap = new Map(areas.map((a) => [a.areaKey, a.regionName]));
  const byArea = new Map();
  let uncategorizedCleared = 0;

  for (const spot of spots) {
    const knownArea = spot.areaKey && areaMap.has(spot.areaKey);
    if (!knownArea) {
      if (defeated.has(spot.spotId)) uncategorizedCleared++;
      continue;
    }
    if (!byArea.has(spot.areaKey)) byArea.set(spot.areaKey, []);
    byArea.get(spot.areaKey).push(spot.spotId);
  }

  const titles = [];
  for (const [areaKey, spotIds] of byArea.entries()) {
    if (spotIds.length > 0 && spotIds.every((id) => defeated.has(id))) {
      const regionName = areaMap.get(areaKey);
      if (regionName) titles.push(`${regionName}の探索者`);
    }
  }
  if (uncategorizedCleared >= 5) titles.push("開拓者");
  return titles;
}

async function generateTitles(player) {
  return generateTitlesForDefeated(player.defeatedSpots);
}

app.get("/api/me", requireAuth(async (req) => {
  let pl = req.player;
  const st = refreshPlayerState(pl);
  if (stateChanged(pl, st)) {
    pl = await prisma.player.update({ where: { id: pl.id }, data: { hp: st.hp, healAt: st.healAt, downedUntil: st.downedUntil, poisoned: st.poisoned, poisonTickAt: st.poisonTickAt } });
  }
  const titles = await generateTitles(pl);
  return {
    id: pl.id, name: pl.name, level: pl.level, exp: pl.exp,
    hp: pl.hp, maxHp: pl.maxHp, attack: pl.attack, defense: pl.defense, gold: pl.gold,
    shareLocation: pl.shareLocation, healAt: pl.healAt, downedUntil: pl.downedUntil, poisoned: pl.poisoned,
    nextExp: pl.level * LEVEL_EXP_FACTOR, innCostPerLevel: INN_COST_PER_LEVEL, titles,
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
  const player = req.player;
  await prisma.player.update({
    where: { id: player.id },
    data: { lastLat: p.data.lat, lastLng: p.data.lng, lastSeenAt: new Date() },
  });

  // 散策中の取得抽選(戦闘不能中は対象外 / クールダウンあり / 毒中はantidoteブースト)
  let pickup = null;
  const downed = player.downedUntil && new Date(player.downedUntil) > new Date();
  const cooled = !player.lastPickupAt || (Date.now() - new Date(player.lastPickupAt).getTime()) >= PICKUP_COOLDOWN_MIN * 60000;
  if (!downed && cooled && Math.random() < PICKUP_BASE_RATE) {
    const pool = await prisma.itemMaster.findMany({ where: { OR: [{ category: "heal" }, { category: "antidote" }] } });
    if (pool.length) {
      const weighted = [];
      for (const it of pool) {
        const w = (it.category === "antidote" && player.poisoned) ? ANTIDOTE_BOOST : 1;
        for (let i = 0; i < w; i++) weighted.push(it);
      }
      const chosen = weighted[Math.floor(Math.random() * weighted.length)];
      await prisma.$transaction(async (tx) => {
        const inv = await tx.playerItem.findUnique({ where: { playerId_itemId: { playerId: player.id, itemId: chosen.itemId } } });
        if (inv) await tx.playerItem.update({ where: { id: inv.id }, data: { qty: inv.qty + 1 } });
        else await tx.playerItem.create({ data: { playerId: player.id, itemId: chosen.itemId, qty: 1 } });
        await tx.player.update({ where: { id: player.id }, data: { lastPickupAt: new Date() } });
      });
      pickup = { itemId: chosen.itemId, name: chosen.name };
    }
  }
  return { ok: true, pickup };
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

// =====================================================
// HP回復・戦闘(サーバー権威)
// =====================================================

// 敗北クールダウン後の少量回復を「遅延適用」する純関数(書き込みはしない)
function computeMaturedHeal(player) {
  let hp = player.hp;
  let healAt = player.healAt;
  if (healAt && new Date(healAt) <= new Date()) {
    const amount = Math.max(1, Math.round(player.maxHp * DEFEAT_HEAL_PERCENT));
    hp = Math.min(player.maxHp, hp + amount);
    healAt = null;
  }
  return { hp, healAt };
}

// 回復(敗北明け)+毒の遅延ダメージをまとめて適用する純関数(書き込みはしない)
function refreshPlayerState(player) {
  let { hp, healAt } = computeMaturedHeal(player);
  let downedUntil = player.downedUntil;
  // 戦闘不能のクールダウン明け: MAXの一定%まで回復して復帰
  if (downedUntil && new Date(downedUntil) <= new Date()) {
    hp = Math.max(hp, Math.round(player.maxHp * DEFEAT_HEAL_PERCENT));
    downedUntil = null;
  }
  let poisoned = player.poisoned;
  let poisonTickAt = player.poisonTickAt;
  if (poisoned && poisonTickAt) {
    const base = new Date(poisonTickAt).getTime();
    const ticks = Math.floor((Date.now() - base) / (POISON_INTERVAL_SEC * 1000));
    if (ticks > 0) {
      hp = Math.max(1, hp - ticks * POISON_DMG); // 毒では最低HP1
      poisonTickAt = new Date(base + ticks * POISON_INTERVAL_SEC * 1000);
    }
  }
  return { hp, healAt, downedUntil, poisoned, poisonTickAt };
}

function stateChanged(player, st) {
  return st.hp !== player.hp || String(st.healAt) !== String(player.healAt) ||
    String(st.downedUntil) !== String(player.downedUntil) ||
    st.poisoned !== player.poisoned || String(st.poisonTickAt) !== String(player.poisonTickAt);
}

function computeDamage(attack, defense) {
  let base = Math.max(1, attack - defense);
  if (BATTLE_USE_RANDOM) {
    const r = 1 + (Math.random() * 2 - 1) * BATTLE_RANDOM_RANGE;
    base = Math.max(1, Math.round(base * r));
  }
  return base;
}

// 永続HPから決定論(または乱数)で全ターンを計算。1ターン=プレイヤー攻撃→(敵生存なら)敵攻撃。
function simulateBattle(startHp, player, enemy) {
  let php = startHp;
  let ehp = enemy.hp;
  const turns = [];
  let result = null;
  for (let t = 0; t < MAX_TURNS; t++) {
    const logs = [];
    const d1 = computeDamage(player.attack, enemy.defense);
    ehp = Math.max(0, ehp - d1);
    logs.push("プレイヤーの攻撃! " + enemy.name + "に" + d1 + "ダメージ");
    if (ehp <= 0) {
      result = "win"; logs.push("勝利!");
      turns.push({ logs, playerHp: php, enemyHp: ehp });
      break;
    }
    const d2 = computeDamage(enemy.attack, player.defense);
    php = Math.max(0, php - d2);
    logs.push(enemy.name + "の攻撃! プレイヤーに" + d2 + "ダメージ");
    if (php <= 0) {
      result = "lose"; logs.push("敗北...");
      turns.push({ logs, playerHp: php, enemyHp: ehp });
      break;
    }
    turns.push({ logs, playerHp: php, enemyHp: ehp });
  }
  if (!result) result = ehp <= php ? "win" : "lose"; // 膠着時のフォールバック
  return { result, turns, finalPlayerHp: php, finalEnemyHp: ehp };
}

// 戦闘(サーバー権威)。クールダウン検証→計算→報酬/ペナルティ/HPを原子的に更新。
app.post("/api/battle", requireAuth(async (req, reply) => {
  const schema = z.object({ spotId: z.string() });
  const p = schema.safeParse(req.body);
  if (!p.success) return reply.code(400).send({ error: "入力が不正です" });
  const { spotId } = p.data;
  const playerId = req.player.id;

  try {
    const out = await prisma.$transaction(async (tx) => {
      const spot = await tx.spotMaster.findUnique({ where: { spotId }, include: { enemy: true } });
      if (!spot) throw new Error("SPOT_NOT_FOUND");
      if (!spot.active) throw new Error("SPOT_INACTIVE");

      const state = await tx.playerSpotState.findUnique({
        where: { playerId_spotId: { playerId, spotId } },
      });
      const now = new Date();
      if (state && state.penaltyUntil && state.penaltyUntil > now) throw new Error("PENALTY_ACTIVE");
      if (state && state.victoryUntil && state.victoryUntil > now) throw new Error("VICTORY_COOLDOWN");

      const player = await tx.player.findUnique({ where: { id: playerId } });
      const healed = computeMaturedHeal(player);
      const startHp = healed.hp;

      const sim = simulateBattle(startHp, player, spot.enemy);

      let reward = null;
      let victoryUntil = null;
      let penaltyUntil = null;
      let newHealAt = healed.healAt;

      if (sim.result === "win") {
        victoryUntil = new Date(now.getTime() + VICTORY_COOLDOWN_MIN * 60000);
        await tx.playerSpotState.upsert({
          where: { playerId_spotId: { playerId, spotId } },
          update: { victoryUntil, penaltyUntil: null },
          create: { playerId, spotId, victoryUntil },
        });
        const item = await tx.itemMaster.findUnique({ where: { itemId: spot.rewardItemId } });
        if (item) {
          const inv = await tx.playerItem.findUnique({
            where: { playerId_itemId: { playerId, itemId: item.itemId } },
          });
          if (inv) await tx.playerItem.update({ where: { id: inv.id }, data: { qty: inv.qty + 1 } });
          else await tx.playerItem.create({ data: { playerId, itemId: item.itemId, qty: 1 } });
          reward = { itemId: item.itemId, name: item.name, rarity: item.rarity };
        }
      } else {
        penaltyUntil = new Date(now.getTime() + spot.penaltyMin * 60000);
        // 敗北クールダウン後に少量回復を予約
        newHealAt = penaltyUntil;
        await tx.playerSpotState.upsert({
          where: { playerId_spotId: { playerId, spotId } },
          update: { penaltyUntil },
          create: { playerId, spotId, penaltyUntil },
        });
      }

      await tx.player.update({
        where: { id: playerId },
        data: { hp: sim.finalPlayerHp, healAt: newHealAt },
      });
      await tx.battleLog.create({
        data: { playerId, enemyId: spot.enemyId, spotId, result: sim.result },
      });

      return {
        result: sim.result,
        enemyName: spot.enemy.name,
        enemyMaxHp: spot.enemy.hp,
        playerMaxHp: player.maxHp,
        startPlayerHp: startHp,
        turns: sim.turns,
        finalPlayerHp: sim.finalPlayerHp,
        reward,
        victoryUntil,
        penaltyUntil,
        healAt: newHealAt,
        cooldownMin: sim.result === "win" ? VICTORY_COOLDOWN_MIN : spot.penaltyMin,
      };
    });
    return { ok: true, ...out };
  } catch (e) {
    const map = {
      SPOT_NOT_FOUND: [404, "スポットが見つかりません"],
      SPOT_INACTIVE: [400, "このスポットは現在利用できません"],
      PENALTY_ACTIVE: [409, "敗北ペナルティ中です"],
      VICTORY_COOLDOWN: [409, "この敵は再出現待ちです"],
    };
    const m = map[e.message];
    if (m) return reply.code(m[0]).send({ error: m[1] });
    throw e;
  }
}));

// アイテム使用(回復アイテムのみ。1個消費してHP回復)
app.post("/api/item/use", requireAuth(async (req, reply) => {
  const schema = z.object({ itemId: z.string() });
  const p = schema.safeParse(req.body);
  if (!p.success) return reply.code(400).send({ error: "入力が不正です" });
  const { itemId } = p.data;
  const playerId = req.player.id;

  try {
    const out = await prisma.$transaction(async (tx) => {
      const item = await tx.itemMaster.findUnique({ where: { itemId } });
      if (!item || (item.healAmount <= 0 && !item.curePoison)) throw new Error("NOT_USABLE");
      const inv = await tx.playerItem.findUnique({
        where: { playerId_itemId: { playerId, itemId } },
      });
      if (!inv || inv.qty < 1) throw new Error("NOT_OWNED");

      const player = await tx.player.findUnique({ where: { id: playerId } });
      const st = refreshPlayerState(player);
      let hp = st.hp, poisoned = st.poisoned, poisonTickAt = st.poisonTickAt;
      const msgs = [];
      let used = false;
      if (item.curePoison && poisoned) { poisoned = false; poisonTickAt = null; msgs.push("毒が消えた"); used = true; }
      if (item.healAmount > 0 && hp < player.maxHp) { const b = hp; hp = Math.min(player.maxHp, hp + item.healAmount); msgs.push("HP+" + (hp - b)); used = true; }
      if (!used) throw new Error("NOTHING_TO_DO");

      if (inv.qty === 1) await tx.playerItem.delete({ where: { id: inv.id } });
      else await tx.playerItem.update({ where: { id: inv.id }, data: { qty: inv.qty - 1 } });
      await tx.player.update({ where: { id: playerId }, data: { hp, healAt: st.healAt, downedUntil: st.downedUntil, poisoned, poisonTickAt } });

      return { hp, maxHp: player.maxHp, poisoned, itemName: item.name, message: item.name + "を使った(" + msgs.join("、") + ")" };
    });
    return { ok: true, ...out };
  } catch (e) {
    const map = {
      NOT_USABLE: [400, "使えないアイテムです"],
      NOT_OWNED: [400, "そのアイテムを持っていません"],
      NOTHING_TO_DO: [400, "今は使う必要がありません"],
    };
    const m = map[e.message];
    if (m) return reply.code(m[0]).send({ error: m[1] });
    throw e;
  }
}));

// 宿屋で休む(全回復)。位置偽装対策はしない方針のため innId を信頼(クライアントが近接判定)。
app.post("/api/inn/rest", requireAuth(async (req, reply) => {
  const schema = z.object({ innId: z.string() });
  const p = schema.safeParse(req.body);
  if (!p.success) return reply.code(400).send({ error: "入力が不正です" });
  const inn = await prisma.innMaster.findUnique({ where: { innId: p.data.innId } });
  if (!inn) return reply.code(404).send({ error: "宿屋が見つかりません" });
  const cost = req.player.level * INN_COST_PER_LEVEL;
  if (req.player.gold < cost) return reply.code(400).send({ error: "ゴールドが足りません(必要 " + cost + "G)" });
  const pl = await prisma.player.update({
    where: { id: req.player.id },
    data: { hp: req.player.maxHp, healAt: null, downedUntil: null, poisoned: false, poisonTickAt: null, gold: req.player.gold - cost },
  });
  return { ok: true, hp: pl.hp, maxHp: pl.maxHp, gold: pl.gold, cost, innName: inn.name };
}));

// スポット状態(プレイヤー別クールダウン)
app.get("/api/spot-states", requireAuth(async (req) => {
  const states = await prisma.playerSpotState.findMany({ where: { playerId: req.player.id } });
  return states.map((s) => ({ spotId: s.spotId, penaltyUntil: s.penaltyUntil, victoryUntil: s.victoryUntil }));
}));

// 撃破済みスポットID一覧(ユーザー単位・1レコード)
app.get("/api/defeated-spots", requireAuth(async (req) => {
  return (req.player.defeatedSpots || "").split(",").filter(Boolean);
}));

// 近くのプレイヤー一覧(位置共有者・全員。距離はクライアントで計算)
app.get("/api/players/nearby", requireAuth(async (req) => {
  const players = await prisma.player.findMany({
    where: { id: { not: req.player.id }, lastLat: { not: null }, lastLng: { not: null } },
    select: { name: true, level: true, lastLat: true, lastLng: true, lastSeenAt: true },
    orderBy: { lastSeenAt: "desc" },
    take: 200,
  });
  return players.map((p) => ({ name: p.name, level: p.level, lat: p.lastLat, lng: p.lastLng, lastSeenAt: p.lastSeenAt }));
}));

// 宿屋マスタ一覧
app.get("/api/inns", async () => {
  const inns = await prisma.innMaster.findMany();
  return inns.map((n) => ({ innId: n.innId, name: n.name, lat: n.lat, lng: n.lng, radiusM: n.radiusM }));
});

// 道具屋マスタ一覧
app.get("/api/shops", async () => {
  const shops = await prisma.shopMaster.findMany();
  return shops.map((sh) => ({ shopId: sh.shopId, name: sh.name, lat: sh.lat, lng: sh.lng, radiusM: sh.radiusM }));
});

// 道具屋で買える商品(回復系のみ・在庫無限)
app.get("/api/shop/items", async () => {
  const items = await prisma.itemMaster.findMany({ where: { OR: [{ category: "heal" }, { category: "antidote" }] } });
  return items.map((it) => ({ itemId: it.itemId, name: it.name, price: it.basePrice, healAmount: it.healAmount, curePoison: it.curePoison }));
});

// 購入(ゴールド消費)
app.post("/api/shop/buy", requireAuth(async (req, reply) => {
  const schema = z.object({ shopId: z.string(), itemId: z.string(), qty: z.number().int().positive().max(99) });
  const p = schema.safeParse(req.body);
  if (!p.success) return reply.code(400).send({ error: "入力が不正です" });
  const { shopId, itemId, qty } = p.data;
  try {
    const out = await prisma.$transaction(async (tx) => {
      const shop = await tx.shopMaster.findUnique({ where: { shopId } });
      if (!shop) throw new Error("SHOP_NOT_FOUND");
      const item = await tx.itemMaster.findUnique({ where: { itemId } });
      if (!item || (item.category !== "heal" && item.category !== "antidote")) throw new Error("NOT_BUYABLE");
      const cost = item.basePrice * qty;
      const player = await tx.player.findUnique({ where: { id: req.player.id } });
      if (player.gold < cost) throw new Error("INSUFFICIENT_GOLD");
      await tx.player.update({ where: { id: player.id }, data: { gold: player.gold - cost } });
      const inv = await tx.playerItem.findUnique({ where: { playerId_itemId: { playerId: player.id, itemId } } });
      if (inv) await tx.playerItem.update({ where: { id: inv.id }, data: { qty: inv.qty + qty } });
      else await tx.playerItem.create({ data: { playerId: player.id, itemId, qty } });
      return { gold: player.gold - cost, itemName: item.name, qty };
    });
    return { ok: true, ...out };
  } catch (e) {
    const map = { SHOP_NOT_FOUND: [404, "道具屋が見つかりません"], NOT_BUYABLE: [400, "買えない商品です"], INSUFFICIENT_GOLD: [400, "所持金が足りません"] };
    const m = map[e.message];
    if (m) return reply.code(m[0]).send({ error: m[1] });
    throw e;
  }
}));

// 売却(ゴールド入手)
app.post("/api/shop/sell", requireAuth(async (req, reply) => {
  const schema = z.object({ itemId: z.string(), qty: z.number().int().positive().max(99) });
  const p = schema.safeParse(req.body);
  if (!p.success) return reply.code(400).send({ error: "入力が不正です" });
  const { itemId, qty } = p.data;
  try {
    const out = await prisma.$transaction(async (tx) => {
      const item = await tx.itemMaster.findUnique({ where: { itemId } });
      if (!item || !item.sellable) throw new Error("NOT_SELLABLE");
      const inv = await tx.playerItem.findUnique({ where: { playerId_itemId: { playerId: req.player.id, itemId } } });
      if (!inv || inv.qty < qty) throw new Error("NOT_ENOUGH");
      const gain = Math.floor(item.basePrice * SELL_RATE) * qty;
      if (inv.qty === qty) await tx.playerItem.delete({ where: { id: inv.id } });
      else await tx.playerItem.update({ where: { id: inv.id }, data: { qty: inv.qty - qty } });
      const player = await tx.player.update({ where: { id: req.player.id }, data: { gold: { increment: gain } } });
      return { gold: player.gold, gain, itemName: item.name, qty };
    });
    return { ok: true, ...out };
  } catch (e) {
    const map = { NOT_SELLABLE: [400, "売れないアイテムです"], NOT_ENOUGH: [400, "所持数が足りません"] };
    const m = map[e.message];
    if (m) return reply.code(m[0]).send({ error: m[1] });
    throw e;
  }
}));

// =====================================================
// ターン制戦闘(サーバー権威 / Phase B)
// =====================================================
function randBonus(base) {
  const r = 1 + (Math.random() * 2 - 1) * BONUS_RANGE;
  return Math.max(0, Math.round(base * r));
}

// 経験値を加算してレベルアップを反映(必要EXPを消費)。返り値に新ステータス。
function applyLevelUps(exp, level, maxHp, attack, defense) {
  let leveledUp = false;
  while (exp >= level * LEVEL_EXP_FACTOR) {
    exp -= level * LEVEL_EXP_FACTOR;
    level += 1; maxHp += LV_HP; attack += LV_ATK; defense += LV_DEF;
    leveledUp = true;
  }
  return { exp, level, maxHp, attack, defense, leveledUp };
}

// 勝利確定: EXP/ゴールド/レベル/報酬/クールダウンを原子的に反映。currentHp=戦闘終了時のHP。
async function finalizeWin(tx, player, currentHp, spot, enemy) {
  // 撃破済み(再戦)か判定。2回目以降は EXP/ドロップ減・固定報酬なし。
  const defeatedArr = (player.defeatedSpots || "").split(",").filter(Boolean);
  const isRepeat = defeatedArr.includes(spot.spotId);
  const beforeTitles = await generateTitlesForDefeated(player.defeatedSpots, tx);
  let expGain = randBonus(enemy.expBase);
  const goldGain = randBonus(enemy.goldBase);
  if (isRepeat) expGain = Math.round(expGain * REPEAT_REWARD_FACTOR);
  const lv = applyLevelUps(player.exp + expGain, player.level, player.maxHp, player.attack, player.defense);
  // 報酬: 初回はスポット固定 + 敵確率ドロップ。再戦は固定なし・ドロップ率減。
  const rewardIds = [];
  if (!isRepeat && spot.rewardItemId) rewardIds.push(spot.rewardItemId);
  const dropRate = isRepeat ? enemy.dropRate * REPEAT_REWARD_FACTOR : enemy.dropRate;
  if (enemy.dropItemId && Math.random() < dropRate) rewardIds.push(enemy.dropItemId);
  const rewards = [];
  for (const itemId of rewardIds) {
    const item = await tx.itemMaster.findUnique({ where: { itemId } });
    if (!item) continue;
    const inv = await tx.playerItem.findUnique({ where: { playerId_itemId: { playerId: player.id, itemId } } });
    if (inv) await tx.playerItem.update({ where: { id: inv.id }, data: { qty: inv.qty + 1 } });
    else await tx.playerItem.create({ data: { playerId: player.id, itemId, qty: 1 } });
    rewards.push({ itemId, name: item.name, rarity: item.rarity });
  }
  const victoryUntil = new Date(Date.now() + VICTORY_COOLDOWN_MIN * 60000);
  await tx.playerSpotState.upsert({
    where: { playerId_spotId: { playerId: player.id, spotId: spot.spotId } },
    update: { victoryUntil, penaltyUntil: null },
    create: { playerId: player.id, spotId: spot.spotId, victoryUntil },
  });
  const hp = lv.leveledUp ? lv.maxHp : currentHp; // レベルアップ時のみ全回復
  const newDefeated = isRepeat ? player.defeatedSpots : defeatedArr.concat(spot.spotId).join(",");
  const afterTitles = await generateTitlesForDefeated(newDefeated, tx);
  const beforeTitleSet = new Set(beforeTitles);
  const newTitles = afterTitles.filter((title) => !beforeTitleSet.has(title));
  await tx.player.update({
    where: { id: player.id },
    data: { exp: lv.exp, level: lv.level, maxHp: lv.maxHp, attack: lv.attack, defense: lv.defense, hp, gold: player.gold + goldGain, defeatedSpots: newDefeated },
  });
  await tx.battleLog.create({ data: { playerId: player.id, enemyId: enemy.enemyId, spotId: spot.spotId, result: "win" } });
  return {
    expGain, goldGain, leveledUp: lv.leveledUp, level: lv.level, nextExp: lv.level * LEVEL_EXP_FACTOR,
    gold: player.gold + goldGain, hp, maxHp: lv.maxHp, attack: lv.attack, defense: lv.defense, rewards, victoryUntil, repeat: isRepeat, newTitles,
  };
}

// 戦闘開始
app.post("/api/battle/start", requireAuth(async (req, reply) => {
  const schema = z.object({ spotId: z.string() });
  const p = schema.safeParse(req.body);
  if (!p.success) return reply.code(400).send({ error: "入力が不正です" });
  const playerId = req.player.id;

  // 入室時に回復(敗北明け)/毒を反映
  const stIn = refreshPlayerState(req.player);
  if (stateChanged(req.player, stIn)) {
    req.player = await prisma.player.update({ where: { id: playerId }, data: { hp: stIn.hp, healAt: stIn.healAt, downedUntil: stIn.downedUntil, poisoned: stIn.poisoned, poisonTickAt: stIn.poisonTickAt } });
  }

  if (req.player.downedUntil && new Date(req.player.downedUntil) > new Date()) {
    return reply.code(409).send({ error: "戦闘不能中です", downedUntil: req.player.downedUntil });
  }

  const existing = await prisma.battleSession.findUnique({ where: { playerId } });
  if (existing && existing.status === "active") {
    const en = await prisma.enemyMaster.findUnique({ where: { enemyId: existing.enemyId } });
    return {
      ok: true, resumed: true, sessionId: existing.id, spotId: existing.spotId,
      enemy: { id: en.enemyId, name: en.name, maxHp: en.hp, image: en.image },
      enemyHp: existing.enemyHp, playerHp: req.player.hp, playerMaxHp: req.player.maxHp, poisoned: req.player.poisoned,
    };
  }

  try {
    const out = await prisma.$transaction(async (tx) => {
      const spot = await tx.spotMaster.findUnique({ where: { spotId: p.data.spotId }, include: { enemy: true } });
      if (!spot) throw new Error("SPOT_NOT_FOUND");
      if (!spot.active) throw new Error("SPOT_INACTIVE");
      const state = await tx.playerSpotState.findUnique({ where: { playerId_spotId: { playerId, spotId: spot.spotId } } });
      const now = new Date();
      if (state && state.penaltyUntil && state.penaltyUntil > now) throw new Error("PENALTY_ACTIVE");
      if (state && state.victoryUntil && state.victoryUntil > now) throw new Error("VICTORY_COOLDOWN");
      if (existing) await tx.battleSession.delete({ where: { playerId } }); // 古い非activeを掃除
      const session = await tx.battleSession.create({
        data: { playerId, spotId: spot.spotId, enemyId: spot.enemyId, enemyHp: spot.enemy.hp },
      });
      return { session, enemy: spot.enemy };
    });
    return {
      ok: true, sessionId: out.session.id, spotId: out.session.spotId,
      enemy: { id: out.enemy.enemyId, name: out.enemy.name, maxHp: out.enemy.hp, image: out.enemy.image },
      enemyHp: out.enemy.hp, playerHp: req.player.hp, playerMaxHp: req.player.maxHp, poisoned: req.player.poisoned,
    };
  } catch (e) {
    const map = {
      SPOT_NOT_FOUND: [404, "スポットが見つかりません"],
      SPOT_INACTIVE: [400, "このスポットは現在利用できません"],
      PENALTY_ACTIVE: [409, "敗北ペナルティ中です"],
      VICTORY_COOLDOWN: [409, "この敵は再出現待ちです"],
    };
    const m = map[e.message];
    if (m) return reply.code(m[0]).send({ error: m[1] });
    throw e;
  }
}));

// 戦闘の1アクション(attack / useItem)。1アクション=1ターン。
app.post("/api/battle/action", requireAuth(async (req, reply) => {
  const schema = z.object({ action: z.enum(["attack", "useItem"]), itemId: z.string().optional() });
  const p = schema.safeParse(req.body);
  if (!p.success) return reply.code(400).send({ error: "入力が不正です" });
  const playerId = req.player.id;

  try {
    const out = await prisma.$transaction(async (tx) => {
      const session = await tx.battleSession.findUnique({ where: { playerId } });
      if (!session || session.status !== "active") throw new Error("NO_BATTLE");
      const spot = await tx.spotMaster.findUnique({ where: { spotId: session.spotId }, include: { enemy: true } });
      const enemy = spot.enemy;
      const player = await tx.player.findUnique({ where: { id: playerId } });
      const st0 = refreshPlayerState(player);
      let php = st0.hp;
      let poisoned = st0.poisoned;
      let poisonTickAt = st0.poisonTickAt;
      const healAt0 = st0.healAt;
      let ehp = session.enemyHp;
      const logs = [];

      if (p.data.action === "useItem") {
        if (!p.data.itemId) throw new Error("NO_ITEM");
        const item = await tx.itemMaster.findUnique({ where: { itemId: p.data.itemId } });
        if (!item || (item.healAmount <= 0 && !item.curePoison)) throw new Error("NOT_USABLE");
        const inv = await tx.playerItem.findUnique({ where: { playerId_itemId: { playerId, itemId: item.itemId } } });
        if (!inv || inv.qty < 1) throw new Error("NOT_OWNED");
        const msgs = [];
        let used = false;
        if (item.curePoison && poisoned) { poisoned = false; poisonTickAt = null; msgs.push("毒が消えた"); used = true; }
        if (item.healAmount > 0 && php < player.maxHp) { const before = php; php = Math.min(player.maxHp, php + item.healAmount); msgs.push("HP+" + (php - before)); used = true; }
        if (!used) throw new Error("NOTHING_TO_DO");
        if (inv.qty === 1) await tx.playerItem.delete({ where: { id: inv.id } });
        else await tx.playerItem.update({ where: { id: inv.id }, data: { qty: inv.qty - 1 } });
        logs.push(item.name + "を使った(" + msgs.join("、") + ")");
      } else {
        const d1 = computeDamage(player.attack, enemy.defense);
        ehp = Math.max(0, ehp - d1);
        logs.push("プレイヤーの攻撃! " + enemy.name + "に" + d1 + "ダメージ");
      }

      // 敵撃破=勝利
      if (ehp <= 0) {
        logs.push("勝利!");
        const win = await finalizeWin(tx, player, php, spot, enemy);
        await tx.player.update({ where: { id: playerId }, data: { poisoned, poisonTickAt, healAt: healAt0 } });
        await tx.battleSession.delete({ where: { playerId } });
        return { finished: true, result: "win", logs, playerHp: win.hp, enemyHp: 0, poisoned, win };
      }

      // 敵の反撃
      const d2 = computeDamage(enemy.attack, player.defense);
      php = Math.max(0, php - d2);
      logs.push(enemy.name + "の攻撃! プレイヤーに" + d2 + "ダメージ");
      if (!poisoned && enemy.poisonChance > 0 && Math.random() < enemy.poisonChance) {
        poisoned = true; poisonTickAt = new Date();
        logs.push("毒におかされた!");
      }

      if (php <= 0) {
        // 敗北 → 戦闘不能(グローバル)
        const downedUntil = new Date(Date.now() + DOWNED_MIN * 60000);
        await tx.player.update({ where: { id: playerId }, data: { hp: 0, downedUntil, poisoned, poisonTickAt } });
        await tx.battleLog.create({ data: { playerId, enemyId: enemy.enemyId, spotId: spot.spotId, result: "lose" } });
        await tx.battleSession.delete({ where: { playerId } });
        logs.push("敗北... 戦闘不能になった");
        return { finished: true, result: "lose", logs, playerHp: 0, enemyHp: ehp, poisoned, downedUntil };
      }

      // 継続
      await tx.player.update({ where: { id: playerId }, data: { hp: php, healAt: healAt0, poisoned, poisonTickAt } });
      await tx.battleSession.update({ where: { playerId }, data: { enemyHp: ehp, turn: session.turn + 1 } });
      return { finished: false, result: null, logs, playerHp: php, enemyHp: ehp, poisoned };
    });
    return { ok: true, ...out };
  } catch (e) {
    const map = {
      NO_BATTLE: [409, "進行中の戦闘がありません"],
      NO_ITEM: [400, "アイテムが指定されていません"],
      NOT_USABLE: [400, "戦闘で使えるのは回復/毒消しアイテムだけです"],
      NOT_OWNED: [400, "そのアイテムを持っていません"],
      NOTHING_TO_DO: [400, "今は使う必要がありません"],
    };
    const m = map[e.message];
    if (m) return reply.code(m[0]).send({ error: m[1] });
    throw e;
  }
}));

// 進行中の戦闘を取得(リロード復帰用)
app.get("/api/battle/current", requireAuth(async (req) => {
  const session = await prisma.battleSession.findUnique({ where: { playerId: req.player.id } });
  if (!session || session.status !== "active") return { active: false };
  const enemy = await prisma.enemyMaster.findUnique({ where: { enemyId: session.enemyId } });
  return {
    active: true, sessionId: session.id, spotId: session.spotId,
    enemy: { id: enemy.enemyId, name: enemy.name, maxHp: enemy.hp, image: enemy.image },
    enemyHp: session.enemyHp, playerHp: req.player.hp, playerMaxHp: req.player.maxHp, poisoned: req.player.poisoned, downedUntil: req.player.downedUntil,
  };
}));

// ---- 在庫 ----
app.get("/api/inventory", requireAuth(async (req) => {
  const items = await prisma.playerItem.findMany({
    where: { playerId: req.player.id },
    include: { item: true },
  });
  return items.map((r) => ({ itemId: r.itemId, name: r.item.name, qty: r.qty, rarity: r.item.rarity, healAmount: r.item.healAmount, curePoison: r.item.curePoison, category: r.item.category, sellable: r.item.sellable, sellPrice: Math.floor(r.item.basePrice * SELL_RATE) }));
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
