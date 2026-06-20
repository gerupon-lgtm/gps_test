# Visual Beat Guide Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an always-visible four-beat guide and quarter-note hit-line pulse to the rhythm battle PoC while reducing every note type to 22px.

**Architecture:** Keep `AudioContext.currentTime` and `state.startTime` as the only playback clock. A pure helper converts song time and BPM into a beat index, beat progress, and short pulse flag; the existing render loop applies that state to four static guide elements and the hit line. Count-in timers use the same guide updater, and all playback exits reset it.

**Tech Stack:** Vanilla HTML, CSS, JavaScript, Web Audio API, Node.js built-in test runner

## Global Constraints

- Show the visual guide for both audible and silent play without another user setting.
- Keep chart data, judgment windows, damage, scoring, enemy HP, hint audio, and calibration unchanged.
- Use four quarter-note guide cells; do not reveal offbeat, swing, or syncopated hit timings through the guide.
- Use 22px by 22px for head, offbeat, and swing notes.
- Use `AudioContext.currentTime`, `state.startTime`, and BPM as the playback timing source; do not add an independent CSS timing loop.
- Respect `prefers-reduced-motion: reduce` and do not flash the whole lane.

---

### Task 1: Beat-state calculation

**Files:**
- Modify: `server/tests/rhythm-battle-poc.test.js`
- Modify: `js/rhythm-battle-poc.js`

**Interfaces:**
- Consumes: `beatSeconds(bpm: number): number`
- Produces: `calculateVisualBeatState(songTime: number, bpm: number, beatsPerBar?: number, pulseSeconds?: number): { beatIndex: number, progress: number, pulse: boolean }`

- [ ] **Step 1: Write failing beat-state tests**

Add `calculateVisualBeatState` to the destructured imports and add:

```js
test("visual beat state follows the audio-clock beat within each bar", () => {
  assert.deepEqual(calculateVisualBeatState(0, 120), {
    beatIndex: 0,
    progress: 0,
    pulse: true,
  });
  assert.deepEqual(calculateVisualBeatState(1.75, 120), {
    beatIndex: 3,
    progress: 0.5,
    pulse: false,
  });
  assert.equal(calculateVisualBeatState(2, 120).beatIndex, 0);
});

test("visual beat pulse lasts for a fixed short window", () => {
  assert.equal(calculateVisualBeatState(0.119, 120).pulse, true);
  assert.equal(calculateVisualBeatState(0.121, 120).pulse, false);
  assert.deepEqual(calculateVisualBeatState(-0.1, 120), {
    beatIndex: -1,
    progress: 0,
    pulse: false,
  });
});
```

- [ ] **Step 2: Run tests and confirm the new import fails**

Run: `node --test server\tests\rhythm-battle-poc.test.js`

Expected: FAIL because `calculateVisualBeatState` is not exported.

- [ ] **Step 3: Implement and export the pure helper**

Add beside the existing timing helpers:

```js
function calculateVisualBeatState(songTime, bpm, beatsPerBar = 4, pulseSeconds = 0.12) {
  if (!Number.isFinite(songTime) || songTime < 0) {
    return { beatIndex: -1, progress: 0, pulse: false };
  }
  const beat = beatSeconds(bpm);
  const elapsedBeats = songTime / beat;
  const wholeBeats = Math.floor(elapsedBeats);
  const progress = elapsedBeats - wholeBeats;
  return {
    beatIndex: wholeBeats % beatsPerBar,
    progress,
    pulse: progress * beat < pulseSeconds,
  };
}
```

Add `calculateVisualBeatState` to `module.exports`.

- [ ] **Step 4: Run tests and confirm they pass**

Run: `node --test server\tests\rhythm-battle-poc.test.js`

Expected: all existing tests plus the two new tests PASS.

- [ ] **Step 5: Commit the helper and tests**

```powershell
git add -- js/rhythm-battle-poc.js server/tests/rhythm-battle-poc.test.js
git commit -m "視覚ビート状態の計算を追加"
```

### Task 2: Guide markup and unified note sizing

**Files:**
- Modify: `rhythm-battle-poc.html`
- Modify: `css/rhythm-battle-poc.css`
- Modify: `server/tests/rhythm-battle-poc.test.js`

