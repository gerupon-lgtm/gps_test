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
  assert.match(appJs, /function setOptionalHtml\(id, value\)/);
  assert.match(appJs, /function setOptionalText\(id, value\)/);
  assert.match(appJs, /selectedPlayerId = null/);
  assert.match(appJs, /selectedPlayer = null/);
  assert.match(appJs, /selectedMaster = null/);
  assert.match(appJs, /currentImportPreview = null/);
  assert.match(appJs, /\$\("player-list"\)\.innerHTML = ""/);
  assert.match(appJs, /\$\("master-list"\)\.innerHTML = ""/);
  assert.match(appJs, /setOptionalText\("player-detail", "プレイヤーを選択してください。"\)/);
  assert.match(appJs, /setOptionalText\("master-detail", "マスタを選択してください。"\)/);
  assert.doesNotMatch(appJs, /\$\("spot-state-list"\)\.innerHTML = ""/);
  assert.match(appJs, /setOptionalHtml\("spot-state-list", ""\)/);
  assert.match(appJs, /resetAdminScreenState\(\);\s*showAdmin\(true\);/);
});

test("master editor supports copy registration and guided field choices", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
  const appJs = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");

  assert.match(html, /btn-master-copy/);
  assert.match(appJs, /function copyMasterAsNew\(\)/);
  assert.match(appJs, /\/api\/admin\/master-options/);
  assert.match(appJs, /renderReferenceSelect/);
  assert.match(appJs, /renderDatalistInput/);
  assert.match(appJs, /enemyId/);
  assert.match(appJs, /rewardItemId/);
  assert.match(appJs, /dropItemId/);
  assert.match(appJs, /assetImages/);
});

test("admin image fields show previews and player avatar can be changed", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
  const appJs = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");
  const schema = fs.readFileSync(path.join(__dirname, "..", "..", "server", "prisma", "schema.prisma"), "utf8");

  assert.match(schema, /avatar\s+String\s+@default/);
  assert.match(html, /player-avatar-preview/);
  assert.match(html, /player-avatar-select/);
  assert.match(html, /btn-save-avatar/);
  assert.match(appJs, /function renderImagePreview/);
  assert.match(appJs, /function syncImagePreview/);
  assert.match(appJs, /function savePlayerAvatar/);
  assert.match(appJs, /\/api\/admin\/players\/.*\/avatar/);
  assert.match(appJs, /avatarImages/);
});
