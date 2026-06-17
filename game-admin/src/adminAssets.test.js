const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("loads admin scripts with cache-busting versions", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
  const { ADMIN_APP_VERSION } = require("../public/adminVersion");

  assert.match(ADMIN_APP_VERSION.version, /^\d+\.\d+\.\d+$/);
  assert.equal(ADMIN_APP_VERSION.assetsVersion, ADMIN_APP_VERSION.version);
  assert.match(html, new RegExp(`<link rel="stylesheet" href="\\.\\/style\\.css\\?v=${ADMIN_APP_VERSION.assetsVersion}">`));
  assert.match(html, new RegExp(`<script src="\\.\\/adminVersion\\.js\\?v=${ADMIN_APP_VERSION.assetsVersion}"><\\/script>`));
  assert.match(html, new RegExp(`<script src="\\.\\/adminTime\\.js\\?v=${ADMIN_APP_VERSION.assetsVersion}"><\\/script>`));
  assert.match(html, new RegExp(`<script src="\\.\\/app\\.js\\?v=${ADMIN_APP_VERSION.assetsVersion}"><\\/script>`));
});

test("import preview renderer tolerates missing legacy preview metadata", () => {
  const appJs = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");

  assert.match(appJs, /preview\.fields \|\| MASTER_FIELDS/);
  assert.match(appJs, /change\.data \|\| \{\}/);
  assert.match(appJs, /preview\.changes\.some\(\(change\) => !change\.data\)/);
});

test("admin screen state is reset before a fresh login view loads", () => {
  const appJs = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");

  assert.match(appJs, /function resetAdminScreenState\(\)/);
  assert.match(appJs, /selectedPlayerId = null/);
  assert.match(appJs, /selectedPlayer = null/);
  assert.match(appJs, /selectedMaster = null/);
  assert.match(appJs, /currentImportPreview = null/);
  assert.match(appJs, /\$\("player-list"\)\.innerHTML = ""/);
  assert.match(appJs, /\$\("master-list"\)\.innerHTML = ""/);
  assert.match(appJs, /\$\("player-detail"\)\.textContent = "プレイヤーを選択してください。"/);
  assert.match(appJs, /\$\("master-detail"\)\.textContent = "マスタを選択してください。"/);
  assert.match(appJs, /resetAdminScreenState\(\);\s*showAdmin\(true\);/);
});
