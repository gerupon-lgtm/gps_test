# Compositor Visuals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an opt-in compositor-driven note and beat-guide mode for Android volume-zero testing without changing default rAF behavior.

**Architecture:** Pure helpers select the URL mode and calculate animation start offsets. Browser code pre-creates note animations and four repeating guide animations from one performance-time song anchor; rAF remains the fallback and continues diagnostics and miss processing.

**Tech Stack:** Vanilla JavaScript, Web Animations API, Web Audio API, Node.js built-in test runner

## Global Constraints

- Default URL remains rAF-only.
- Enable compositor mode only with `visual=compositor` and `Element.animate` support.
- Use the same song anchor for notes and guide.
- Preserve audio, judgment, chart, scoring, note cleanup, and diagnostics.
- Cancel all animations during every playback stop.
- Bump JavaScript cache to `v=23` and synchronize `dist/rhythm-battle-poc/`.

---

### Task 1: Mode and timing helpers

**Files:**
- Modify: `server/tests/rhythm-battle-poc.test.js`
- Modify: `js/rhythm-battle-poc.js`

**Interfaces:**
- Produces `isCompositorVisualMode(search): boolean`
- Produces `calculateVisualSongStartMs(performanceNowMs, audioNowSec, audioStartSec): number`
- Produces `calculateNoteAnimationDelayMs(songStartMs, noteTimeSec, appearSec, timelineNowMs): number`

- [ ] Write failing tests for opt-in/default mode and exact timing calculations.
- [ ] Run focused tests and confirm RED.
- [ ] Implement and export minimal pure helpers.
- [ ] Run focused tests and confirm GREEN.

### Task 2: Compositor note animations

**Files:**
- Modify: `server/tests/rhythm-battle-poc.test.js`
- Modify: `js/rhythm-battle-poc.js`
- Modify: `css/rhythm-battle-poc.css`

**Interfaces:**
- Produces `prepareCompositorNotes(songStartMs)`
- Adds `state.compositorVisuals`, `state.visualSongStartMs`, `state.visualAnimations`

- [ ] Add a failing source-contract test requiring pre-created notes, `Element.animate`, `translate3d`, linear timing, and cleanup.
- [ ] Implement feature detection and pre-create note DOM with opacity zero.
- [ ] Animate each note from lane top to beyond the hit line using the shared anchor.
- [ ] In compositor mode, keep rAF miss processing but skip per-frame note position writes.
- [ ] Cancel animations from `stopPlayback()` and clear note DOM through existing helpers.
- [ ] Run focused and full tests plus syntax verification.

### Task 3: Compositor beat guide

**Files:**
- Modify: `server/tests/rhythm-battle-poc.test.js`
- Modify: `js/rhythm-battle-poc.js`
- Modify: `css/rhythm-battle-poc.css`

**Interfaces:**
- Produces `prepareCompositorBeatGuide(songStartMs)`

- [ ] Add a failing contract requiring four infinite animations sharing `visualSongStartMs`.
- [ ] Animate only transform and opacity for each quarter-note step.
- [ ] Skip rAF guide class updates in compositor mode.
- [ ] Cancel and reset guide animations during playback stop.
- [ ] Run focused and full tests.

### Task 4: Cache, docs, and distribution

**Files:**
- Modify: `rhythm-battle-poc.html`
- Modify: `server/tests/rhythm-battle-poc.test.js`
- Modify: `docs/13_rhythm_audio_data.md`
- Copy runtime files under `dist/rhythm-battle-poc/`

- [ ] Change cache expectation to v23 and confirm RED.
- [ ] Document normal and compositor A/B URLs plus the v22 ZIP restore path and hash.
- [ ] Copy distribution files and compare SHA-256 hashes.
- [ ] Run all tests, both JavaScript syntax checks, and `git diff --check` before committing.
