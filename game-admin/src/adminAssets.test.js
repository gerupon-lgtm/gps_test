const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("loads admin scripts with cache-busting versions", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
  const { ADMIN_APP_VERSION } = require("../public/adminVersion");

  assert.match(ADMIN_APP_VERSION.version, /^\d+\.\d+\.\d+$/);
  assert.equal(ADMIN_APP_VERSION.assetsVersion, ADMIN_APP_VERSION.version);
  assert.match(html, new RegExp(`<script src="\\.\\/adminVersion\\.js\\?v=${ADMIN_APP_VERSION.assetsVersion}"><\\/script>`));
  assert.match(html, new RegExp(`<script src="\\.\\/adminTime\\.js\\?v=${ADMIN_APP_VERSION.assetsVersion}"><\\/script>`));
  assert.match(html, new RegExp(`<script src="\\.\\/app\\.js\\?v=${ADMIN_APP_VERSION.assetsVersion}"><\\/script>`));
});
