# Clock Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `?debug=1`-only on-screen diagnostic panel that distinguishes audio-clock drift, frame stalls, AudioContext state changes, and early battle termination on Android Chrome.

**Architecture:** Pure helpers calculate debug enablement and clock drift and remain testable under Node.js. Browser-only code records a performance-clock anchor, frame gaps, maximum drift, and AudioContext state changes in memory without updating the DOM during play. It renders one non-interactive summary only after victory or time-out; normal URLs exit the diagnostic path immediately.

**Tech Stack:** Vanilla HTML, CSS, JavaScript, Web Audio API, Node.js built-in test runner

## Global Constraints

- Enable diagnostics only when the query string contains `debug=1`.
- Do not change chart timing, judgment, scoring, damage, enemy HP, audio scheduling, or song-end behavior.
- Do not transmit or persist diagnostic values.
- Keep the panel non-interactive with `pointer-events: none`.
- Do not update diagnostic DOM during active play; show one summary after victory or time-out.
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

Use the same song, chart, BPM, and hint setting. Capture the final summary after victory or time-out.

- [ ] **Step 3: Run final verification**

Run full tests, syntax check for source and distribution JavaScript, SHA-256 comparisons, `git diff --check`, and confirm the normal URL keeps the panel hidden.

- [ ] **Step 4: Commit documentation**

```powershell
git add -- docs/13_rhythm_audio_data.md
git commit -m "時計診断の実機手順を文書化"
```

### Task 4: Low-overhead end-of-battle summary

**Files:**
- Modify: `server/tests/rhythm-battle-poc.test.js`
- Modify: `js/rhythm-battle-poc.js`
- Modify: `rhythm-battle-poc.html`
- Modify: `docs/13_rhythm_audio_data.md`
- Modify distribution copies under `dist/rhythm-battle-poc/`

**Interfaces:**
- Replaces: `updateDiagnosticsPanel(frameTime, force)` during active play
- Produces: `showDiagnosticsSummary(reason: "victory" | "timeout"): void`
- Adds state: `debugSessionActive`, `debugMaxAbsDriftMs`, `debugFinalDriftMs`, `debugStateChanges`

- [ ] **Step 1: Rewrite the runtime contract test to fail on the current live panel**

Require `showDiagnosticsSummary("timeout")`, `showDiagnosticsSummary("victory")`, maximum absolute drift collection, and state-change history. Reject the old 250ms panel refresh path.

```js
assert.match(source, /function showDiagnosticsSummary\(reason\)/);
assert.match(source, /showDiagnosticsSummary\("timeout"\)/);
assert.match(source, /showDiagnosticsSummary\("victory"\)/);
assert.match(source, /debugMaxAbsDriftMs\s*=\s*Math\.max/);
assert.match(source, /debugStateChanges\.push/);
assert.doesNotMatch(source, /debugLastPanelUpdateMs/);
```

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `node --test --test-name-pattern="diagnostic runtime" server\tests\rhythm-battle-poc.test.js`

Expected: FAIL because the current implementation still updates the panel every 250ms.

- [ ] **Step 3: Collect diagnostics without DOM writes**

Remove `debugLastPanelUpdateMs` and `updateDiagnosticsPanel`. During each debug frame, update only numeric state:

```js
const driftMs = calculateClockDriftMs(audioSongTime, wallSongTime);
state.debugFinalDriftMs = driftMs;
state.debugMaxAbsDriftMs = Math.max(state.debugMaxAbsDriftMs, Math.abs(driftMs));
```

Keep the panel hidden from battle start through active play. Record AudioContext state transitions by appending a new state only when it differs from the last recorded state.

- [ ] **Step 4: Render one final summary**

`showDiagnosticsSummary(reason)` calculates final audio and wall times, sets `debugSessionActive=false`, and writes the panel once. Call it after `stopPlayback()` in `finishSong()` with `"timeout"` and in the victory branch with `"victory"`.

The summary includes user agent, reason, final and maximum drift, maximum frame gap, 50ms count, latencies, state history, running flag, and last tap.

- [ ] **Step 5: Bump JavaScript cache and update documentation**

Change JavaScript to `v=18` in development and distribution HTML. Update tests and canonical documentation to say diagnostics are collected silently and shown only after battle end.

- [ ] **Step 6: Run full verification and copy distribution files**

Run all tests and both JavaScript syntax checks, then copy source HTML/CSS/JavaScript to `dist/rhythm-battle-poc/` and verify SHA-256 equality.

- [ ] **Step 7: Commit the low-overhead diagnostics**

```powershell
git add -- rhythm-battle-poc.html js/rhythm-battle-poc.js server/tests/rhythm-battle-poc.test.js docs/13_rhythm_audio_data.md docs/superpowers/plans/2026-06-20-rhythm-poc-clock-diagnostics.md
git commit -m "診断結果を戦闘終了後だけ表示"
```