**Interfaces:**
- Produces: `#beat-guide` containing four `.beat-guide-step` elements
- Produces: `.beat-guide-step.active` and `.lane.beat-pulse` visual states
- Consumes later: Task 3 updates these classes from JavaScript

- [ ] **Step 1: Write failing static structure and sizing tests**

Extend the existing layout test with:

```js
assert.match(html, /id="beat-guide"[^>]*aria-hidden="true"/);
assert.equal((html.match(/class="beat-guide-step"/g) || []).length, 4);
assert.match(css, /\.note\.phase-head[\s\S]*?width:\s*22px[\s\S]*?height:\s*22px/);
assert.match(css, /\.note\.phase-offbeat,[\s\S]*?\.note\.phase-swing[\s\S]*?width:\s*22px[\s\S]*?height:\s*22px/);
assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
```

- [ ] **Step 2: Run the layout test and confirm failure**

Run: `node --test --test-name-pattern="mobile layout" server\tests\rhythm-battle-poc.test.js`

Expected: FAIL because the guide markup and 22px dimensions are absent.

- [ ] **Step 3: Add four guide cells inside the lane**

Add after `.hit-line` in `rhythm-battle-poc.html`:

```html
<div id="beat-guide" class="beat-guide" aria-hidden="true">
  <span class="beat-guide-step"></span>
  <span class="beat-guide-step"></span>
  <span class="beat-guide-step"></span>
  <span class="beat-guide-step"></span>
</div>
```

- [ ] **Step 4: Add guide, pulse, and note-size CSS**

Change every phase note to `width: 22px`, `height: 22px`, `margin-left: -11px`, and `margin-top: -11px`. Retain phase-specific shape and color, reduce the swing `♪` to `0.75rem`, and keep `.note.accent` at the same size with outline and glow.

Add:

```css
.beat-guide {
  position: absolute;
  z-index: 4;
  left: 10%;
  right: 10%;
  bottom: 14px;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
  pointer-events: none;
}

.beat-guide-step {
  height: 8px;
  border: 1px solid rgba(148, 163, 184, 0.58);
  border-radius: 999px;
  background: rgba(51, 65, 85, 0.82);
  transition: transform 80ms ease-out, background-color 80ms ease-out, box-shadow 80ms ease-out;
}

.beat-guide-step.active {
  transform: scaleY(1.5);
  border-color: #fef08a;
  background: var(--gold);
  box-shadow: 0 0 14px rgba(250, 204, 21, 0.88);
}

.lane.beat-pulse .hit-line {
  box-shadow: 0 0 30px 7px rgba(250, 204, 21, 0.88);
}

@media (prefers-reduced-motion: reduce) {
  .beat-guide-step { transition: none; }
  .beat-guide-step.active { transform: none; }
}
```

- [ ] **Step 5: Bump local asset cache versions**

Change the stylesheet URL to `rhythm-battle-poc.css?v=11` and the script URL to `rhythm-battle-poc.js?v=16`. Update existing cache-version assertions in the layout test.

- [ ] **Step 6: Run the layout test and confirm it passes**

Run: `node --test --test-name-pattern="mobile layout" server\tests\rhythm-battle-poc.test.js`

Expected: PASS.

- [ ] **Step 7: Commit markup and styling**

```powershell
git add -- rhythm-battle-poc.html css/rhythm-battle-poc.css server/tests/rhythm-battle-poc.test.js
git commit -m "視覚ビートガイドの表示を追加"
```

### Task 3: Audio-clock-driven DOM updates and lifecycle reset

**Files:**
- Modify: `js/rhythm-battle-poc.js`
- Modify: `server/tests/rhythm-battle-poc.test.js`

**Interfaces:**
- Consumes: `calculateVisualBeatState(songTime, bpm)` from Task 1
- Consumes: `#beat-guide`, `.beat-guide-step`, and `.lane.beat-pulse` from Task 2
- Produces: `updateVisualBeatGuide(beatIndex: number, pulse: boolean): void`
- Produces: `resetVisualBeatGuide(): void`

- [ ] **Step 1: Write failing source-contract tests**

Add a test that reads `js/rhythm-battle-poc.js` and verifies the runtime uses the shared helper and resets the guide:

