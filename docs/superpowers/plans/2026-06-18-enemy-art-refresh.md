# Enemy Art Refresh And Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refresh all existing enemy art into one cute, mobile-friendly style and add 15 new enemy assets plus names/data rows.

**Architecture:** Keep the gameplay data contract unchanged by continuing to load enemy `image` paths from `data/enemies.csv`, but replace the underlying enemy art assets with a unified chibi style. Improve battle image rendering in CSS so the same assets read clearly on narrow mobile screens.

**Tech Stack:** Static assets in `assets/`, CSV game master data, vanilla CSS/JS frontend.

## Global Constraints

- Keep existing enemy IDs and image path contract working.
- Add 15 new enemy records with names chosen in Japanese.
- Include cute, chick-like, chicken-like, and kappa-like enemies.
- Improve readability on smartphones without breaking desktop layout.

---

### Task 1: Create unified enemy asset set
- [ ] Generate a reusable art template and output all enemy asset files.
- [ ] Replace the 10 existing enemy assets with the new style.
- [ ] Add 15 new enemy asset files with matching naming.

### Task 2: Extend enemy master data
- [ ] Append 15 new rows to `data/enemies.csv`.
- [ ] Keep columns and load behavior unchanged.
- [ ] Assign names, stats, drops, and image paths.

### Task 3: Tune mobile battle presentation
- [ ] Update `css/style.css` enemy image styles for responsive display.
- [ ] Keep pixel/crisp rendering sensible for the new assets.
- [ ] Verify battle layout remains stable on small screens.

### Task 4: Verify references
- [ ] Confirm `data/enemies.csv` image paths exist.
- [ ] Confirm no code changes are needed for the new data shape.
