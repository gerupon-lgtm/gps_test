# Note Lifecycle Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure judged and end-of-battle notes never remain frozen in the lane.

**Architecture:** Centralize one-note removal and all-note clearing. Route HIT, MISS, victory, timeout, and reset through those helpers without changing timing calculations.

**Tech Stack:** Vanilla JavaScript, Node.js built-in test runner

## Global Constraints

- Do not change audio, chart, judgment, scoring, visual beat timing, or watchdog behavior.
- Delete both DOM nodes and `state.noteEls` references.
- Bump JavaScript cache to `v=21` and synchronize `dist/rhythm-battle-poc/`.

---

### Task 1: Note lifecycle helpers and call sites

**Files:**
- Modify: `server/tests/rhythm-battle-poc.test.js`
- Modify: `js/rhythm-battle-poc.js`

- [ ] Add a failing source-contract test requiring `removeNoteElement()` and `clearVisualNotes()` from HIT, MISS, victory, timeout, and reset paths.
- [ ] Run the focused test and confirm RED.
- [ ] Implement the helpers and replace direct incomplete cleanup.
- [ ] Run focused and full tests plus JavaScript syntax verification.

### Task 2: Cache, docs, and distribution

**Files:**
- Modify: `rhythm-battle-poc.html`
- Modify: `server/tests/rhythm-battle-poc.test.js`
- Modify: `docs/13_rhythm_audio_data.md`
- Copy runtime files under `dist/rhythm-battle-poc/`

- [ ] Change cache expectation to v21 and confirm RED.
- [ ] Update HTML and canonical documentation.
- [ ] Copy distribution files and compare SHA-256 hashes.
- [ ] Run all tests, syntax checks, and `git diff --check` before committing.