```js
test("runtime drives and resets the visual beat guide from the shared clock", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../../js/rhythm-battle-poc.js"), "utf8");
  assert.match(source, /calculateVisualBeatState\(now,\s*SETTINGS\.bpm\)/);
  assert.match(source, /updateVisualBeatGuide\(visualBeat\.beatIndex,\s*visualBeat\.pulse\)/);
  assert.match(source, /function resetVisualBeatGuide\(\)/);
  assert.match(source, /function stopPlayback\(\)[\s\S]*?resetVisualBeatGuide\(\)/);
});
```

- [ ] **Step 2: Run the contract test and confirm failure**

Run: `node --test --test-name-pattern="runtime drives" server\tests\rhythm-battle-poc.test.js`

Expected: FAIL because the DOM updater and lifecycle reset do not exist.

- [ ] **Step 3: Add guide update and reset functions**

Add in the browser-only section:

```js
function updateVisualBeatGuide(beatIndex, pulse) {
  const guide = $("beat-guide");
  if (!guide) return;
  for (const [index, step] of Array.from(guide.children).entries()) {
    step.classList.toggle("active", index === beatIndex);
  }
  $("lane").classList.toggle("beat-pulse", Boolean(pulse));
}

function resetVisualBeatGuide() {
  updateVisualBeatGuide(-1, false);
}
```

- [ ] **Step 4: Connect count-in, render, and stop paths**

In each count-in timer callback call `updateVisualBeatGuide(index, true)`, then schedule `updateVisualBeatGuide(index, false)` 120ms later through `state.countTimers`. When `START!` is shown, call `updateVisualBeatGuide(0, true)`; the render loop then controls the pulse from the shared clock.

In `render()`, after calculating `now`, add:

```js
const visualBeat = calculateVisualBeatState(now, SETTINGS.bpm);
if (!state.countingIn) {
  updateVisualBeatGuide(visualBeat.beatIndex, visualBeat.pulse);
}
```

Call `resetVisualBeatGuide()` from `stopPlayback()` after timers and animation frames are cleared, and from `resetBattle()` so READY is visually idle.

- [ ] **Step 5: Run the contract test and full suite**

Run: `node --test --test-name-pattern="runtime drives" server\tests\rhythm-battle-poc.test.js`

Expected: PASS.

Run: `node --test server\tests\rhythm-battle-poc.test.js`

Expected: all tests PASS.

- [ ] **Step 6: Commit runtime synchronization**

```powershell
git add -- js/rhythm-battle-poc.js server/tests/rhythm-battle-poc.test.js
git commit -m "視覚ガイドを音声時計へ同期"
```

### Task 4: Documentation and end-to-end verification

**Files:**
- Modify: `docs/13_rhythm_audio_data.md`
- Modify: `docs/14_rhythm_poc_handoff.md`
- Verify: `rhythm-battle-poc.html`
- Verify: `css/rhythm-battle-poc.css`
- Verify: `js/rhythm-battle-poc.js`

**Interfaces:**
- Consumes: completed visual guide behavior from Tasks 1-3
- Produces: current runbook and handoff state matching the implementation

- [ ] **Step 1: Update the audio/data specification**

Document that the four-cell guide and hit-line pulse are always visible, derive from the same audio clock as notes and judgment, and expose only quarter-note position. Record the unified 22px note size and reduced-motion behavior.

- [ ] **Step 2: Update the handoff document**

Add the visual guide under implemented display behavior, change asset cache numbers to CSS `v=11` and JavaScript `v=16`, and update the latest test count from the actual final test output.

- [ ] **Step 3: Run automated verification**

Run:

```powershell
node --test server\tests\rhythm-battle-poc.test.js
node --check js\rhythm-battle-poc.js
git diff --check
```

Expected: all tests PASS, syntax check exits 0, and diff check prints no errors.

- [ ] **Step 4: Perform visual verification**

Open `rhythm-battle-poc.html` and verify at desktop and narrow mobile widths:

- READY shows four idle guide cells.
- Count-in lights cells 1, 2, 3, 4 in order.
- Playback returns to cell 1 at each bar start.
- The hit line glows briefly on each quarter note without flashing the whole lane.
- All note phases are the same 22px size and dense charts retain visible space.
- Defeat, timeout, restart, and reduced-motion mode leave no stale active cell or pulse.

- [ ] **Step 5: Commit documentation and verified state**

```powershell
git add -- docs/13_rhythm_audio_data.md docs/14_rhythm_poc_handoff.md
git commit -m "視覚ビートガイド仕様を文書化"
```
