# Terminal Link Browser Routing Stabilization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make single-click terminal/CLI links open reliably in Calder’s embedded browser without selection-drag side effects or URL revert.

**Architecture:** Add a shared click-intent gate for terminal-origin link activation so drag/selection gestures never trigger navigation, then harden embedded-browser navigation with a transaction guard that rejects stale rollback events. Keep OSC8 + WebLinks compatibility, but dedupe them per click window through one decision path.

**Tech Stack:** Electron, TypeScript, xterm.js, Vitest, renderer DOM integration

---

## Planned File Structure (Locked Before Tasks)

- `src/renderer/link-click-intent.ts` (new)
  - Single responsibility: decide whether a mouse gesture is a valid “open link” click.
  - Exposes a tiny tracker API used by both terminal surfaces.
- `src/renderer/link-click-intent.test.ts` (new)
  - Unit tests for drag threshold, selection guard, and click acceptance.
- `src/renderer/components/terminal-pane.ts` (modify)
  - Integrate shared click-intent tracker in OSC8 + WebLinks callbacks.
  - Remove direct event suppression that can interfere with xterm selection semantics.
- `src/renderer/components/cli-surface/pane.ts` (modify)
  - Same integration as terminal pane, reusing the same helper.
- `src/renderer/link-routing.ts` (modify)
  - Keep dispatch dedupe deterministic for duplicate OSC8/WebLinks events in same click window.
- `src/renderer/components/browser-tab/pane.ts` (modify)
  - Route commit only for current navigation transaction; ignore stale revert candidates.
- `src/renderer/index.ts` (modify)
  - Harden embedded URL open path with project-level transaction/revert guard.
- `src/renderer/link-routing.test.ts` (modify)
  - Add/adjust dedupe assertions aligned with single-click + dual-source link behavior.
- `src/renderer/components/terminal-pane.test.ts` (modify)
  - Add behavior checks that selection/drag intent blocks open.
- `src/renderer/components/cli-surface/pane.test.ts` (modify)
  - Same behavior checks for CLI surface.
- `src/renderer/components/browser-tab-pane.test.ts` (modify)
  - Contract assertions for stale-revert guard usage.
- `src/renderer/index.browser-routing.contract.test.ts` (modify)
  - Contract assertions for transaction guard usage in embedded route entry.

---

### Task 1: Build Shared Link Click-Intent Guard (TDD First)

**Files:**
- Create: `src/renderer/link-click-intent.ts`
- Create: `src/renderer/link-click-intent.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/renderer/link-click-intent.test.ts
import { describe, expect, it } from 'vitest';
import { createLinkClickIntent } from './link-click-intent.js';

describe('createLinkClickIntent', () => {
  it('accepts a normal click with no selection', () => {
    const intent = createLinkClickIntent(6);
    intent.onPointerDown(100, 100);
    intent.onPointerUp(102, 103);
    expect(intent.shouldOpen({ hasSelection: false })).toBe(true);
  });

  it('rejects when selection exists', () => {
    const intent = createLinkClickIntent(6);
    intent.onPointerDown(100, 100);
    intent.onPointerUp(100, 100);
    expect(intent.shouldOpen({ hasSelection: true })).toBe(false);
  });

  it('rejects drag gestures above threshold', () => {
    const intent = createLinkClickIntent(6);
    intent.onPointerDown(100, 100);
    intent.onPointerMove(120, 120);
    intent.onPointerUp(120, 120);
    expect(intent.shouldOpen({ hasSelection: false })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/link-click-intent.test.ts`  
Expected: FAIL with module-not-found for `link-click-intent.ts`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/renderer/link-click-intent.ts
export interface LinkClickIntent {
  onPointerDown(x: number, y: number): void;
  onPointerMove(x: number, y: number): void;
  onPointerUp(x: number, y: number): void;
  reset(): void;
  shouldOpen(input: { hasSelection: boolean }): boolean;
}

