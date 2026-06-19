const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..", "..");

function read(relPath) {
  return fs.readFileSync(path.join(root, relPath), "utf8");
}

test("admin login uses env and DB admin authentication with identity-aware sessions", () => {
  const indexJs = read("game-admin/src/index.js");

  assert.match(indexJs, /authenticateAdmin/);
  assert.match(indexJs, /createAdminSession\(admin,/);
  assert.match(indexJs, /req\.admin =/);
  assert.match(indexJs, /adminRole/);
  assert.match(indexJs, /authSource/);
});

test("superadmins can manage DB admin users from API and UI", () => {
  const indexJs = read("game-admin/src/index.js");
  const html = read("game-admin/public/index.html");
  const appJs = read("game-admin/public/app.js");

  assert.match(indexJs, /requireSuperAdmin/);
  assert.match(indexJs, /\/api\/admin\/admin-users/);
  assert.match(indexJs, /createAdminUserPasswordHash/);
  assert.match(indexJs, /disabledAt/);
  assert.match(html, /tab-admin-users/);
  assert.match(html, /admin-users-panel/);
  assert.match(appJs, /loadAdminUsers/);
  assert.match(appJs, /saveAdminUser/);
  assert.match(appJs, /resetAdminUserPassword/);
});

test("schema stores DB admin users and audit identity fields", () => {
  const schema = read("server/prisma/schema.prisma");

  assert.match(schema, /model AdminUser/);
  assert.match(schema, /loginId\s+String\s+@unique/);
  assert.match(schema, /passwordHash\s+String/);
  assert.match(schema, /role\s+String\s+@default\("admin"\)/);
  assert.match(schema, /adminLoginId\s+String\?/);
  assert.match(schema, /authSource\s+String\?/);
});
