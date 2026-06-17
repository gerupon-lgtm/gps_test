const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("loads admin scripts with cache-busting versions", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");

  assert.match(html, /<script src="\.\/adminTime\.js\?v=\d+"><\/script>/);
  assert.match(html, /<script src="\.\/app\.js\?v=\d+"><\/script>/);
});
