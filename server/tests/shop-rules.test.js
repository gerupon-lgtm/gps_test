const test = require("node:test");
const assert = require("node:assert/strict");

const { parseShopBuyable } = require("../src/shopRules");

test("shop_buyable overrides item category", () => {
  assert.equal(parseShopBuyable({ category: "heal", shop_buyable: "0" }), false);
  assert.equal(parseShopBuyable({ category: "material", shop_buyable: "1" }), true);
});

test("missing shop_buyable keeps existing heal and antidote behavior", () => {
  assert.equal(parseShopBuyable({ category: "heal" }), true);
  assert.equal(parseShopBuyable({ category: "antidote" }), true);
  assert.equal(parseShopBuyable({ category: "collectible" }), false);
});
