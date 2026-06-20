# rAF Watchdog Rollback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the original rAF-only interaction feel while preserving diagnostics and the v21 note-lifecycle fix.

**Architecture:** Remove only the visual watchdog timer, predicate, state, and fallback counter. Keep `renderVisual()` behind the rAF callback and retain all diagnostic sampling.

**Tech Stack:** Vanilla JavaScript, Node.js built-in test runner

## Global Constraints

- Preserve v21 note removal.
- Preserve audio, judgment, chart, scoring, and diagnostics.
- Ensure no visual 25ms interval remains.
- Bump JavaScript cache to `v=22` and synchronize `dist/rhythm-battle-poc/`.

---

### Task 1: Remove watchdog under regression test

- [ ] Replace watchdog tests with a failing contract that requires rAF rendering and rejects watchdog symbols and visual intervals.
- [ ] Run the focused test and confirm RED.
- [ ] Remove helper, state, interval lifecycle, fallback counter, and watchdog callback.
- [ ] Run focused and full tests plus syntax verification.

### Task 2: Cache, docs, and distribution

- [ ] Change the cache expectation to v22 and confirm RED.
- [ ] Update HTML and canonical documentation with the rollback decision.
- [ ] Copy distribution files and compare SHA-256 hashes.
- [ ] Run all tests, syntax checks, and `git diff --check` before committing.
