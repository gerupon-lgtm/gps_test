const test = require("node:test");
const assert = require("node:assert/strict");

const {
  computeBattleDamage,
  rollFlee,
} = require("../src/battleRules");

test("battle damage can become a critical hit", () => {
  const result = computeBattleDamage(20, 5, {
    random: () => 0.01,
    criticalRate: 0.05,
    criticalMultiplier: 2,
    useRandom: false,
  });

  assert.deepEqual(result, { damage: 30, critical: true });
});

test("battle damage stays normal when critical roll misses", () => {
  const result = computeBattleDamage(20, 5, {
    random: () => 0.99,
    criticalRate: 0.05,
    criticalMultiplier: 2,
    useRandom: false,
  });

  assert.deepEqual(result, { damage: 15, critical: false });
});

test("flee roll succeeds below configured success rate", () => {
  assert.equal(rollFlee({ random: () => 0.64, successRate: 0.65 }), true);
});

test("flee roll fails at or above configured success rate", () => {
  assert.equal(rollFlee({ random: () => 0.65, successRate: 0.65 }), false);
});
