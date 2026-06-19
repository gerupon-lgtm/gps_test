const test = require("node:test");
const assert = require("node:assert/strict");
const { hashPassword } = require("../../server/src/hash");

const {
  authenticateAdmin,
  createAdminUserPasswordHash,
  isSuperAdmin,
} = require("./adminAuth");

function createPrismaStub(row) {
  const calls = [];
  return {
    calls,
    adminUser: {
      async findUnique(args) {
        calls.push({ method: "findUnique", args });
        return row;
      },
      async update(args) {
        calls.push({ method: "update", args });
        return row ? { ...row, ...args.data } : null;
      },
    },
  };
}

test("authenticates the env admin as a superuser before checking DB users", async () => {
  const prisma = createPrismaStub(null);

  const admin = await authenticateAdmin({
    prisma,
    env: { ADMIN_USER: "root", ADMIN_PASSWORD: "secret" },
    loginId: "root",
    password: "secret",
    now: new Date("2026-06-19T00:00:00.000Z"),
  });

  assert.equal(admin.loginId, "root");
  assert.equal(admin.role, "superadmin");
  assert.equal(admin.source, "env");
  assert.equal(admin.id, null);
  assert.equal(isSuperAdmin(admin), true);
  assert.equal(prisma.calls.length, 0);
});

test("authenticates an enabled DB admin with a password hash", async () => {
  const passwordHash = hashPassword("secret");
  const row = {
    id: "admin_1",
    loginId: "operator",
    displayName: "Operator",
    passwordHash,
    role: "admin",
    disabled: false,
  };
  const prisma = createPrismaStub(row);
  const now = new Date("2026-06-19T00:00:00.000Z");

  const admin = await authenticateAdmin({
    prisma,
    env: { ADMIN_USER: "root", ADMIN_PASSWORD: "secret" },
    loginId: "operator",
    password: "secret",
    now,
  });

  assert.equal(admin.id, "admin_1");
  assert.equal(admin.loginId, "operator");
  assert.equal(admin.name, "Operator");
  assert.equal(admin.role, "admin");
  assert.equal(admin.source, "db");
  assert.equal(isSuperAdmin(admin), false);
  assert.deepEqual(prisma.calls[1], {
    method: "update",
    args: { where: { id: "admin_1" }, data: { lastLoginAt: now } },
  });
});

test("rejects disabled DB admins and wrong passwords", async () => {
  const disabledPrisma = createPrismaStub({
    id: "admin_2",
    loginId: "disabled",
    displayName: "",
    passwordHash: hashPassword("secret"),
    role: "superadmin",
    disabled: true,
  });

  assert.equal(await authenticateAdmin({
    prisma: disabledPrisma,
    env: {},
    loginId: "disabled",
    password: "secret",
    now: new Date(),
  }), null);

  const wrongPasswordPrisma = createPrismaStub({
    id: "admin_3",
    loginId: "operator",
    displayName: "",
    passwordHash: hashPassword("secret"),
    role: "admin",
    disabled: false,
  });

  assert.equal(await authenticateAdmin({
    prisma: wrongPasswordPrisma,
    env: {},
    loginId: "operator",
    password: "wrong",
    now: new Date(),
  }), null);
});

test("creates password hashes for DB admin users", () => {
  const hash = createAdminUserPasswordHash("new-password");

  assert.match(hash, /^scrypt\$/);
  assert.notEqual(hash, "new-password");
});
