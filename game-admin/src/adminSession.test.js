const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createAdminSession,
  getIdleTimeoutSeconds,
  validateAdminSession,
} = require("./adminSession");

test("defaults admin idle timeout to 600 seconds", () => {
  assert.equal(getIdleTimeoutSeconds({}), 600);
});

test("uses ADMIN_IDLE_TIMEOUT_SECONDS when configured", () => {
  assert.equal(getIdleTimeoutSeconds({ ADMIN_IDLE_TIMEOUT_SECONDS: "120" }), 120);
});

test("falls back to 600 seconds for invalid idle timeout config", () => {
  assert.equal(getIdleTimeoutSeconds({ ADMIN_IDLE_TIMEOUT_SECONDS: "0" }), 600);
  assert.equal(getIdleTimeoutSeconds({ ADMIN_IDLE_TIMEOUT_SECONDS: "abc" }), 600);
});

test("keeps an active admin session and updates last activity", () => {
  const session = createAdminSession("admin", 1000);
  const result = validateAdminSession(session, 1500, 600);

  assert.equal(result.ok, true);
  assert.equal(session.lastActiveAt, 1500);
});

test("stores normalized admin identity in the session", () => {
  const session = createAdminSession({
    id: "admin_1",
    loginId: "operator",
    name: "Operator",
    role: "admin",
    source: "db",
  }, 1000);

  assert.equal(session.adminName, "Operator");
  assert.equal(session.adminId, "admin_1");
  assert.equal(session.adminLoginId, "operator");
  assert.equal(session.adminRole, "admin");
  assert.equal(session.authSource, "db");
});

test("rejects an idle admin session after the configured timeout", () => {
  const session = createAdminSession("admin", 1000);
  const result = validateAdminSession(session, 2001, 1);

  assert.equal(result.ok, false);
  assert.equal(result.reason, "idle_timeout");
  assert.equal(session.lastActiveAt, 1000);
});
