// パスワードハッシュ(Node標準のscrypt。ネイティブ依存なし)
const crypto = require("crypto");

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const dk = crypto.scryptSync(password, salt, 64).toString("hex");
  return "scrypt$" + salt + "$" + dk;
}

function verifyPassword(password, stored) {
  try {
    const [scheme, salt, dk] = String(stored).split("$");
    if (scheme !== "scrypt" || !salt || !dk) return false;
    const calc = crypto.scryptSync(password, salt, 64).toString("hex");
    const a = Buffer.from(dk, "hex");
    const b = Buffer.from(calc, "hex");
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch (e) {
    return false;
  }
}

module.exports = { hashPassword, verifyPassword };
