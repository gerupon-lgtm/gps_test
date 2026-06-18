function clampRate(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(1, Math.max(0, n));
}

function computeBattleDamage(attack, defense, options = {}) {
  const random = typeof options.random === "function" ? options.random : Math.random;
  const criticalRate = clampRate(options.criticalRate, 0.05);
  const criticalMultiplier = Math.max(1, Number(options.criticalMultiplier || 2));
  const useRandom = !!options.useRandom;
  const randomRange = Math.max(0, Number(options.randomRange || 0));

  const critical = random() < criticalRate;
  let base = Math.max(1, Number(attack || 0) - Number(defense || 0));
  if (useRandom) {
    const r = 1 + (random() * 2 - 1) * randomRange;
    base = Math.max(1, Math.round(base * r));
  }
  if (critical) base = Math.max(1, Math.round(base * criticalMultiplier));
  return { damage: base, critical };
}

function rollFlee(options = {}) {
  const random = typeof options.random === "function" ? options.random : Math.random;
  const successRate = clampRate(options.successRate, 0.65);
  return random() < successRate;
}

module.exports = {
  computeBattleDamage,
  rollFlee,
};