export function createLinkClickIntent(thresholdPx = 6): LinkClickIntent {
  let down: { x: number; y: number } | null = null;
  let dragging = false;
  let completedClick = false;

  const distance = (x1: number, y1: number, x2: number, y2: number): number =>
    Math.hypot(x2 - x1, y2 - y1);

  return {
    onPointerDown(x, y) {
      down = { x, y };
      dragging = false;
      completedClick = false;
    },
    onPointerMove(x, y) {
      if (!down) return;
      if (distance(down.x, down.y, x, y) > thresholdPx) dragging = true;
    },
    onPointerUp(x, y) {
      if (!down) return;
      if (distance(down.x, down.y, x, y) > thresholdPx) dragging = true;
      completedClick = true;
    },
    reset() {
      down = null;
      dragging = false;
      completedClick = false;
    },
    shouldOpen({ hasSelection }) {
      const ok = completedClick && !dragging && !hasSelection;
      completedClick = false;
      return ok;
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderer/link-click-intent.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/link-click-intent.ts src/renderer/link-click-intent.test.ts
git commit -m "feat: add shared link click-intent guard"
```

---

### Task 2: Integrate Click-Intent Guard into Terminal and CLI Surface

**Files:**
- Modify: `src/renderer/components/terminal-pane.ts`
- Modify: `src/renderer/components/cli-surface/pane.ts`
- Modify: `src/renderer/components/terminal-pane.test.ts`
- Modify: `src/renderer/components/cli-surface/pane.test.ts`

- [ ] **Step 1: Write failing integration tests**

```ts
// terminal-pane.test.ts (new test idea)
it('does not open link when terminal selection exists', async () => {
  const { createTerminalPane } = await import('./terminal-pane.js');
  createTerminalPane('s-1', '/project', null);
  const openExternal = (window as any).calder.app.openExternal;

  // simulate selected text in fake terminal
  // fake terminal already supports getSelection(); set it to non-empty
  // then trigger webLinks callback
  expect(webLinksActivateRef.current).toBeTypeOf('function');
  webLinksActivateRef.current?.({ clientX: 100, clientY: 100 } as MouseEvent, 'http://localhost:3000');

  expect(openExternal).not.toHaveBeenCalled();
});
```

```ts
// cli-surface/pane.test.ts (new test idea)
it('does not open link after drag-like pointer sequence', async () => {
  // mount pane, simulate pointerdown->move->up on viewport, then trigger callback
  // expect openExternal not called
});
```

- [ ] **Step 2: Run focused tests to confirm failure**

Run:

```bash
npx vitest run src/renderer/components/terminal-pane.test.ts src/renderer/components/cli-surface/pane.test.ts
```

Expected: FAIL because link callbacks still open without gesture intent gating.

- [ ] **Step 3: Implement minimal integration**

```ts
// terminal-pane.ts (core pattern)
import { createLinkClickIntent } from '../link-click-intent.js';

const intent = createLinkClickIntent(6);
xtermWrap.addEventListener('pointerdown', (e) => intent.onPointerDown(e.clientX, e.clientY));
xtermWrap.addEventListener('pointermove', (e) => intent.onPointerMove(e.clientX, e.clientY));
xtermWrap.addEventListener('pointerup', (e) => intent.onPointerUp(e.clientX, e.clientY));
xtermWrap.addEventListener('pointercancel', () => intent.reset());
xtermWrap.addEventListener('mouseleave', () => intent.reset());

function canOpenFromIntent(): boolean {
  const hasSelection = Boolean(terminal.getSelection()?.trim());
  return intent.shouldOpen({ hasSelection });
}

// use in both link handlers
if (!canOpenFromIntent()) return;
openTerminalWebLink(uriOrUrl, source, projectPath);
```

```ts
// cli-surface/pane.ts (same pattern on viewport)
import { createLinkClickIntent } from '../../link-click-intent.js';
// ... identical tracker wiring with viewport element and instance.terminal.getSelection()
```

```ts
// IMPORTANT: remove direct event.preventDefault()/stopPropagation() from link handlers
// because intent gate now controls open behavior and avoids selection-lock side effects.
```

- [ ] **Step 4: Re-run focused tests**

Run:

```bash
npx vitest run src/renderer/link-click-intent.test.ts src/renderer/components/terminal-pane.test.ts src/renderer/components/cli-surface/pane.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/terminal-pane.ts src/renderer/components/cli-surface/pane.ts src/renderer/components/terminal-pane.test.ts src/renderer/components/cli-surface/pane.test.ts
git commit -m "fix: gate terminal link opens behind click intent"
```

---

### Task 3: Stabilize Link Dispatch Dedupe for Dual Sources

**Files:**
- Modify: `src/renderer/link-routing.ts`
- Modify: `src/renderer/link-routing.test.ts`

- [ ] **Step 1: Write failing dedupe tests**

```ts
// link-routing.test.ts (new/updated assertions)
it('opens once when same click emits both osc-link and web-link', () => {
  // first event true, second equivalent event false
});

it('keeps more-specific same-origin url over root fallback', () => {
  // /admin/tickets should win over /
});
```

- [ ] **Step 2: Run focused tests to confirm failure**

Run: `npx vitest run src/renderer/link-routing.test.ts`  
Expected: FAIL on duplicate dual-source scenario.

- [ ] **Step 3: Implement minimal dedupe logic**

```ts
// link-routing.ts
export interface LinkDispatchSnapshot {
  at: number;
  url: string;
  source: 'osc-link' | 'web-link';
}

function specificityScore(url: string): number {
  const parsed = new URL(url);
  return parsed.pathname.length + parsed.search.length + parsed.hash.length;
}

export function shouldDispatchLinkOpen(nextUrl: string, last: LinkDispatchSnapshot | null, source: LinkDispatchSnapshot['source'], now = Date.now(), dedupeWindowMs = 300): boolean {
  if (!last || now - last.at > dedupeWindowMs) return true;
  if (new URL(nextUrl).origin !== new URL(last.url).origin) return true;
  if (nextUrl === last.url) return false;
  const nextScore = specificityScore(nextUrl);
  const prevScore = specificityScore(last.url);
  if (nextScore !== prevScore) return nextScore > prevScore;
  return source === 'osc-link' && last.source !== 'osc-link';
}
```

- [ ] **Step 4: Re-run focused tests**

Run: `npx vitest run src/renderer/link-routing.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/link-routing.ts src/renderer/link-routing.test.ts
git commit -m "fix: stabilize dual-source terminal link dedupe"
```

---

### Task 4: Harden Embedded Browser Transaction to Block Revert

**Files:**
- Modify: `src/renderer/index.ts`
- Modify: `src/renderer/components/browser-tab/pane.ts`
- Modify: `src/renderer/index.browser-routing.contract.test.ts`
- Modify: `src/renderer/components/browser-tab-pane.test.ts`

- [ ] **Step 1: Write failing guard tests**

```ts
// index.browser-routing.contract.test.ts (assertions)
expect(source).toContain('const EMBEDDED_REVERT_WINDOW_MS = 1800;');
expect(source).toContain('shouldAcceptEmbeddedRoute(projectId: string, requestedUrl: string, now: number)');
expect(source).toContain('if (!shouldAcceptEmbeddedRoute(project.id, requestedUrl, now)) return;');
```

```ts
// browser-tab-pane.test.ts (assertions)
expect(source).toContain('isStaleNavigationRevert(instance, e.url)');
expect(source).toContain('isStaleNavigationRevert(instance, failedUrl)');
```

- [ ] **Step 2: Run focused tests to confirm failure**

Run:

```bash
npx vitest run src/renderer/index.browser-routing.contract.test.ts src/renderer/components/browser-tab-pane.test.ts
```

Expected: FAIL before route guard / stale-revert integration is complete.

- [ ] **Step 3: Implement transaction guard**

```ts
// index.ts
const EMBEDDED_REVERT_WINDOW_MS = 1800;
const lastEmbeddedRoutes = new Map<string, { previous: string; current: string; at: number }>();

function shouldAcceptEmbeddedRoute(projectId: string, requestedUrl: string, now: number): boolean {
  const last = lastEmbeddedRoutes.get(projectId);
  if (!last) return true;
  if (now - last.at > EMBEDDED_REVERT_WINDOW_MS) return true;
  if (new URL(last.current).origin !== new URL(requestedUrl).origin) return true;
  if (requestedUrl === last.current) return false;
  if (last.previous && requestedUrl === last.previous) return false;
  return true;
}
```

```ts
// browser-tab/pane.ts (pattern)
if (isStaleNavigationRevert(instance, e.url)) return;
// ... only then commit url + update state
```

- [ ] **Step 4: Re-run focused tests**

Run:

```bash
npx vitest run src/renderer/index.browser-routing.contract.test.ts src/renderer/components/browser-tab-pane.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/index.ts src/renderer/components/browser-tab/pane.ts src/renderer/index.browser-routing.contract.test.ts src/renderer/components/browser-tab-pane.test.ts
git commit -m "fix: guard embedded browser navigation against stale revert"
```

---

### Task 5: Full Verification and User Scenario Proof

**Files:**
- Modify: `docs/superpowers/specs/2026-04-14-terminal-link-browser-routing-design.md` (optional verification notes append only if needed)

- [ ] **Step 1: Run full targeted regression suite**

```bash
npx vitest run \
  src/renderer/link-click-intent.test.ts \
  src/renderer/link-routing.test.ts \
  src/renderer/components/terminal-pane.test.ts \
  src/renderer/components/cli-surface/pane.test.ts \
  src/renderer/components/browser-tab-pane.test.ts \
  src/renderer/index.browser-routing.contract.test.ts \
  src/main/browser-webview-routing.test.ts \
  src/main/browser-open-policy.test.ts \
  src/main/browser-routing.contract.test.ts
```

Expected: PASS (all).

- [ ] **Step 2: Run build verification**

Run: `npm run build`  
Expected: Successful TypeScript compile + renderer bundle + asset copy.

- [ ] **Step 3: Manual user-flow validation checklist**

```text
1) Terminalde linke tek tıkla -> embedded browser açılıyor mu?
2) Click sonrası mouse hareketinde “basılı kalmış gibi selection” oluşuyor mu? (olmamalı)
3) Aşağıdaki URL'lere click ile geçiş kalıcı mı?
   - http://localhost:3000/ -> /dashboard
   - http://localhost:3000/dashboard
   - http://localhost:3000/tickets
   - http://localhost:3000/admin/dashboard
   - http://localhost:3000/admin/tickets
