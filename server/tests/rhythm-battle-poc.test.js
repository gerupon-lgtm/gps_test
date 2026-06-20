const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  judgeHit,
  buildNoteChart,
  buildHintEventsForBeat,
  buildHintCue,
  buildBassPartials,
  BASS_FILTER_FREQUENCY,
  calculateEnemyMaxHp,
  calculateEventAudioTime,
  calculateCalibrationOffset,
  applyTimingOffset,
  parseCalibrationRecord,
  formatCalibrationLabel,
  formatDefeatMessage,
  formatTimeoutMessage,
  normalizeBpm,
  countInDuration,
  calculateSongStartTime,
  buildCountInEvents,
  calculateVisualBeatState,
  isDebugMode,
  calculateClockDriftMs,
  isCompositorVisualMode,
  prefersCompositorVisuals,
  calculateVisualSongStartMs,
  calculateNoteAnimationDelayMs,
  SONG_DEFINITIONS,
  CHART_DEFINITIONS,
  applyGroove,
  buildSongBeatEvents,
  classifyBeatPhase,
  songBeatCount,
  songDurationSeconds,
  shouldScheduleBeat,
  calculateHitY,
  shouldConsumeNote,
  stopTrackedSources,
} = require("../../js/rhythm-battle-poc");

test("mobile layout prioritizes the play lane within one viewport", () => {
  const root = path.resolve(__dirname, "../..");
  const css = fs.readFileSync(path.join(root, "css/rhythm-battle-poc.css"), "utf8");
  const html = fs.readFileSync(path.join(root, "rhythm-battle-poc.html"), "utf8");

  assert.match(css, /min-height:\s*100dvh/);
  assert.match(css, /grid-template-columns:\s*minmax\(0,\s*1\.5fr\)\s+minmax\(0,\s*0\.75fr\)\s+52px\s+44px\s+68px/);
  assert.match(css, /height:\s*clamp\(300px,\s*calc\(100dvh\s*-\s*270px\),\s*510px\)/);
  assert.match(css, /grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /@media\s*\(max-width:\s*560px\)\s*and\s*\(max-height:\s*600px\)/);
  assert.match(html, /rhythm-battle-poc\.css\?v=14/);
  assert.match(html, /id="hint-toggle"[^>]*checked/);
  assert.match(html, /id="battle-result"/);
  assert.match(html, /rhythm-battle-poc\.js\?v=24/);
  assert.match(css, /\.battle-result\s*\{/);
  assert.match(html, /id="battle-result-title"/);
  assert.match(css, /\.battle-result\.timeout/);
  assert.match(html, /id="calibration-btn"/);
  assert.match(html, /id="calibration-panel"/);
  assert.match(html, /±80ms \/ ±180ms/);
  assert.match(html, /id="beat-guide"[^>]*aria-hidden="true"/);
  assert.equal((html.match(/class="beat-guide-step"/g) || []).length, 4);
  assert.equal((html.match(/class="beat-guide-flash"/g) || []).length, 4);
  assert.match(html, /class="hit-line"[^>]*>[\s\S]*?class="hit-line-flash"/);
  assert.match(css, /\.note\.phase-head\s*\{[\s\S]*?width:\s*22px[\s\S]*?height:\s*22px/);
  assert.match(css, /\.note\.phase-offbeat,[\s\S]*?\.note\.phase-swing\s*\{[\s\S]*?width:\s*22px[\s\S]*?height:\s*22px/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(html, /id="diagnostics-panel"[^>]*hidden[^>]*aria-live="off"/);
  assert.match(css, /\.diagnostics-panel\s*\{[\s\S]*?pointer-events:\s*none/);
  assert.match(fs.readFileSync(path.join(root, "js/rhythm-battle-poc.js"), "utf8"), /addEventListener\("pointerdown", attack\)/);
});

test("input event timestamp maps back to AudioContext time", () => {
  assert.equal(calculateEventAudioTime(10, 1000, 900), 9.9);
  assert.equal(calculateEventAudioTime(10, 1000, -100000), 10);
});

test("calibration uses a clamped median and shifts song time", () => {
  const samples = [96, 102, 98, 101, 99, 100, 240, -80];
  assert.equal(calculateCalibrationOffset(samples), 100);
  assert.equal(calculateCalibrationOffset([400, 410, 420]), 250);
  assert.equal(applyTimingOffset(0.5, 100), 0.4);
});

test("saved calibration is accepted only for the current version", () => {
  assert.deepEqual(parseCalibrationRecord('{"version":1,"offsetMs":100}', 1), { version: 1, offsetMs: 100 });
  assert.equal(parseCalibrationRecord('{"version":1,"offsetMs":100}', 2), null);
  assert.equal(parseCalibrationRecord('broken', 1), null);
});

test("a calibrated zero offset is distinct from an uncalibrated device", () => {
  assert.equal(formatCalibrationLabel(false, 0), "タイミング調整");
  assert.equal(formatCalibrationLabel(true, 0), "調整 0ms");
  assert.equal(formatCalibrationLabel(true, 100), "調整 +100ms");
});

test("enemy HP scales to seventy percent of each chart's perfect damage", () => {
  const expected = {
    basic: 420,
    offbeat: 420,
    technical: 622,
    sparse: 219,
    jazzBreak: 429,
  };
  for (const [patternId, hp] of Object.entries(expected)) {
    const chart = buildNoteChart({ bpm: 126, bars: 8, songId: "jazz", patternId });
    assert.equal(calculateEnemyMaxHp(chart, 0.7), hp, patternId);
  }
});

test("jazz break cannot be cleared before the long break at perfect accuracy", () => {
  const chart = buildNoteChart({ bpm: 126, bars: 8, songId: "jazz", patternId: "jazzBreak" });
  const hp = calculateEnemyMaxHp(chart, 0.7);
  const damageBeforeBreak = chart
    .filter((note) => note.beat < 16)
    .reduce((sum, note) => sum + 18 + (note.accent ? 6 : 0), 0);
  const firstAfterBreak = chart.find((note) => note.beat >= 26);

  assert.equal(damageBeforeBreak, 420);
  assert.ok(damageBeforeBreak < hp);
  assert.ok(damageBeforeBreak + 18 + (firstAfterBreak.accent ? 6 : 0) >= hp);
});

test("timeout message reports remaining dynamic HP", () => {
  assert.equal(formatTimeoutMessage(9, 429), "残りHP 9 / 429");
});

test("desktop header keeps the title horizontal in a compact two-row layout", () => {
  const root = path.resolve(__dirname, "../..");
  const css = fs.readFileSync(path.join(root, "css/rhythm-battle-poc.css"), "utf8");
  const html = fs.readFileSync(path.join(root, "rhythm-battle-poc.html"), "utf8");

  assert.match(html, /class="hero-copy"/);
  assert.match(css, /\.hero-copy\s*\{[^}]*grid-template-columns:\s*auto\s+auto\s+minmax\(0,\s*1fr\)/s);
  assert.match(css, /h1\s*\{[^}]*white-space:\s*nowrap/s);
  assert.match(css, /\.start-controls\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:\s*minmax\(0,\s*1\.4fr\)\s+minmax\(0,\s*1fr\)\s+72px\s+52px\s+90px/s);
});

test("hint cue adds an audible high root tone and short click", () => {
  const straight = buildHintCue("straight", 0);
  assert.equal(straight.frequency, 784);
  assert.equal(straight.durationSec, 0.11);
  assert.equal(straight.clickDurationSec, 0.025);
  assert.equal(straight.tonePeak, 0.075);
  assert.equal(straight.clickPeak, 0.045);

  for (const songId of Object.keys(SONG_DEFINITIONS)) {
    for (let beat = 0; beat < 32; beat += 1) {
      const cue = buildHintCue(songId, beat);
      assert.ok(cue.frequency >= 700 && cue.frequency <= 1400, `${songId}/${beat}`);
    }
  }
});

test("jazz mix exposes bass and piano on small speakers", () => {
  const events = buildSongBeatEvents("jazz", 0);
  const bass = events.find((event) => event.type === "bass");
  const piano = events.find((event) => event.type === "piano");

  assert.equal(bass.peak, 0.2);
  assert.equal(piano.peak, 0.075);
  assert.equal(BASS_FILTER_FREQUENCY, 700);
  assert.deepEqual(buildBassPartials(0.2), [
    { ratio: 1, peak: 0.2, durationRatio: 1 },
    { ratio: 2, peak: 0.072, durationRatio: 0.68 },
    { ratio: 3, peak: 0.024, durationRatio: 0.46 },
  ]);
});

test("calibration cue stays louder than the subtle gameplay hint", () => {
  const root = path.resolve(__dirname, "../..");
  const js = fs.readFileSync(path.join(root, "js/rhythm-battle-poc.js"), "utf8");
  assert.match(js, /tonePeak:\s*0\.3,\s*clickPeak:\s*0\.24/);
});

test("straight song makes every quarter-note head clear without pitched offbeats", () => {
  for (let beat = 0; beat < 32; beat += 1) {
    const events = buildSongBeatEvents("straight", beat);
    assert.equal(events.some((event) => event.type === "hat" && event.offsetBeats === 0 && event.strong), true);
    assert.equal(events.some((event) => event.type === "tone" && event.offsetBeats === 0.5), false);
  }
});

test("hint events use the exact selected chart note times", () => {
  const basic = buildNoteChart({ bpm: 120, bars: 1, songId: "straight", patternId: "basic" });
  const offbeat = buildNoteChart({ bpm: 120, bars: 1, songId: "straight", patternId: "offbeat" });

  assert.deepEqual(buildHintEventsForBeat(basic, 0), [{ noteId: 0, time: 0 }]);
  assert.deepEqual(buildHintEventsForBeat(basic, 1), [{ noteId: 1, time: 0.5 }]);
  assert.deepEqual(buildHintEventsForBeat(offbeat, 0), [{ noteId: 0, time: 0.25 }]);
});

test("defeat message includes the final score and combo", () => {
  assert.equal(formatDefeatMessage(3600, 7), "スコア 3600 / 7コンボ");
});

test("note timing uses the visible hit-line center at every lane height", () => {
  assert.equal(calculateHitY(258, 4), 260);
  assert.equal(calculateHitY(116, 4), 118);
});

test("an out-of-window tap does not consume the next note", () => {
  const windows = { perfectMs: 55, goodMs: 120 };
  assert.equal(shouldConsumeNote(121, windows), false);
  assert.equal(shouldConsumeNote(-121, windows), false);
  assert.equal(shouldConsumeNote(120, windows), true);
});

test("eight bars schedule exactly 32 beats", () => {
  assert.equal(songBeatCount(8, 4), 32);
  assert.equal(shouldScheduleBeat(31, 8, 4), true);
  assert.equal(shouldScheduleBeat(32, 8, 4), false);
  assert.equal(songDurationSeconds(120, 8, 4), 16);
});

test("tracked audio sources are all cleared even when one is already stopped", () => {
  let stopped = 0;
  const sources = new Set([
    { stop() { stopped += 1; } },
    { stop() { throw new Error("already stopped"); } },
    { stop() { stopped += 1; } },
  ]);
  assert.equal(stopTrackedSources(sources), 2);
  assert.equal(stopped, 2);
  assert.equal(sources.size, 0);
});

test("classifyBeatPhase separates head, straight offbeat, and swing offbeat", () => {
  assert.equal(classifyBeatPhase(1, "straight"), "head");
  assert.equal(classifyBeatPhase(1.5, "straight"), "offbeat");
  assert.equal(classifyBeatPhase(1.5, "shuffle"), "swing");
});

test("generated charts carry visible phase information", () => {
  const basic = buildNoteChart({ bpm: 120, bars: 1, songId: "straight", patternId: "basic" });
  const offbeat = buildNoteChart({ bpm: 120, bars: 1, songId: "straight", patternId: "offbeat" });
  const swing = buildNoteChart({ bpm: 120, bars: 1, songId: "jazz", patternId: "offbeat" });
  assert.equal(basic.every((note) => note.phase === "head"), true);
  assert.equal(offbeat.every((note) => note.phase === "offbeat"), true);
  assert.equal(swing.every((note) => note.phase === "swing"), true);
});

test("PoC exposes five songs and five tap chart patterns", () => {
  assert.deepEqual(Object.keys(SONG_DEFINITIONS), [
    "straight", "syncopated", "shuffle", "minimal", "jazz",
  ]);
  assert.deepEqual(Object.keys(CHART_DEFINITIONS), [
    "basic", "offbeat", "technical", "sparse", "jazzBreak",
  ]);
});

test("applyGroove places eighth-note offbeats differently for shuffle", () => {
  assert.equal(applyGroove(1.5, "straight"), 1.5);
  assert.equal(applyGroove(1.5, "shuffle"), 1 + 2 / 3);
});

test("offbeat chart follows the selected song groove", () => {
  const straight = buildNoteChart({ bpm: 120, bars: 1, songId: "straight", patternId: "offbeat" });
  const shuffle = buildNoteChart({ bpm: 120, bars: 1, songId: "shuffle", patternId: "offbeat" });
  assert.equal(straight[0].beat, 0.5);
  assert.equal(straight[0].time, 0.25);
  assert.equal(shuffle[0].beat, 2 / 3);
  assert.ok(Math.abs(shuffle[0].time - 1 / 3) < 1e-9);
});

test("all song and tap chart combinations create ordered notes", () => {
  for (const songId of Object.keys(SONG_DEFINITIONS)) {
    for (const patternId of Object.keys(CHART_DEFINITIONS)) {
      const chart = buildNoteChart({ bpm: 126, bars: 2, songId, patternId });
      assert.ok(chart.length > 0, `${songId}/${patternId} should contain notes`);
      assert.equal(chart.every((note, index) => index === 0 || note.time > chart[index - 1].time), true);
    }
  }
});

test("sparse chart leaves more space than the basic chart", () => {
  const basic = buildNoteChart({ bpm: 120, bars: 8, songId: "minimal", patternId: "basic" });
  const sparse = buildNoteChart({ bpm: 120, bars: 8, songId: "minimal", patternId: "sparse" });
  assert.ok(sparse.length < basic.length);
  assert.equal(sparse.length, 16);
});

test("jazz break chart has a long rest followed by a late re-entry", () => {
  const chart = buildNoteChart({ bpm: 120, bars: 8, songId: "jazz", patternId: "jazzBreak" });
  const notesDuringBreak = chart.filter((note) => note.beat >= 16 && note.beat < 26);
  const firstAfterBreak = chart.find((note) => note.beat >= 26);
  assert.equal(notesDuringBreak.length, 0);
  assert.ok(firstAfterBreak.beat >= 26 + 2 / 3);
  assert.ok(chart.filter((note) => note.beat >= 28).length >= 8);
});

test("straight song uses even eighth-note subdivision", () => {
  const events = buildSongBeatEvents("straight", 0);
  assert.equal(events.some((event) => event.type === "kick" && event.offsetBeats === 0), true);
  assert.equal(events.some((event) => event.type === "hat" && event.offsetBeats === 0.5), true);
});

test("syncopated song accents the eighth-note offbeat", () => {
  const events = buildSongBeatEvents("syncopated", 0);
  assert.equal(events.some((event) => event.type === "tone" && event.offsetBeats === 0.5), true);
  assert.equal(events.some((event) => event.type === "hat" && event.offsetBeats === 0.5 && event.strong), true);
});

test("shuffle song moves its offbeat to the third triplet", () => {
  const events = buildSongBeatEvents("shuffle", 0);
  assert.equal(events.some((event) => event.type === "hat" && event.offsetBeats === 2 / 3), true);
  assert.equal(events.some((event) => event.type === "tone" && event.offsetBeats === 2 / 3), true);
});

test("minimal song keeps its event count sparse", () => {
  const barEvents = Array.from({ length: 4 }, (_, index) => buildSongBeatEvents("minimal", index));
  assert.ok(barEvents.flat().length <= 8);
  assert.equal(barEvents.some((events) => events.length === 0), true);
});

test("jazz plays one running-bass note on every quarter note", () => {
  const beats = Array.from({ length: 32 }, (_, index) => buildSongBeatEvents("jazz", index));
  assert.equal(beats.every((events) => events.filter((event) => event.type === "bass").length === 1), true);
  assert.equal(beats.every((events) => events.find((event) => event.type === "bass").offsetBeats === 0), true);
  assert.equal(beats.every((events) => events.find((event) => event.type === "bass").durationBeats >= 0.8), true);
});

test("jazz repeats the ii-V-I-VI progression for eight continuous bars", () => {
  const pianos = Array.from({ length: 8 }, (_, bar) => buildSongBeatEvents("jazz", bar * 4)
    .find((event) => event.type === "piano"));
  assert.deepEqual(
    pianos.map((event) => event.name),
    ["Dm7", "G7", "Cmaj7", "A7(b9)", "Dm7", "G7", "Cmaj7", "A7(b9)"]
  );
});

test("jazz piano plays one whole-note chord only at each bar start", () => {
  for (let beat = 0; beat < 32; beat += 1) {
    const pianos = buildSongBeatEvents("jazz", beat).filter((event) => event.type === "piano");
    assert.equal(pianos.length, beat % 4 === 0 ? 1 : 0);
    if (pianos.length) {
      assert.equal(pianos[0].offsetBeats, 0);
      assert.ok(pianos[0].durationBeats >= 3.5);
    }
  }
});

test("jazz bass uses different lines in the second chorus", () => {
  const lineAt = (bar) => Array.from({ length: 4 }, (_, beat) => buildSongBeatEvents("jazz", bar * 4 + beat)
    .find((event) => event.type === "bass").frequency);
  assert.notDeepEqual(lineAt(0), lineAt(4));
  assert.notDeepEqual(lineAt(1), lineAt(5));
  assert.notDeepEqual(lineAt(2), lineAt(6));
  assert.notDeepEqual(lineAt(3), lineAt(7));
});

test("jazz contains no percussion, bar accents, or piano responses", () => {
  const events = Array.from({ length: 32 }, (_, index) => buildSongBeatEvents("jazz", index)).flat();
  const forbidden = new Set(["kick", "snare", "hat", "ride", "brush", "barAccent", "pianoNote"]);
  assert.equal(events.some((event) => forbidden.has(event.type)), false);
  assert.equal(events.some((event) => event.type === "tone" && event.wave === "triangle"), false);
});

test("normalizeBpm rounds and clamps the BPM input", () => {
  assert.equal(normalizeBpm("126.6", 80, 180), 127);
  assert.equal(normalizeBpm("40", 80, 180), 80);
  assert.equal(normalizeBpm("220", 80, 180), 180);
  assert.equal(normalizeBpm("invalid", 80, 180), 80);
});

test("four quarter-note count-in determines the song start time", () => {
  assert.equal(countInDuration(120, 4), 2);
  assert.equal(calculateSongStartTime(10.5, 120, 4), 12.5);
});

test("two-bar count-in adds half-note counts before the quarter-note count", () => {
  assert.deepEqual(buildCountInEvents(), [
    { beatOffset: 0, label: 1, guideIndex: 0 },
    { beatOffset: 2, label: 2, guideIndex: 2 },
    { beatOffset: 4, label: 1, guideIndex: 0 },
    { beatOffset: 5, label: 2, guideIndex: 1 },
    { beatOffset: 6, label: 3, guideIndex: 2 },
    { beatOffset: 7, label: 4, guideIndex: 3 },
  ]);
  assert.equal(countInDuration(120, 8), 4);
  assert.equal(calculateSongStartTime(10.5, 120, 8), 14.5);
});

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

test("diagnostic mode is enabled only by debug=1", () => {
  assert.equal(isDebugMode("?debug=1"), true);
  assert.equal(isDebugMode("?debug=0"), false);
  assert.equal(isDebugMode(""), false);
});

test("clock diagnostics report wall time ahead of audio time", () => {
  assert.equal(calculateClockDriftMs(8.25, 8.5), 250);
  assert.equal(calculateClockDriftMs(Number.NaN, 8.5), 0);
});

test("compositor visuals are opt-in and share an exact song anchor", () => {
  assert.equal(isCompositorVisualMode("?visual=compositor"), true);
  assert.equal(isCompositorVisualMode("?debug=1&visual=compositor"), true);
  assert.equal(isCompositorVisualMode(""), false);
  assert.equal(isCompositorVisualMode("?visual=raf"), false);
  assert.equal(calculateVisualSongStartMs(1000, 4, 6.5), 3500);
  assert.equal(calculateVisualSongStartMs(Number.NaN, 4, 6.5), 0);
  assert.equal(calculateNoteAnimationDelayMs(3500, 3, 2, 1000), 3500);
  assert.equal(calculateNoteAnimationDelayMs(3500, 0, 2, 1000), 500);
  assert.equal(calculateNoteAnimationDelayMs(3500, Number.NaN, 2, 1000), 0);
});

test("compositor visuals are default while raf remains opt-in", () => {
  assert.equal(prefersCompositorVisuals(""), true);
  assert.equal(prefersCompositorVisuals("?debug=1"), true);
  assert.equal(prefersCompositorVisuals("?visual=compositor"), true);
  assert.equal(prefersCompositorVisuals("?visual=raf"), false);
});

test("runtime drives and resets the visual beat guide from the shared clock", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../../js/rhythm-battle-poc.js"), "utf8");
  assert.match(source, /calculateVisualBeatState\(now,\s*SETTINGS\.bpm\)/);
  assert.match(source, /updateVisualBeatGuide\(visualBeat\.beatIndex,\s*visualBeat\.pulse\)/);
  assert.match(source, /function resetVisualBeatGuide\(\)/);
  assert.match(source, /function stopPlayback\(\)[\s\S]*?resetVisualBeatGuide\(\)/);
});

test("diagnostic runtime collects silently and renders only the final summary", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../../js/rhythm-battle-poc.js"), "utf8");
  assert.match(source, /function showDiagnosticsSummary\(reason\)/);
  assert.match(source, /if \(!state\.debugEnabled \|\| !state\.debugSessionActive\) return/);
  assert.match(source, /frameGapMs > 50/);
  assert.match(source, /debugSongStartWallMs\s*=\s*performance\.now\(\)/);
  assert.match(source, /calculateClockDriftMs\(audioSongTime,\s*wallSongTime\)/);
  assert.match(source, /addEventListener\("statechange"/);
  assert.match(source, /showDiagnosticsSummary\("timeout"\)/);
  assert.match(source, /showDiagnosticsSummary\("victory"\)/);
  assert.match(source, /debugMaxAbsDriftMs\s*=\s*Math\.max/);
  assert.match(source, /debugStateChanges\.push/);
  assert.match(source, /debugRenderMaxMs\s*=\s*Math\.max/);
  assert.match(source, /renderDurationMs > 8/);
  assert.match(source, /debugSchedulerMaxGapMs\s*=\s*Math\.max/);
  assert.match(source, /schedulerGapMs > 75/);
  assert.match(source, /renderMax=/);
  assert.match(source, /timerMax=/);
  assert.match(source, /visual=/);
  assert.doesNotMatch(source, /debugLastPanelUpdateMs/);
});

test("visual rendering stays on rAF without a watchdog timer", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../../js/rhythm-battle-poc.js"), "utf8");
  assert.match(source, /function renderVisual\(frameTime\)/);
  assert.match(source, /function render\(frameTime\)[\s\S]*?sampleDiagnosticsFrame\(currentFrameTime\)[\s\S]*?renderVisual\(currentFrameTime\)/);
  assert.match(source, /state\.raf\s*=\s*requestAnimationFrame\(render\)/);
  assert.doesNotMatch(source, /visualWatchdog|shouldRunVisualFallback|lastVisualRenderMs|fallback=/);
});

test("compositor mode pre-creates note animations and keeps rAF as fallback", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../../js/rhythm-battle-poc.js"), "utf8");
  assert.match(source, /function prepareCompositorNotes\(songStartMs\)/);
  assert.match(source, /calculateNoteAnimationDelayMs\(\s*songStartMs,/);
  assert.match(source, /\.animate\([\s\S]*?translate3d/);
  assert.match(source, /className = "note-motion compositor-note-motion"/);
  assert.match(source, /motionEl\.appendChild\(noteEl\)/);
  assert.match(source, /easing:\s*"linear"/);
  assert.match(source, /state\.visualAnimations\.push\(animation\)/);
  assert.match(source, /function cancelVisualAnimations\(\)/);
  assert.match(source, /function stopPlayback\(\)[\s\S]*?cancelVisualAnimations\(\)/);
  assert.match(source, /if \(state\.compositorVisuals\) continue/);
  assert.match(source, /prepareCompositorNotes\(state\.visualSongStartMs\)/);
});

test("compositor beat guide repeats four quarter-note animations on the shared anchor", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../../js/rhythm-battle-poc.js"), "utf8");
  assert.match(source, /function prepareCompositorBeatGuide\(songStartMs\)/);
  assert.match(source, /querySelectorAll\("\.beat-guide-step"\)/);
  assert.match(source, /iterations:\s*Infinity/);
  assert.match(source, /duration:\s*barMs/);
  assert.match(source, /prepareCompositorBeatGuide\(state\.visualSongStartMs\)/);
  assert.match(source, /!state\.countingIn && !state\.compositorVisuals/);
  assert.match(source, /classList\.remove\("compositor-guide"\)/);
});

test("compositor beat guide and TAP line animate dedicated glow layers", () => {
  const root = path.resolve(__dirname, "../..");
  const source = fs.readFileSync(path.join(root, "js/rhythm-battle-poc.js"), "utf8");
  const css = fs.readFileSync(path.join(root, "css/rhythm-battle-poc.css"), "utf8");
  assert.match(source, /step\.querySelector\("\.beat-guide-flash"\)/);
  assert.match(source, /function prepareCompositorHitLine\(songStartMs\)/);
  assert.match(source, /querySelector\("\.hit-line-flash"\)/);
  assert.match(source, /prepareCompositorHitLine\(state\.visualSongStartMs\)/);
  assert.match(css, /\.beat-guide-flash[\s\S]*?background:\s*var\(--gold\)/);
  assert.match(css, /\.hit-line-flash[\s\S]*?will-change:\s*transform,\s*opacity/);
});

test("judged and end-of-battle notes are removed from DOM and state", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../../js/rhythm-battle-poc.js"), "utf8");
  assert.match(source, /function removeNoteElement\(noteId\)/);
  assert.match(source, /noteEl\.remove\(\)[\s\S]*?state\.noteEls\.delete\(noteId\)/);
  assert.match(source, /function clearVisualNotes\(\)/);
  assert.match(source, /shouldConsumeNote[\s\S]*?removeNoteElement\(nearest\.note\.id\)/);
  assert.match(source, /note\.missed = true[\s\S]*?removeNoteElement\(note\.id\)/);
  assert.match(source, /state\.enemyHp <= 0[\s\S]*?clearVisualNotes\(\)/);
  assert.ok((source.match(/clearVisualNotes\(\)/g) || []).length >= 4);
});

test("judgeHit returns perfect for very close timing", () => {
  assert.deepEqual(judgeHit(10, { perfectMs: 55, goodMs: 120 }), {
    label: "PERFECT",
    rank: "perfect",
    damage: 18,
  });
});

test("judgeHit returns good for medium timing", () => {
  assert.deepEqual(judgeHit(-90, { perfectMs: 55, goodMs: 120 }), {
    label: "GOOD",
    rank: "good",
    damage: 10,
  });
});

test("judgeHit returns miss outside window", () => {
  assert.deepEqual(judgeHit(150, { perfectMs: 55, goodMs: 120 }), {
    label: "MISS",
    rank: "miss",
    damage: 0,
  });
});

test("buildNoteChart creates a varied 16-beat chart", () => {
  const chart = buildNoteChart({ bpm: 120, bars: 4 });
  assert.equal(chart.length, 16);
  assert.equal(chart[0].accent, true);
  assert.equal(chart.some((n) => n.lane === 1), true);
  assert.equal(chart.some((n) => n.lane === -1), true);
});
