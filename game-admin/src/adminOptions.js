const fs = require("fs");
const path = require("path");

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);

function uniqueSorted(values) {
  return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean))).sort();
}

function toMasterOption(row, idField) {
  return {
    id: row[idField],
    name: row.name || "",
  };
}

function buildMasterOptions({ enemies, items, assetImages }) {
  const sortedAssetImages = Array.from(assetImages || []).sort();
  return {
    enemies: enemies.map((row) => toMasterOption(row, "enemyId")),
    items: items.map((row) => toMasterOption(row, "itemId")),
    itemFieldValues: {
      rarity: uniqueSorted(items.map((row) => row.rarity)),
      type: uniqueSorted(items.map((row) => row.type)),
      category: uniqueSorted(items.map((row) => row.category)),
    },
    assetImages: sortedAssetImages,
    avatarImages: sortedAssetImages.filter((imagePath) => /^assets\/avatar_/i.test(imagePath)),
  };
}

function listAssetImages(assetsDir) {
  if (!assetsDir || !fs.existsSync(assetsDir)) return [];
  return fs.readdirSync(assetsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
    .map((entry) => `assets/${entry.name}`)
    .sort();
}

module.exports = {
  buildMasterOptions,
  listAssetImages,
};
