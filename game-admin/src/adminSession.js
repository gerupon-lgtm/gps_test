const DEFAULT_IDLE_TIMEOUT_SECONDS = 600;
const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

function getIdleTimeoutSeconds(env) {
  const raw = env && env.ADMIN_IDLE_TIMEOUT_SECONDS;
  const seconds = Number(raw);
  if (!Number.isInteger(seconds) || seconds < 1) return DEFAULT_IDLE_TIMEOUT_SECONDS;
  return seconds;
}

function normalizeSessionAdmin(admin) {
  if (admin && typeof admin === "object") {
    return {
      adminName: admin.name || admin.displayName || admin.loginId || "admin",
      adminId: admin.id || null,
      adminLoginId: admin.loginId || admin.name || "admin",
      adminRole: admin.role || "admin",
      authSource: admin.source || "db",
    };
  }
  return {
    adminName: String(admin || "admin"),
    adminId: null,
    adminLoginId: String(admin || "admin"),
    adminRole: "superadmin",
    authSource: "env",
  };
}

function createAdminSession(admin, now) {
  const identity = normalizeSessionAdmin(admin);
  return {
    ...identity,
    createdAt: now,
    lastActiveAt: now,
    expiresAt: now + SESSION_MAX_AGE_SECONDS * 1000,
  };
}

function validateAdminSession(session, now, idleTimeoutSeconds) {
  if (!session) return { ok: false, reason: "missing" };
  if (session.expiresAt < now) return { ok: false, reason: "expired" };
  if (now - session.lastActiveAt > idleTimeoutSeconds * 1000) {
    return { ok: false, reason: "idle_timeout" };
  }
  session.lastActiveAt = now;
  return { ok: true, session };
}

module.exports = {
  DEFAULT_IDLE_TIMEOUT_SECONDS,
  SESSION_MAX_AGE_SECONDS,
  createAdminSession,
  getIdleTimeoutSeconds,
  normalizeSessionAdmin,
  validateAdminSession,
};
