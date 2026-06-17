function calcMarketFee(price, opt) {
  const fixed = Number(opt && opt.fixed != null ? opt.fixed : 5);
  const rate = Number(opt && opt.rate != null ? opt.rate : 0);
  return Math.max(0, fixed) + Math.ceil(Math.max(0, price) * Math.max(0, rate));
}

function normalizePayerSide(value) {
  return value === "buyer" ? "buyer" : "seller";
}

function calcMarketSettlement(price, payerSide, opt) {
  const totalPrice = Math.max(0, Number(price) || 0);
  const normalized = normalizePayerSide(payerSide);
  const fee = calcMarketFee(totalPrice, opt);
  if (normalized === "buyer") {
    return { fee, buyerPays: totalPrice + fee, sellerReceives: totalPrice };
  }
  return { fee, buyerPays: totalPrice, sellerReceives: Math.max(0, totalPrice - fee) };
}

module.exports = {
  calcMarketFee,
  calcMarketSettlement,
  normalizePayerSide,
};
