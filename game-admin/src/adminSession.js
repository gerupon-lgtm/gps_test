const DEFAULT_IDLE_TIMEOUT_SECONDS = 600;
const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

function getIdleTimeoutSeconds(env) {
  const raw = env && env.ADMIN_IDLE_TIMEOUT_SECONDS;
  const seconds = Number(raw);
  if (!Number.isInteger(seconds) || seconds < 1) return DEFAULT_IDLE_TIMEOUT_SECONDS;
  return seconds;
}

function createAdminSession(adminName, now) {
  return {
    adminName,
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
  validateAdminSession,
};
