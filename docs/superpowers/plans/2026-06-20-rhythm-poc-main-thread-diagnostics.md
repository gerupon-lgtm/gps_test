# Main Thread Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add low-overhead render-duration and scheduler-gap metrics that distinguish app rendering cost from Android Chrome timer or rAF stalls.

**Architecture:** Extend the existing `?debug=1` in-memory diagnostic state. `render()` records its own execution duration, and `schedulerTick()` records callback spacing; only `showDiagnosticsSummary()` writes the final values to the DOM.

**Tech Stack:** Vanilla JavaScript, Web Audio API, Node.js built-in test runner

## Global Constraints

- Do not change gameplay, judgment, chart, audio scheduling, or song-end behavior.
- Do not write diagnostic values to the DOM during play.
- Skip all added measurements when `debug=1` is absent.
- Use thresholds of 8ms for render duration and 75ms for the 25ms scheduler interval.
- Bump JavaScript cache version to `v=19` and synchronize `dist/rhythm-battle-poc/`.

---

### Task 1: Add in-memory render and timer metrics

**Files:**
- Modify: `server/tests/rhythm-battle-poc.test.js`
- Modify: `js/rhythm-battle-poc.js`

**Interfaces:**
- Produces state fields `debugRenderMaxMs`, `debugSlowRenderCount`, `debugLastSchedulerMs`, `debugSchedulerMaxGapMs`, `debugSlowSchedulerCount`
- Extends `showDiagnosticsSummary(reason)` with `renderMax`, `render>8`, `timerMax`, and `timer>75`

- [ ] **Step 1: Write a failing runtime contract test**

Require `performance.now()` measurements around `render()`, scheduler-gap collection in `schedulerTick()`, thresholds `8` and `75`, reset fields, final labels, and no play-time diagnostics DOM update.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test --test-name-pattern="diagnostic runtime" server\tests\rhythm-battle-poc.test.js`

Expected: FAIL because the new state and labels are absent.

- [ ] **Step 3: Implement minimal debug-only collection**

At the start and end of `render()`, calculate execution time only when the debug session is active. In `schedulerTick()`, compare the current `performance.now()` value with the preceding callback only when active. Reset all new fields from `resetDiagnostics()`.

- [ ] **Step 4: Add final summary labels**

Append two lines:

```text
renderMax=0.0ms >8=0
timerMax=0.0ms >75=0
```

- [ ] **Step 5: Run focused and full tests**

Run the focused test, all tests, and `node --check js\rhythm-battle-poc.js`.

### Task 2: Cache, documentation, and distribution

**Files:**
- Modify: `rhythm-battle-poc.html`
- Modify: `server/tests/rhythm-battle-poc.test.js`
- Modify: `docs/13_rhythm_audio_data.md`
- Copy: runtime files under `dist/rhythm-battle-poc/`

**Interfaces:**
- Produces deployable JavaScript cache version `v=19`

- [ ] **Step 1: Change the cache-version expectation to v19 and verify RED**

Run the mobile-layout focused test and confirm it fails against HTML v18.

- [ ] **Step 2: Update HTML and canonical diagnostic documentation**

Document the new labels and the three-way interpretation from the design specification.

- [ ] **Step 3: Synchronize distribution files**

Copy HTML as `index.html`, CSS, and JavaScript, then compare SHA-256 hashes.

- [ ] **Step 4: Run final verification and commit**

Run all 48 tests, syntax-check source and distribution JavaScript, run `git diff --check`, and commit only the relevant tracked files.
