const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..", "..");

function read(relPath) {
  return fs.readFileSync(path.join(root, relPath), "utf8");
}

test("registration lets players select an avatar and sends it to the API", () => {
  const html = read("index.html");
  const apiJs = read("js/api.js");
  const authGateJs = read("js/authGate.js");

  assert.match(html, /auth-reg-avatar-preview/);
  assert.match(html, /auth-reg-avatar/);
  assert.match(html, /auth-reg-avatar-options/);
  assert.match(apiJs, /register: \(loginId, password, name, inviteCode, avatar\)/);
  assert.match(apiJs, /avatar \}/);
  assert.match(authGateJs, /loadAvatarOptions/);
  assert.match(authGateJs, /API\.register\(v\("auth-reg-id"\), v\("auth-reg-pw"\), v\("auth-reg-name"\), v\("auth-reg-invite"\), v\("auth-reg-avatar"\)\)/);
});

test("server exposes avatar choices and stores the selected avatar at registration", () => {
  const serverJs = read("server/src/index.js");

  assert.match(serverJs, /app\.get\("\/api\/avatar-options"/);
  assert.match(serverJs, /listAvatarImages/);
  assert.match(serverJs, /avatar: z\.string\(\)\.max\(200\)\.optional\(\)/);
  assert.match(serverJs, /normalizeAvatarPath\(p\.data\.avatar\)/);
  assert.match(serverJs, /data: \{ userId: u\.id, name, avatar, gold: START_GOLD \}/);
});

test("map player marker uses the current player avatar instead of a fixed asset", () => {
  const appJs = read("js/app.js");
  const mapJs = read("js/map.js");

  assert.match(appJs, /updateMapPosition\(pos\.latitude, pos\.longitude, pos\.accuracy, App\.player && App\.player\.avatar\)/);
  assert.doesNotMatch(mapJs, /const PLAYER_AVATAR_SRC/);
  assert.match(mapJs, /function playerMapIcon/);
  assert.match(mapJs, /_selfAvatarSrc/);
  assert.match(mapJs, /_selfDot\.setIcon\(playerMapIcon\(avatarSrc\)\)/);
});
