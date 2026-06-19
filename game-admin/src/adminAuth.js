const { hashPassword, verifyPassword } = require("../../server/src/hash");

const ADMIN_ROLE_SUPERADMIN = "superadmin";
const ADMIN_ROLE_ADMIN = "admin";
const AUTH_SOURCE_ENV = "env";
const AUTH_SOURCE_DB = "db";

function normalizeRole(role) {
  return role === ADMIN_ROLE_SUPERADMIN ? ADMIN_ROLE_SUPERADMIN : ADMIN_ROLE_ADMIN;
}

function normalizeAdminIdentity(input) {
  const loginId = String(input.loginId || "");
  const name = String(input.name || input.displayName || loginId);
  return {
    id: input.id || null,
    loginId,
    name,
    role: normalizeRole(input.role),
    source: input.source || AUTH_SOURCE_DB,
  };
}

function isSuperAdmin(admin) {
  return Boolean(admin && admin.role === ADMIN_ROLE_SUPERADMIN);
}

function createAdminUserPasswordHash(password) {
  return hashPassword(String(password || ""));
}

async function authenticateAdmin({ prisma, env, loginId, password, now }) {
  const candidateLoginId = String(loginId || "");
  const candidatePassword = String(password || "");
  const adminUser = (env && env.ADMIN_USER) || "admin";
  const adminPassword = (env && env.ADMIN_PASSWORD) || "";

  if (adminPassword && candidateLoginId === adminUser && candidatePassword === adminPassword) {
    return normalizeAdminIdentity({
      id: null,
      loginId: adminUser,
      name: adminUser,
      role: ADMIN_ROLE_SUPERADMIN,
      source: AUTH_SOURCE_ENV,
    });
  }

  if (!prisma || !prisma.adminUser) return null;
  const row = await prisma.adminUser.findUnique({ where: { loginId: candidateLoginId } });
  if (!row || row.disabled || !verifyPassword(candidatePassword, row.passwordHash)) return null;

  await prisma.adminUser.update({
    where: { id: row.id },
    data: { lastLoginAt: now || new Date() },
  });

  return normalizeAdminIdentity({
    id: row.id,
    loginId: row.loginId,
    name: row.displayName || row.loginId,
    role: row.role,
    source: AUTH_SOURCE_DB,
  });
}

module.exports = {
  ADMIN_ROLE_ADMIN,
  ADMIN_ROLE_SUPERADMIN,
  AUTH_SOURCE_DB,
  AUTH_SOURCE_ENV,
  authenticateAdmin,
  createAdminUserPasswordHash,
  isSuperAdmin,
  normalizeAdminIdentity,
};