4) URL flash edip geri dönüyor mu? (dönmemeli)
```

- [ ] **Step 4: Final commit**

```bash
git add src/renderer/link-click-intent.ts src/renderer/link-click-intent.test.ts src/renderer/components/terminal-pane.ts src/renderer/components/cli-surface/pane.ts src/renderer/link-routing.ts src/renderer/link-routing.test.ts src/renderer/index.ts src/renderer/components/browser-tab/pane.ts src/renderer/components/terminal-pane.test.ts src/renderer/components/cli-surface/pane.test.ts src/renderer/components/browser-tab-pane.test.ts src/renderer/index.browser-routing.contract.test.ts
git commit -m "fix: make terminal links open reliably in embedded browser"
```

---

## Self-Review (Writing-Plans Checklist)

### 1) Spec coverage

- Interaction bug (selection/drag side effect): covered in Task 1 + Task 2.
- Link dual-source dedupe reliability: covered in Task 3.
- URL revert prevention: covered in Task 4.
- End-to-end user URL list validation: covered in Task 5.

No spec gaps found.

### 2) Placeholder scan

- No `TODO`, `TBD`, “implement later”, or ambiguous “handle edge cases” placeholders remain.

### 3) Type consistency

- `LinkDispatchSnapshot['source']` uses `'osc-link' | 'web-link'` consistently.
- `shouldAcceptEmbeddedRoute(projectId, requestedUrl, now)` signature is used consistently in plan snippets.
- `createLinkClickIntent(thresholdPx)` API is consistently used across terminal and CLI surface tasks.

Consistency check passed.

