# Admin Version And Idle Timeout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add resettable admin app version metadata and configurable idle timeout behavior, defaulting to 600 seconds.

**Architecture:** Put browser-visible version metadata in `game-admin/public/adminVersion.js`, and use it for display and cache-busting. Move idle timeout calculation into `game-admin/src/adminSession.js` so server behavior can be tested without starting Fastify.

**Tech Stack:** Node.js CommonJS, Fastify, native `node:test`, browser JavaScript.

---

### Task 1: Version Metadata

**Files:**
- Create: `game-admin/public/adminVersion.js`
- Modify: `game-admin/public/index.html`
- Modify: `game-admin/public/app.js`
- Test: `game-admin/src/adminAssets.test.js`

- [ ] Add failing tests that require `adminVersion.js`, assert version fields, and assert HTML scripts use `?v=${assetsVersion}`.
- [ ] Implement `adminVersion.js` with `version`, `assetsVersion`, and `releasedAt`.
- [ ] Load `adminVersion.js` before other admin scripts.
- [ ] Display the version in the admin header.
- [ ] Run `npm.cmd test`.

### Task 2: Idle Timeout Server Behavior

**Files:**
- Create: `game-admin/src/adminSession.js`
- Modify: `game-admin/src/index.js`
- Test: `game-admin/src/adminSession.test.js`

- [ ] Add failing tests for default 600 seconds, env override, invalid env fallback, active session touch, and expired session rejection.
- [ ] Implement idle timeout helpers in `adminSession.js`.
- [ ] Use helpers in `index.js`, storing `lastActiveAt` in each admin session and returning `idleTimeoutSeconds` from login/me.
- [ ] Run `npm.cmd test`.

### Task 3: Idle Timeout Browser UX

**Files:**
- Modify: `game-admin/public/app.js`

- [ ] Track `idleTimeoutSeconds` from `/api/admin/login` and `/api/admin/me`.
- [ ] Reset a browser idle timer on common user activity while logged in.
- [ ] When the timer expires, call logout and show the login panel with a timeout message.
- [ ] Run `npm.cmd test`.
