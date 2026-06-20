# Clock Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `?debug=1`-only on-screen diagnostic panel that distinguishes audio-clock drift, frame stalls, AudioContext state changes, and early battle termination on Android Chrome.

**Architecture:** Pure helpers calculate debug enablement and clock drift and remain testable under Node.js. Browser-only code records a performance-clock anchor at battle start, samples frame gaps in the existing render loop, listens for AudioContext state changes, and refreshes a non-interactive panel at most every 250ms. Normal URLs exit the diagnostic path immediately.

**Tech Stack:** Vanilla HTML, CSS, JavaScript, Web Audio API, Node.js built-in test runner

## Global Constraints

- Enable diagnostics only when the query string contains `debug=1`.
- Do not change chart timing, judgment, scoring, damage, enemy HP, audio scheduling, or song-end behavior.
- Do not transmit or persist diagnostic values.
- Keep the panel non-interactive with `pointer-events: none`.
- Limit diagnostic DOM updates to one per 250ms.
- Update the distribution folder and document `https://gerupon-lgtm.github.io/beat-poc/?debug=1` as the verification URL.

---

### Task 1: Pure diagnostic calculations and panel structure

**Files:**
- Modify: `server/tests/rhythm-battle-poc.test.js`
- Modify: `js/rhythm-battle-poc.js`
- Modify: `rhythm-battle-poc.html`
- Modify: `css/rhythm-battle-poc.css`

**Interfaces:**
- Produces: `isDebugMode(search: string): boolean`
- Produces: `calculateClockDriftMs(audioSongTime: number, wallSongTime: number): number`
- Produces: `#diagnostics-panel` hidden `<pre>` element

- [ ] **Step 1: Add failing helper and static structure tests**

Import `isDebugMode` and `calculateClockDriftMs`, then add tests for `?debug=1`, ordinary URLs, positive drift, and invalid inputs. Extend the layout test to require a hidden `#diagnostics-panel`, `.diagnostics-panel`, and `pointer-events: none`.

```js
test("diagnostic mode is enabled only by debug=1", () => {
  assert.equal(isDebugMode("?debug=1"), true);
  assert.equal(isDebugMode("?debug=0"), false);
  assert.equal(isDebugMode(""), false);
});

test("clock diagnostics report wall time ahead of audio time", () => {
  assert.equal(calculateClockDriftMs(8.25, 8.5), 250);
  assert.equal(calculateClockDriftMs(Number.NaN, 8.5), 0);
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `node --test server\tests\rhythm-battle-poc.test.js`

Expected: FAIL because both helpers and panel markup are absent.

- [ ] **Step 3: Implement the pure helpers and export them**

```js
function isDebugMode(search) {
  return new URLSearchParams(search || "").get("debug") === "1";
}

function calculateClockDriftMs(audioSongTime, wallSongTime) {
  if (!Number.isFinite(audioSongTime) || !Number.isFinite(wallSongTime)) return 0;
  return (wallSongTime - audioSongTime) * 1000;
}
```

- [ ] **Step 4: Add hidden panel markup and CSS**

Add `<pre id="diagnostics-panel" class="diagnostics-panel" hidden aria-live="off"></pre>` inside the lane. Style it at the upper-left with compact monospace text, translucent background, `z-index: 9`, and `pointer-events: none`.

- [ ] **Step 5: Bump cache versions and run tests**

Change CSS to `v=12` and JavaScript to `v=17`, update test expectations, then run the full suite. Expected: all tests PASS.

- [ ] **Step 6: Commit Task 1**

```powershell
git add -- rhythm-battle-poc.html css/rhythm-battle-poc.css js/rhythm-battle-poc.js server/tests/rhythm-battle-poc.test.js
git commit -m "時計診断パネルの基盤を追加"
```

### Task 2: Runtime sampling and tap-state diagnostics

**Files:**
- Modify: `server/tests/rhythm-battle-poc.test.js`
- Modify: `js/rhythm-battle-poc.js`

**Interfaces:**
- Consumes: helpers and panel from Task 1
- Produces: `resetDiagnostics()`, `updateDiagnosticsPanel(frameTime, force)`, and debug state fields

- [ ] **Step 1: Add a failing runtime contract test**

Require the source to contain `250`, an AudioContext `statechange` listener, `calculateClockDriftMs`, the `debugSongStartWallMs` anchor, a 50ms frame-gap threshold, and a normal-mode early return.

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `node --test --test-name-pattern="diagnostic runtime" server\tests\rhythm-battle-poc.test.js`

Expected: FAIL because runtime sampling is absent.

- [ ] **Step 3: Add debug-only state and reset behavior**

Add fields for enabled state, wall-clock song start, last/max frame gap, long-frame count, last panel update, AudioContext state, and last tap. `resetDiagnostics()` clears the counters and hides the panel when disabled.

- [ ] **Step 4: Anchor and sample both clocks**

At start, calculate:

```js
state.debugSongStartWallMs = performance.now()
  + (state.startTime - audio.currentTime) * 1000;
```

Change `render()` to accept the rAF timestamp, record frame gaps, count gaps over 50ms, calculate wall/audio song times and drift, and update the panel no more often than every 250ms. Panel text includes a shortened `navigator.userAgent`, AudioContext state, both clocks, signed drift, current/max frame gap, long-frame count, `baseLatency`, optional `outputLatency`, battle flags, and last tap.

- [ ] **Step 5: Record AudioContext and tap states**

Listen for `statechange` once when creating the AudioContext. Record ignored taps as `ignored:count-in` or `ignored:not-running`, and accepted taps as their judgment plus offset. Force a final panel refresh from `stopPlayback()` so `running=false` remains visible after time-out.

- [ ] **Step 6: Run focused and full verification**

Run:

```powershell
node --test --test-name-pattern="diagnostic runtime" server\tests\rhythm-battle-poc.test.js
node --test server\tests\rhythm-battle-poc.test.js
node --check js\rhythm-battle-poc.js
```

Expected: all tests PASS and syntax check exits 0.

- [ ] **Step 7: Commit Task 2**

```powershell
git add -- js/rhythm-battle-poc.js server/tests/rhythm-battle-poc.test.js
git commit -m "Android Chrome向け時計診断を追加"
```

### Task 3: Distribution and verification instructions

**Files:**
- Modify: `dist/rhythm-battle-poc/index.html`
- Modify: `dist/rhythm-battle-poc/css/rhythm-battle-poc.css`
- Modify: `dist/rhythm-battle-poc/js/rhythm-battle-poc.js`
- Modify: `docs/13_rhythm_audio_data.md`

**Interfaces:**
- Produces: deployable debug build and exact Android comparison procedure

- [ ] **Step 1: Copy verified runtime files to the distribution folder**

Copy the development HTML as `index.html`, plus matching CSS and JavaScript. Verify SHA-256 equality for all three source/target pairs.

- [ ] **Step 2: Document the three-case comparison**

Record these URLs and test order in the canonical document:

1. Chrome, audible: `https://gerupon-lgtm.github.io/beat-poc/?debug=1`
2. Chrome, device volume 0: same URL after reload
3. LINE in-app browser, device volume 0: same URL after reload

Use the same song, chart, BPM, and hint setting. Capture the panel when lag becomes visible and again when taps stop.

- [ ] **Step 3: Run final verification**

Run full tests, syntax check for source and distribution JavaScript, SHA-256 comparisons, `git diff --check`, and confirm the normal URL keeps the panel hidden.

- [ ] **Step 4: Commit documentation**

```powershell
git add -- docs/13_rhythm_audio_data.md
git commit -m "時計診断の実機手順を文書化"
```
