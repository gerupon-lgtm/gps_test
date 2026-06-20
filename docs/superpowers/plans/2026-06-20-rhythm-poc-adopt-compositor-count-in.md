# 合成表示正式採用・二小節カウント Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 合成アニメーション表示を標準動作にし、楽曲開始前カウントを`1, 2｜1, 2, 3, 4`の二小節へ拡張する。

**Architecture:** カウントを四分音符単位のイベント列として定義し、発音・数字表示・拍ガイドを同じイベントから予約する。表示モード判定は通常URLを合成版、`?visual=raf`を従来版とし、Web Animations API非対応時だけrAFへフォールバックする。

**Tech Stack:** HTML、CSS、Vanilla JavaScript、Web Audio API、Web Animations API、Node.js `node:test`、PowerShell

## Global Constraints

- 合計8拍のカウント列は`[1, 休, 2, 休, 1, 2, 3, 4]`とする。
- 通常URLと旧`?visual=compositor`は合成表示、`?visual=raf`はrAF表示とする。
- Web Animations API非対応時はrAFへフォールバックする。
- 音声スケジューラ、タップ時刻、判定、ダメージ、譜面は変更しない。
- 変更前v24配布一式を`dist/archive/`へZIP保存する。
- 配布はGit pushせず、`dist/rhythm-battle-poc/`を手動アップロード用に同期する。

---

### Task 1: v24配布版の保管

**Files:**
- Create: `dist/archive/rhythm-battle-poc-v24-compositor-best-20260620.zip`
- Inspect: `dist/rhythm-battle-poc/index.html`
- Inspect: `dist/rhythm-battle-poc/css/rhythm-battle-poc.css`
- Inspect: `dist/rhythm-battle-poc/js/rhythm-battle-poc.js`
- Inspect: `dist/rhythm-battle-poc/README.md`

**Interfaces:**
- Consumes: 現在のv24配布一式
- Produces: 復元用ZIPとSHA-256

- [ ] **Step 1: ZIP対象のバージョンを確認する**

Run: `Select-String -Path dist\rhythm-battle-poc\index.html -Pattern 'css\?v=14|js\?v=24'`

Expected: CSS v14とJavaScript v24の両方が表示される。

- [ ] **Step 2: 配布一式をZIP保存する**

Run: `Compress-Archive -Path dist\rhythm-battle-poc\index.html,dist\rhythm-battle-poc\css,dist\rhythm-battle-poc\js,dist\rhythm-battle-poc\README.md -DestinationPath dist\archive\rhythm-battle-poc-v24-compositor-best-20260620.zip`

Expected: ZIPが作成され、既存のv22 ZIPは変更されない。

- [ ] **Step 3: ZIP内容とSHA-256を確認する**

Run: `Get-FileHash dist\archive\rhythm-battle-poc-v24-compositor-best-20260620.zip -Algorithm SHA256`

Expected: 64桁のSHA-256が表示される。

### Task 2: 二小節カウント

**Files:**
- Modify: `server/tests/rhythm-battle-poc.test.js`
- Modify: `js/rhythm-battle-poc.js`

**Interfaces:**
- Consumes: `beatSeconds(bpm)`、`playCountTone(time, beatNumber)`、`updateVisualBeatGuide(index, pulse)`
- Produces: `buildCountInEvents(): Array<{ beatOffset: number, label: number, guideIndex: number }>`

- [ ] **Step 1: 失敗テストを書く**

```js
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
```

- [ ] **Step 2: REDを確認する**

Run: `node --test --test-name-pattern="two-bar count-in" server\tests\rhythm-battle-poc.test.js`

Expected: `buildCountInEvents is not defined`でFAILする。

- [ ] **Step 3: 最小実装を追加する**

```js
function buildCountInEvents() {
  return [
    { beatOffset: 0, label: 1, guideIndex: 0 },
    { beatOffset: 2, label: 2, guideIndex: 2 },
    { beatOffset: 4, label: 1, guideIndex: 0 },
    { beatOffset: 5, label: 2, guideIndex: 1 },
    { beatOffset: 6, label: 3, guideIndex: 2 },
    { beatOffset: 7, label: 4, guideIndex: 3 },
  ];
}
```

`scheduleCountIn()`はこのイベント列を走査し、`state.startTime`は8拍後に設定する。

- [ ] **Step 4: GREENを確認する**

Run: `node --test server\tests\rhythm-battle-poc.test.js`

