function parseBool(value, fallback) {
  if (value === undefined || value === null || String(value).trim() === "") return fallback;
  const s = String(value).trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes";
}

function defaultShopBuyableForCategory(category) {
  return category === "heal" || category === "antidote";
}

function parseShopBuyable(row) {
  const category = row && row.category ? row.category : "misc";
  return parseBool(row && row.shop_buyable, defaultShopBuyableForCategory(category));
}

module.exports = {
  defaultShopBuyableForCategory,
  parseBool,
  parseShopBuyable,
};
