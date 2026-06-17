const test = require("node:test");
const assert = require("node:assert/strict");

const {
  calcMarketFee,
  calcMarketSettlement,
} = require("../src/marketFees");

test("default market fee is fixed 5G with zero percent rate", () => {
  assert.equal(calcMarketFee(100, { fixed: 5, rate: 0 }), 5);
  assert.equal(calcMarketFee(1, { fixed: 5, rate: 0 }), 5);
});

test("market fee percentage is rounded up when configured", () => {
  assert.equal(calcMarketFee(101, { fixed: 5, rate: 0.05 }), 11);
});

test("seller pays fee from total price", () => {
  assert.deepEqual(calcMarketSettlement(100, "seller", { fixed: 5, rate: 0 }), {
    fee: 5,
    buyerPays: 100,
    sellerReceives: 95,
  });
});

test("buyer pays fee on top of total price", () => {
  assert.deepEqual(calcMarketSettlement(100, "buyer", { fixed: 5, rate: 0 }), {
    fee: 5,
    buyerPays: 105,
    sellerReceives: 100,
  });
});
