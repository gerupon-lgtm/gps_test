const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  buildMasterOptions,
  listAssetImages,
} = require("./adminOptions");

test("builds active master options and item field suggestions", () => {
  const options = buildMasterOptions({
    enemies: [{ enemyId: "enemy_001", name: "Slime" }],
    items: [
      { itemId: "item_001", name: "Potion", rarity: "normal", type: "consumable", category: "heal" },
      { itemId: "item_002", name: "Antidote", rarity: "normal", type: "consumable", category: "cure" },
    ],
    assetImages: ["assets/enemy_slime.png", "assets/avatar_hero.png"],
  });

  assert.deepEqual(options.enemies, [{ id: "enemy_001", name: "Slime" }]);
  assert.deepEqual(options.items, [
    { id: "item_001", name: "Potion" },
    { id: "item_002", name: "Antidote" },
  ]);
  assert.deepEqual(options.itemFieldValues.rarity, ["normal"]);
  assert.deepEqual(options.itemFieldValues.type, ["consumable"]);
  assert.deepEqual(options.itemFieldValues.category, ["cure", "heal"]);
  assert.deepEqual(options.assetImages, ["assets/avatar_hero.png", "assets/enemy_slime.png"]);
  assert.deepEqual(options.avatarImages, ["assets/avatar_hero.png"]);
});

test("lists image assets as admin-selectable asset paths", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gps-admin-assets-"));
  fs.writeFileSync(path.join(dir, "enemy.png"), "");
  fs.writeFileSync(path.join(dir, "avatar.webp"), "");
  fs.writeFileSync(path.join(dir, "note.txt"), "");

  assert.deepEqual(listAssetImages(dir), ["assets/avatar.webp", "assets/enemy.png"]);
});
