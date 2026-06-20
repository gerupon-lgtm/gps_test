# rAF Watchdog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve normal rAF rendering while using a timer-driven visual fallback only after a visible active battle has gone at least 50ms without a visual frame.

**Architecture:** Extract visual DOM updates into `renderVisual()`. The rAF callback remains authoritative for diagnostics and scheduling; a 25ms watchdog calls the same visual function only when a pure predicate confirms that rendering is stale.

**Tech Stack:** Vanilla JavaScript, Web Audio API, Node.js built-in test runner

## Global Constraints

- Keep AudioContext time as the visual and judgment clock.
- Do not change gameplay, audio, chart, scoring, or song-end behavior.
- Never run fallback rendering in a hidden document.
- Stop the watchdog with every playback stop.
- Bump JavaScript cache to `v=20` and synchronize `dist/rhythm-battle-poc/`.

---

### Task 1: Pure fallback predicate

**Files:**
- Modify: `server/tests/rhythm-battle-poc.test.js`
- Modify: `js/rhythm-battle-poc.js`

**Interfaces:**
- Produces: `shouldRunVisualFallback(running, visibilityState, lastVisualRenderMs, nowMs, thresholdMs): boolean`

- [ ] Write tests covering a healthy frame, a 50ms stale frame, hidden documents, stopped playback, and invalid timestamps.
- [ ] Run the focused tests and confirm RED because the helper is absent.
- [ ] Implement and export the minimal pure helper.
- [ ] Run focused tests and confirm GREEN.

### Task 2: Adaptive watchdog lifecycle

**Files:**
- Modify: `server/tests/rhythm-battle-poc.test.js`
- Modify: `js/rhythm-battle-poc.js`

**Interfaces:**
- Produces: `renderVisual()`, `visualWatchdogTick()`, `state.visualWatchdog`, `state.lastVisualRenderMs`

- [ ] Add a failing source-contract test for shared visual rendering, 25ms watchdog creation, visibility guard through the predicate, and cleanup in `stopPlayback()`.
- [ ] Split visual DOM work from the rAF callback without moving `sampleDiagnosticsFrame()` out of rAF.
- [ ] Start the watchdog with battle playback and clear it during every stop.
- [ ] Run focused and full tests plus JavaScript syntax verification.

### Task 3: Distribution and documentation

**Files:**
- Modify: `rhythm-battle-poc.html`
- Modify: `server/tests/rhythm-battle-poc.test.js`
- Modify: `docs/13_rhythm_audio_data.md`
- Copy runtime files under `dist/rhythm-battle-poc/`

**Interfaces:**
- Produces deployable cache version `v=20`

- [ ] Change the cache expectation to v20 and confirm RED.
- [ ] Update HTML and canonical documentation.
- [ ] Copy the verified runtime files and compare SHA-256 hashes.
- [ ] Run all tests, both JavaScript syntax checks, and `git diff --check` before committing.