Expected: 全テストPASS。

- [ ] **Step 5: コミットする**

```powershell
git add server/tests/rhythm-battle-poc.test.js js/rhythm-battle-poc.js
git commit -m "二小節カウントを追加"
```

### Task 3: 合成表示を標準化

**Files:**
- Modify: `server/tests/rhythm-battle-poc.test.js`
- Modify: `js/rhythm-battle-poc.js`

**Interfaces:**
- Consumes: URLクエリ文字列、`Element.prototype.animate`
- Produces: `prefersCompositorVisuals(search): boolean`と実行時の`state.compositorVisuals`

- [ ] **Step 1: 失敗テストを書く**

```js
test("compositor visuals are default while raf remains opt-in", () => {
  assert.equal(prefersCompositorVisuals(""), true);
  assert.equal(prefersCompositorVisuals("?debug=1"), true);
  assert.equal(prefersCompositorVisuals("?visual=compositor"), true);
  assert.equal(prefersCompositorVisuals("?visual=raf"), false);
});
```

- [ ] **Step 2: REDを確認する**

Run: `node --test --test-name-pattern="compositor visuals are default" server\tests\rhythm-battle-poc.test.js`

Expected: 通常URLが`false`となりFAILする。

- [ ] **Step 3: 最小実装を追加する**

```js
function prefersCompositorVisuals(search) {
  return new URLSearchParams(search || "").get("visual") !== "raf";
}
```

`bind()`ではこの希望値と`Element.prototype.animate`対応の両方が真の場合だけ`state.compositorVisuals = true`にする。

- [ ] **Step 4: GREENを確認する**

Run: `node --test server\tests\rhythm-battle-poc.test.js`

Expected: 全テストPASS。

- [ ] **Step 5: コミットする**

```powershell
git add server/tests/rhythm-battle-poc.test.js js/rhythm-battle-poc.js
git commit -m "合成表示を標準動作に変更"
```

### Task 4: 配布物とメイン資料の同期

**Files:**
- Modify: `rhythm-battle-poc.html`
- Modify: `docs/13_rhythm_audio_data.md`
- Modify: `dist/rhythm-battle-poc/index.html`
- Modify: `dist/rhythm-battle-poc/css/rhythm-battle-poc.css`
- Modify: `dist/rhythm-battle-poc/js/rhythm-battle-poc.js`
- Modify: `dist/rhythm-battle-poc/README.md`

**Interfaces:**
- Consumes: Task 1のZIPハッシュ、Task 2・3の実装
- Produces: 手動アップロード可能な正式採用版一式

- [ ] **Step 1: キャッシュ番号テストを先に更新する**

HTMLの期待値をCSS v15、JavaScript v25へ変更し、テストが旧番号でFAILすることを確認する。

Run: `node --test --test-name-pattern="mobile layout" server\tests\rhythm-battle-poc.test.js`

Expected: v15またはv25が見つからずFAILする。

- [ ] **Step 2: HTML・資料・READMEを更新する**

HTMLをCSS v15、JavaScript v25へ更新する。`docs/13_rhythm_audio_data.md`へ二小節カウント、通常URLが合成版であること、`?visual=raf`、v24 ZIPのSHA-256を記録する。READMEの比較URL説明も同じ内容に揃える。

- [ ] **Step 3: 配布フォルダへ同期する**

```powershell
Copy-Item rhythm-battle-poc.html dist\rhythm-battle-poc\index.html -Force
Copy-Item css\rhythm-battle-poc.css dist\rhythm-battle-poc\css\rhythm-battle-poc.css -Force
Copy-Item js\rhythm-battle-poc.js dist\rhythm-battle-poc\js\rhythm-battle-poc.js -Force
```

- [ ] **Step 4: 全検証を実行する**

```powershell
node --test server\tests\rhythm-battle-poc.test.js
node --check js\rhythm-battle-poc.js
node --check dist\rhythm-battle-poc\js\rhythm-battle-poc.js
git diff --check
```

Expected: 全テストPASS、両JavaScript構文チェック成功、空白エラーなし。ソースとdistのHTML・CSS・JavaScriptのSHA-256がそれぞれ一致する。

- [ ] **Step 5: コミットする**

```powershell
git add rhythm-battle-poc.html server/tests/rhythm-battle-poc.test.js js/rhythm-battle-poc.js docs/13_rhythm_audio_data.md
git commit -m "合成表示正式採用版を配布用に更新"
```
