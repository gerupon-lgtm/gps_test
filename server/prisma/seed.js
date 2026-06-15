// 既存の data/*.csv を マスタテーブルへ投入(upsert)
const fs = require("fs");
const path = require("path");
const { prisma } = require("../src/db");

const DATA_DIR = path.join(__dirname, "..", "..", "data");

function parseCsv(text) {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter((l) => l.trim() !== "");
  const headers = lines[0].split(",").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cols = line.split(",");
    const o = {};
    headers.forEach((h, i) => (o[h] = (cols[i] ?? "").trim()));
    return o;
  });
}
const read = (f) => parseCsv(fs.readFileSync(path.join(DATA_DIR, f), "utf8"));

async function main() {
  const enemies = read("enemies.csv");
  const items = read("items.csv");
  const spots = read("spots.csv");

  for (const e of enemies) {
    const fields = {
      name: e.enemy_name, hp: +e.hp, attack: +e.attack, defense: +e.defense, image: e.image || "",
      expBase: +(e.exp_base || 0), goldBase: +(e.gold_base || 0),
      dropItemId: e.drop_item_id || null, dropRate: +(e.drop_rate || 0), poisonChance: +(e.poison_chance || 0),
    };
    await prisma.enemyMaster.upsert({
      where: { enemyId: e.enemy_id },
      update: fields,
      create: { enemyId: e.enemy_id, ...fields },
    });
  }
  for (const i of items) {
    const fields = {
      name: i.item_name, description: i.description || "", rarity: i.rarity || "normal",
      healAmount: +(i.heal || 0), category: i.category || "misc",
      curePoison: String(i.cure_poison) === "1" || String(i.cure_poison).toLowerCase() === "true",
      basePrice: +(i.price || 0),
      sellable: i.sellable === undefined ? true : (String(i.sellable) === "1" || String(i.sellable).toLowerCase() === "true"),
    };
    await prisma.itemMaster.upsert({
      where: { itemId: i.item_id },
      update: fields,
      create: { itemId: i.item_id, ...fields },
    });
  }
  for (const s of spots) {
    await prisma.spotMaster.upsert({
      where: { spotId: s.spot_id },
      update: {
        name: s.spot_name, lat: +s.latitude, lng: +s.longitude, radiusM: +s.radius_meters,
        enemyId: s.enemy_id, rewardItemId: s.reward_item_id, penaltyMin: +s.penalty_minutes,
        active: String(s.active).toLowerCase() === "true",
      },
      create: {
        spotId: s.spot_id, name: s.spot_name, lat: +s.latitude, lng: +s.longitude, radiusM: +s.radius_meters,
        enemyId: s.enemy_id, rewardItemId: s.reward_item_id, penaltyMin: +s.penalty_minutes,
        active: String(s.active).toLowerCase() === "true",
      },
    });
  }

  // 宿屋(任意。inns.csv が無ければスキップ)
  let inns = [];
  try { inns = read("inns.csv"); } catch (e) { inns = []; }
  for (const n of inns) {
    await prisma.innMaster.upsert({
      where: { innId: n.inn_id },
      update: { name: n.inn_name, lat: +n.latitude, lng: +n.longitude, radiusM: +n.radius_meters },
      create: { innId: n.inn_id, name: n.inn_name, lat: +n.latitude, lng: +n.longitude, radiusM: +n.radius_meters },
    });
  }

  // 道具屋(任意。shops.csv が無ければスキップ)
  let shops = [];
  try { shops = read("shops.csv"); } catch (e) { shops = []; }
  for (const sh of shops) {
    await prisma.shopMaster.upsert({
      where: { shopId: sh.shop_id },
      update: { name: sh.shop_name, lat: +sh.latitude, lng: +sh.longitude, radiusM: +sh.radius_meters },
      create: { shopId: sh.shop_id, name: sh.shop_name, lat: +sh.latitude, lng: +sh.longitude, radiusM: +sh.radius_meters },
    });
  }

  console.log(`seed done: enemies=${enemies.length} items=${items.length} spots=${spots.length} inns=${inns.length} shops=${shops.length}`);
}

main().then(() => prisma.$disconnect()).catch(async (e) => {
  console.error(e); await prisma.$disconnect(); process.exit(1);
});
