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
    await prisma.enemyMaster.upsert({
      where: { enemyId: e.enemy_id },
      update: { name: e.enemy_name, hp: +e.hp, attack: +e.attack, defense: +e.defense, image: e.image || "" },
      create: { enemyId: e.enemy_id, name: e.enemy_name, hp: +e.hp, attack: +e.attack, defense: +e.defense, image: e.image || "" },
    });
  }
  for (const i of items) {
    await prisma.itemMaster.upsert({
      where: { itemId: i.item_id },
      update: { name: i.item_name, description: i.description || "", rarity: i.rarity || "normal" },
      create: { itemId: i.item_id, name: i.item_name, description: i.description || "", rarity: i.rarity || "normal" },
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
  console.log(`seed done: enemies=${enemies.length} items=${items.length} spots=${spots.length}`);
}

main().then(() => prisma.$disconnect()).catch(async (e) => {
  console.error(e); await prisma.$disconnect(); process.exit(1);
});
