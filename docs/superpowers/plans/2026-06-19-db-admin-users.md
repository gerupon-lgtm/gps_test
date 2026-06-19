# DB Admin Users Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add DB-backed multiple admin users while preserving the existing env/file admin as a superuser fallback.

**Architecture:** Add a dedicated `AdminUser` model separate from game `User`. Login authenticates the env superuser first, then enabled DB admin users, and stores a normalized admin identity in the existing admin session map. Audit logs keep the legacy `adminName` and add stable identity columns.

**Tech Stack:** Fastify, Prisma 5, PostgreSQL, Node `node:test`, existing admin static UI.

## Global Constraints

- Keep the env admin working as emergency `superadmin` access.
- Do not reuse the game `User` model for admin permissions.
- Store DB admin passwords as hashes only.
- Disable admin users instead of deleting them.
- Admin app releases must increment `game-admin/public/adminVersion.js`.
- Deployment guidance must use existing pattern notation: DB schema is `D`, admin app is `E`, env/systemd changes are `G`.

---

### Task 1: Auth Core and Schema

**Files:**
- Create: `game-admin/src/adminAuth.js`
- Test: `game-admin/src/adminAuth.test.js`
- Modify: `game-admin/src/adminSession.js`
- Modify: `game-admin/src/adminSession.test.js`
- Modify: `server/prisma/schema.prisma`

**Interfaces:**
- Produces: `authenticateAdmin({ prisma, env, loginId, password, now })`
- Produces: `createAdminUserPasswordHash(password)`
- Produces: `isSuperAdmin(admin)`
- Produces: admin session object containing `adminName`, `adminId`, `adminLoginId`, `adminRole`, `authSource`

- [x] Write failing tests for env superuser login, DB admin login, disabled DB admin rejection, and session identity preservation.
- [x] Run the tests and confirm the new `adminAuth` module is missing.
- [x] Add `AdminUser` model and audit identity columns.
- [x] Implement `adminAuth` and extend admin sessions.
- [x] Run the auth/session tests and confirm they pass.

### Task 2: Admin APIs and UI

**Files:**
- Modify: `game-admin/src/index.js`
- Modify: `game-admin/public/index.html`
- Modify: `game-admin/public/app.js`
- Modify: `game-admin/public/style.css`

**Interfaces:**
- Consumes: `authenticateAdmin`, `isSuperAdmin`, `createAdminUserPasswordHash`
- Produces: `/api/admin/admin-users` list/create endpoints
- Produces: `/api/admin/admin-users/:id` update endpoint
- Produces: `/api/admin/admin-users/:id/password` password reset endpoint

- [x] Write failing structural/API tests for login dual-path and superadmin-only admin-user management.
- [x] Update login to use env-first then DB authentication.
- [x] Add admin-user management APIs with superadmin checks.
- [x] Add a third admin UI tab for listing, creating, disabling, role changes, and password reset.
- [x] Run admin tests and syntax checks.

### Task 3: Version and Documentation

**Files:**
- Modify: `game-admin/public/adminVersion.js`
- Modify: `game-admin/public/index.html`
- Modify: `docs/08_admin_app.md`
- Modify: `docs/11_deploy_patterns.md`

**Interfaces:**
- Produces: admin app version `0.1.10`
- Produces: deployment instructions using `D + E`, with `G` when env is changed.

- [x] Increment the admin app version and cache query parameters.
- [x] Document setup, operation, concerns, and deployment steps.
- [x] Run final verification.
