# Calder Native-First UI System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Calder's Native-first UI System so the app feels like a distinctive, premium desktop command cockpit while preserving current Electron, terminal, browser, provider, and session workflows.

**Architecture:** Keep the renderer as TypeScript, vanilla DOM modules, esbuild, and CSS. Introduce a stricter token/primitives layer, then migrate shell chrome, floating surfaces, browser workflows, Control Panel, modals, and document-reading surfaces in small tested phases. Add `@floating-ui/dom` only for anchored menus and popovers that currently rely on manual clamp logic.

**Tech Stack:** Electron, TypeScript, vanilla DOM renderer, CSS custom properties, xterm.js, Electron `webview`, `@floating-ui/dom`, Vitest, esbuild

---

## Execution Notes

- The current worktree may already contain many unrelated edits. Do not revert files you did not intentionally touch.
- Do not change provider launch APIs, PTY lifecycle, session data flow, or browser `webview` architecture in this plan.
- Do not introduce React, Vue, shadcn, Radix, Shoelace, or Web Awesome as a global renderer dependency.
- Commit only if the user explicitly asks for commits in the current execution session. Otherwise, stop at passing tests and report changed files.
- After each task, run the focused test command listed in that task. After every two tasks, run `npm run build && npm test`.

## File Structure

Create or modify these files:

- Create: `/Users/batuhanyuksel/Documents/browser/docs/superpowers/specs/2026-04-11-calder-ui-inventory.md`
  - UI inventory and triage table for visible regions, controls, modals, menus, and panels.
- Create: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/native-ui-system.contract.test.ts`
  - Contract tests for imports, tokens, reduced motion, primitives, and major surface selectors.
- Create: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/primitives.css`
  - Shared native-first controls: buttons, icon buttons, chips, rows, popovers, modal shell helpers, focus rings.
- Create: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/floating-surface.ts`
  - Small wrapper over `@floating-ui/dom` for anchored popovers and dropdowns.
- Create: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/floating-surface.test.ts`
  - Unit tests for helper defaults and cleanup behavior.
- Modify: `/Users/batuhanyuksel/Documents/browser/package.json`
  - Add `@floating-ui/dom`.
- Modify: `/Users/batuhanyuksel/Documents/browser/package-lock.json`
  - Updated by `npm install @floating-ui/dom`.
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles.css`
  - Import `primitives.css` directly after `cockpit.css`.
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/base.css`
  - Tighten token system, semantic colors, motion tokens, and reduced-motion rules.
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/cockpit.css`
  - Convert existing shared classes into systematic primitives or aliases.
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/sidebar.css`
  - Polish project rail without changing behavior.
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/tabs.css`
  - Polish top session strip and context menus.
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/terminal.css`
  - Polish pane chrome, focus, mosaic divider, and terminal framing.
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/browser-tab.css`
  - Polish browser toolbar, target menu, inspect/draw/record controls, popovers, and local targets.
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/context-inspector.css`
  - Restyle Control Panel as an operational inspector, not a card stack.
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/modals.css`
  - Shared modal polish, focus behavior, and field layout.
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/preferences.css`
  - Make Preferences a flagship modal surface.
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/file-viewer.css`
  - Improve document/markdown reading surface for agents, skills, and commands.
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/custom-select.ts`
  - Use `floating-surface.ts` for dropdown positioning.
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/browser-tab/popover.ts`
  - Use `floating-surface.ts` where anchored positioning is safer than manual pane clamp.
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/browser-tab/pane.ts`
  - Improve browser target menu structure and button copy without changing send behavior.
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/modal.ts`
  - Add accessible modal shell behavior and focus restoration.
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/preferences-modal.ts`
  - Use improved utility copy and layout hooks.
- Modify existing focused tests:
  - `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/theme-contract.test.ts`
  - `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/layout-contract.test.ts`
  - `/Users/batuhanyuksel/Documents/browser/src/renderer/components/browser-tab/popover.test.ts`
  - `/Users/batuhanyuksel/Documents/browser/src/renderer/components/browser-tab-pane.test.ts`
  - `/Users/batuhanyuksel/Documents/browser/src/renderer/components/config-sections.test.ts`
  - `/Users/batuhanyuksel/Documents/browser/src/renderer/components/preferences-modal.contract.test.ts`
  - `/Users/batuhanyuksel/Documents/browser/src/renderer/components/file-reader-agent-doc.test.ts`

### Task 1: Create The UI Inventory Baseline

**Files:**
- Create: `/Users/batuhanyuksel/Documents/browser/docs/superpowers/specs/2026-04-11-calder-ui-inventory.md`
- Test: none

- [ ] **Step 1: Write the inventory document**

Create `/Users/batuhanyuksel/Documents/browser/docs/superpowers/specs/2026-04-11-calder-ui-inventory.md` with this content:

```markdown
# Calder UI Inventory

**Date:** 2026-04-11

**Purpose:** Track every visible Calder interface surface before the Native-first UI System redesign so changes stay surgical and behavior remains stable.

## Triage Legend

- `keep`: keep structure and behavior
- `rename`: copy or label should change
- `restyle`: visual system should change without behavior changes
- `merge`: combine with another nearby control or surface
- `remove`: delete because the control is no longer useful
- `behavior-fix`: behavior is confusing, fragile, or inconsistent

## Inventory

| Surface | Current Role | Decision | Required Change | Behavior Must Stay |
|---|---|---|---|---|
| Sidebar header | Brand, project navigation, preferences, new project | restyle | Tighten brand block, keep gear/new project obvious | Preferences and new project buttons still work |
| Project list | Switch active project | restyle | More legible active row, better density | Project selection and sidebar resize |
| Top tab strip | Session navigation and creation | restyle | Cleaner session strip, stronger active session state | Quick new session and tab reorder |
| Workspace spend | Cost signal | restyle | Keep visible but less dashboard-like | Cost data display |
| Git status | Repo branch/change signal | restyle | More compact status affordance | Existing git popover behavior |
| Terminal panes | CLI sessions | restyle | Better pane chrome, focus, provider badge, unread/working states | PTY lifecycle and keyboard behavior |
| Browser pane | Embedded browser workflow | restyle | Stronger toolbar hierarchy and local target clarity | Navigation, webview, inspect, draw, record |
| Browser inspect popover | Send selected element context to a session | behavior-fix | Anchored, movable, non-clipping, selected target clear | Send to selected, custom, or new session |
| Browser target menu | Select destination CLI session | behavior-fix | Use anchored menu and clearer session metadata | Existing target-session state |
| Control Panel | AI Setup, Changes, Recent Sessions, Toolchain | restyle | Operational inspector with less card stacking | Section order and non-blocking warnings |
| AI Setup | Readiness/tracking status | restyle | Plain-language utility copy and clearer scan state | Readiness scan behavior |
| Changes | Git changes list | restyle | Dense list rows and clearer empty state | Existing file/diff actions |
| Recent Sessions | Continue previous work | restyle | Better row hierarchy and destructive action clarity | Restore/archive/delete behavior |
| Toolchain | MCP servers, agents, skills, commands | rename | Keep `MCP Servers`, clarify counts and empty states | Existing config open/add/remove behavior |
| Shared modal | New project/session/branch/MCP inspector | behavior-fix | Shared accessible shell, focus restore, better field rows | Confirm/cancel callbacks |
| Preferences | App settings | restyle | Flagship settings surface with stronger sections | Preferences persistence |
| Usage Stats | Spend modal | restyle | Better table/chart density | Existing stats calculation |
| Agents/Skills/Commands docs | Markdown/document reader | restyle | Better doc header, typography, and actions | File-reader session model |
| Session Inspector | Timeline and session details | restyle | Token-aligned badges and readable dense lists | Inspector data flow |
| Scratch Shell | Project utility terminal | restyle | Match terminal pane chrome | Shell PTY behavior |
| Menus and dropdowns | Secondary actions | behavior-fix | Move fragile positioning to Floating UI | Existing menu actions |

## Non-Changes

- No renderer framework migration.
- No provider launch API changes.
- No PTY lifecycle changes.
- No `webview` replacement.
- No decorative dashboard or marketing surfaces.
```

- [ ] **Step 2: Verify the inventory file exists**

Run:

```bash
test -f /Users/batuhanyuksel/Documents/browser/docs/superpowers/specs/2026-04-11-calder-ui-inventory.md
```

Expected: command exits with code `0`.

- [ ] **Step 3: Check the inventory has no loose draft markers**

Run:

```bash
rg -n "[T]BD|[T]ODO|X[X]X" /Users/batuhanyuksel/Documents/browser/docs/superpowers/specs/2026-04-11-calder-ui-inventory.md
```

Expected: no matches and exit code `1`.

### Task 2: Add Native UI System Contract Tests

**Files:**
- Create: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/native-ui-system.contract.test.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/theme-contract.test.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/layout-contract.test.ts`

- [ ] **Step 1: Write failing native UI system contract tests**

Create `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/native-ui-system.contract.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const styles = readFileSync(new URL('../styles.css', import.meta.url), 'utf-8');
const base = readFileSync(new URL('./base.css', import.meta.url), 'utf-8');
const primitives = readFileSync(new URL('./primitives.css', import.meta.url), 'utf-8');
const contextInspector = readFileSync(new URL('./context-inspector.css', import.meta.url), 'utf-8');
const browser = readFileSync(new URL('./browser-tab.css', import.meta.url), 'utf-8');
const terminal = readFileSync(new URL('./terminal.css', import.meta.url), 'utf-8');

describe('native-first UI system contract', () => {
  it('imports the shared primitives directly after cockpit tokens', () => {
    expect(styles).toContain("@import url('./styles/cockpit.css');\n@import url('./styles/primitives.css');");
  });

  it('defines the native-first token groups', () => {
    expect(base).toContain('--surface-shell');
    expect(base).toContain('--border-hairline');
    expect(base).toContain('--accent-line');
    expect(base).toContain('--motion-fast');
    expect(base).toContain('--motion-panel');
  });

  it('defines reduced motion rules at the token layer', () => {
    expect(base).toContain('@media (prefers-reduced-motion: reduce)');
    expect(base).toContain('--motion-fast: 0ms');
    expect(base).toContain('animation-duration: 0.001ms');
  });

  it('provides shared primitive classes instead of one-off surface styling only', () => {
    expect(primitives).toContain('.calder-button');
    expect(primitives).toContain('.calder-icon-button');
    expect(primitives).toContain('.calder-list-row');
    expect(primitives).toContain('.calder-popover');
    expect(primitives).toContain('.calder-section-heading');
  });

  it('keeps the app operational surface-oriented instead of card-grid oriented', () => {
    expect(contextInspector).toContain('.control-panel-surface');
    expect(contextInspector).not.toContain('dashboard-card-grid');
    expect(browser).toContain('.browser-toolbar-primary');
    expect(terminal).toContain('.terminal-pane.focused');
  });
});
```

- [ ] **Step 2: Extend existing theme contract expectations**

Update `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/theme-contract.test.ts` so the token test includes:

```ts
expect(baseCss).toContain('--surface-shell');
expect(baseCss).toContain('--border-hairline');
expect(baseCss).toContain('--accent-line');
expect(baseCss).toContain('--motion-fast');
expect(baseCss).toContain('--motion-panel');
```

- [ ] **Step 3: Extend layout contract expectations**

Update `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/layout-contract.test.ts` so it includes:

```ts
expect(imports).toContain("./styles/primitives.css");
expect(tabsCss).toContain('.tab-bar-surface');
expect(railCss).toContain('.sidebar-project-row');
```

- [ ] **Step 4: Run focused tests to verify RED**

Run:

```bash
./node_modules/.bin/vitest run \
  src/renderer/styles/native-ui-system.contract.test.ts \
  src/renderer/styles/theme-contract.test.ts \
  src/renderer/styles/layout-contract.test.ts
```

Expected: failures because `primitives.css`, new token names, and new shell selectors do not exist yet.

### Task 3: Implement Tokens And Shared Primitives

**Files:**
- Create: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/primitives.css`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles.css`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/base.css`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/cockpit.css`
- Test: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/native-ui-system.contract.test.ts`
- Test: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/theme-contract.test.ts`
- Test: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/layout-contract.test.ts`

- [ ] **Step 1: Import primitives in the global stylesheet**

Modify `/Users/batuhanyuksel/Documents/browser/src/renderer/styles.css` so the top imports are:

```css
@import url('./styles/base.css');
@import url('./styles/cockpit.css');
@import url('./styles/primitives.css');
@import url('./styles/sidebar.css');
```

- [ ] **Step 2: Add native-first tokens to base.css**

In `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/base.css`, keep existing compatibility aliases but add these tokens inside `:root`:

```css
  --surface-shell: #090e14;
  --surface-rail: #0d131b;
  --surface-workspace: #070b10;
  --surface-raised: #131b25;
  --surface-glass: rgba(14, 22, 31, 0.86);
  --border-hairline: rgba(255, 255, 255, 0.055);
  --border-muted: #1a2633;
  --accent-line: color-mix(in srgb, var(--accent) 48%, transparent);
  --space-2: 2px;
  --space-4: 4px;
  --space-6: 6px;
  --space-8: 8px;
  --space-10: 10px;
  --space-12: 12px;
  --space-16: 16px;
  --space-20: 20px;
  --space-24: 24px;
  --motion-fast: 120ms;
  --motion-normal: 180ms;
  --motion-panel: 220ms;
  --ease-standard: cubic-bezier(0.2, 0, 0, 1);
```

Add this reduced-motion block near the global base rules:

```css
@media (prefers-reduced-motion: reduce) {
  :root {
    --motion-fast: 0ms;
    --motion-normal: 0ms;
    --motion-panel: 0ms;
  }

  *,
  *::before,
  *::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    scroll-behavior: auto !important;
    transition-duration: 0ms !important;
  }
}
```

- [ ] **Step 3: Create shared primitive classes**

Create `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/primitives.css`:

```css
.calder-button,
.calder-icon-button {
  border: 1px solid var(--border-subtle);
  background: color-mix(in srgb, var(--surface-panel) 88%, transparent);
  color: var(--text-secondary);
  transition:
    background-color var(--motion-fast) var(--ease-standard),
    border-color var(--motion-fast) var(--ease-standard),
    color var(--motion-fast) var(--ease-standard),
    transform var(--motion-fast) var(--ease-standard);
}

.calder-button:hover,
.calder-icon-button:hover {
  border-color: var(--border);
  background: color-mix(in srgb, var(--surface-hover) 88%, var(--surface-panel));
  color: var(--text-primary);
}

.calder-button {
  min-height: var(--control-height-md);
  padding: 0 var(--space-12);
  border-radius: var(--radius-sm);
  font-size: 12px;
  font-weight: 650;
}

.calder-icon-button {
  width: var(--control-height-md);
  height: var(--control-height-md);
  border-radius: var(--radius-sm);
  display: inline-grid;
  place-items: center;
}

.calder-list-row {
  display: grid;
  gap: var(--space-4);
  min-height: 34px;
  padding: var(--space-8) var(--space-10);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
}

.calder-list-row:hover {
  background: color-mix(in srgb, var(--surface-hover) 72%, transparent);
  color: var(--text-primary);
}

.calder-section-heading {
  font-size: 10px;
  line-height: 1;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-dim);
}

.calder-popover {
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.035), rgba(255, 255, 255, 0)),
    var(--surface-glass);
  box-shadow: var(--shadow-elevated);
  backdrop-filter: blur(18px);
}

.calder-focus-ring:focus-visible {
  outline: 1px solid var(--border-focus);
  outline-offset: 2px;
}
```

- [ ] **Step 4: Alias existing cockpit classes to primitives**

Modify `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/cockpit.css` so `.control-chip` and `.surface-card` use the same token language:

```css
.surface-card {
  background: var(--surface-panel);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-soft);
}

.control-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: var(--control-height-sm);
  padding: 0 10px;
  border: 1px solid var(--border-subtle);
  border-radius: 999px;
  background: color-mix(in srgb, var(--surface-raised) 72%, transparent);
  color: var(--text-secondary);
}
```

- [ ] **Step 5: Run focused tests to verify GREEN**

Run:

```bash
./node_modules/.bin/vitest run \
  src/renderer/styles/native-ui-system.contract.test.ts \
  src/renderer/styles/theme-contract.test.ts \
  src/renderer/styles/layout-contract.test.ts
```

Expected: all selected tests pass.

### Task 4: Polish Shell And Workspace Chrome

**Files:**
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/sidebar.css`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/tabs.css`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/terminal.css`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/browser-tab.css`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/index.html`
- Test: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/native-ui-system.contract.test.ts`
- Test: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/layout-contract.test.ts`
- Test: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/tab-bar-command-deck.test.ts`

- [ ] **Step 1: Add shell class hooks without changing structure**

In `/Users/batuhanyuksel/Documents/browser/src/renderer/index.html`, add class hooks:

```html
<div id="sidebar" class="sidebar-surface">
```

```html
<div id="tab-bar" class="tab-bar-surface">
```

```html
<div id="workspace-shell" class="workspace-shell-surface">
```

- [ ] **Step 2: Add sidebar row hook in renderer output**

In `/Users/batuhanyuksel/Documents/browser/src/renderer/components/sidebar.ts`, wherever project rows are created, ensure each project row includes `sidebar-project-row` in its class list:

```ts
item.className = `project-item sidebar-project-row${project.id === appState.activeProjectId ? ' active' : ''}`;
```

If the variable is not named `item`, apply the same class to the project row element that currently receives `project-item`.

- [ ] **Step 3: Restyle shell hooks**

Add these rules to the relevant stylesheets:

```css
/* sidebar.css */
.sidebar-surface {
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.028), rgba(255, 255, 255, 0)),
    var(--surface-rail);
}

.sidebar-project-row.active {
  background:
    linear-gradient(90deg, color-mix(in srgb, var(--accent-soft) 58%, transparent), transparent 72%),
    color-mix(in srgb, var(--surface-raised) 72%, transparent);
  border-color: color-mix(in srgb, var(--accent) 28%, var(--border-subtle));
}
```

```css
/* tabs.css */
.tab-bar-surface {
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.03), rgba(255, 255, 255, 0)),
    var(--surface-shell);
}
```

```css
/* terminal.css */
.terminal-pane.focused {
  border-color: color-mix(in srgb, var(--accent-line) 68%, var(--pane-focus));
}
```

```css
/* browser-tab.css */
.browser-toolbar-primary {
  display: flex;
  align-items: center;
  gap: var(--space-8);
  min-width: min(420px, 100%);
}
```

- [ ] **Step 4: Keep removed toolbar buttons protected**

Run:

```bash
./node_modules/.bin/vitest run src/renderer/components/tab-bar-command-deck.test.ts
```

Expected: passes and confirms old top toolbar buttons are not reintroduced.

- [ ] **Step 5: Run shell/style contract tests**

Run:

```bash
./node_modules/.bin/vitest run \
  src/renderer/styles/native-ui-system.contract.test.ts \
  src/renderer/styles/layout-contract.test.ts
```

Expected: all selected tests pass.

### Task 5: Add Floating UI Dependency And Helper

**Files:**
- Modify: `/Users/batuhanyuksel/Documents/browser/package.json`
- Modify: `/Users/batuhanyuksel/Documents/browser/package-lock.json`
- Create: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/floating-surface.ts`
- Create: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/floating-surface.test.ts`

- [ ] **Step 1: Install Floating UI DOM package**

Run:

```bash
npm install @floating-ui/dom
```

Expected: `package.json` and `package-lock.json` include `@floating-ui/dom`.

- [ ] **Step 2: Write helper tests**

Create `/Users/batuhanyuksel/Documents/browser/src/renderer/components/floating-surface.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('@floating-ui/dom', () => ({
  autoUpdate: vi.fn((_reference, _floating, update) => {
    update();
    return () => undefined;
  }),
  computePosition: vi.fn(async () => ({ x: 12, y: 24 })),
  flip: vi.fn((value) => ({ name: 'flip', options: value })),
  offset: vi.fn((value) => ({ name: 'offset', options: value })),
  shift: vi.fn((value) => ({ name: 'shift', options: value })),
  size: vi.fn((value) => ({ name: 'size', options: value })),
}));

describe('floating-surface', () => {
  it('positions a floating element and returns cleanup', async () => {
    const reference = document.createElement('button');
    const floating = document.createElement('div');
    const { anchorFloatingSurface } = await import('./floating-surface.js');

    const cleanup = anchorFloatingSurface(reference, floating);
    await Promise.resolve();

    expect(floating.style.left).toBe('12px');
    expect(floating.style.top).toBe('24px');
    expect(typeof cleanup).toBe('function');
  });
});
```

- [ ] **Step 3: Run helper test to verify RED**

Run:

```bash
./node_modules/.bin/vitest run src/renderer/components/floating-surface.test.ts
```

Expected: fails because `floating-surface.ts` does not exist.

- [ ] **Step 4: Implement the helper**

Create `/Users/batuhanyuksel/Documents/browser/src/renderer/components/floating-surface.ts`:

```ts
import {
  autoUpdate,
  computePosition,
  flip,
  offset,
  shift,
  size,
} from '@floating-ui/dom';

export type FloatingPlacement = 'bottom-start' | 'bottom-end' | 'top-start' | 'top-end' | 'right-start' | 'left-start';

export interface FloatingSurfaceOptions {
  placement?: FloatingPlacement;
  offsetPx?: number;
  maxWidthPx?: number;
  maxHeightPx?: number;
}

export function anchorFloatingSurface(
  reference: HTMLElement,
  floating: HTMLElement,
  options: FloatingSurfaceOptions = {},
): () => void {
  const {
    placement = 'bottom-start',
    offsetPx = 8,
    maxWidthPx = 420,
    maxHeightPx = 420,
  } = options;

  const update = async () => {
    const { x, y } = await computePosition(reference, floating, {
      placement,
      middleware: [
        offset(offsetPx),
        flip(),
        shift({ padding: 8 }),
        size({
          padding: 8,
          apply({ availableWidth, availableHeight, elements }) {
            Object.assign(elements.floating.style, {
              maxWidth: `${Math.max(180, Math.min(maxWidthPx, availableWidth))}px`,
              maxHeight: `${Math.max(120, Math.min(maxHeightPx, availableHeight))}px`,
            });
          },
        }),
      ],
    });

    Object.assign(floating.style, {
      position: 'absolute',
      left: `${x}px`,
      top: `${y}px`,
    });
  };

  const cleanup = autoUpdate(reference, floating, update);
  void update();
  return cleanup;
}
```

- [ ] **Step 5: Run helper test to verify GREEN**

Run:

```bash
./node_modules/.bin/vitest run src/renderer/components/floating-surface.test.ts
```

Expected: passes.

### Task 6: Migrate Custom Select To Floating UI

**Files:**
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/custom-select.ts`
- Create or modify test: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/custom-select.test.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/modals.css`

- [ ] **Step 1: Write custom select positioning tests**

Create `/Users/batuhanyuksel/Documents/browser/src/renderer/components/custom-select.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

const cleanup = vi.fn();
const anchorFloatingSurface = vi.fn(() => cleanup);

vi.mock('./floating-surface.js', () => ({ anchorFloatingSurface }));

describe('createCustomSelect', () => {
  it('anchors the dropdown when opened and cleans up when closed', async () => {
    const { createCustomSelect } = await import('./custom-select.js');
    const select = createCustomSelect('provider', [
      { value: 'claude', label: 'Claude' },
      { value: 'codex', label: 'Codex' },
    ], 'claude');

    document.body.appendChild(select.element);
    const trigger = select.element.querySelector('.custom-select-trigger') as HTMLButtonElement;
    trigger.click();

    expect(anchorFloatingSurface).toHaveBeenCalled();
    trigger.click();
    expect(cleanup).toHaveBeenCalled();

    select.destroy();
  });
});
```

- [ ] **Step 2: Run test to verify RED**

Run:

```bash
./node_modules/.bin/vitest run src/renderer/components/custom-select.test.ts
```

Expected: fails because `custom-select.ts` does not use `anchorFloatingSurface`.

- [ ] **Step 3: Update custom-select.ts**

In `/Users/batuhanyuksel/Documents/browser/src/renderer/components/custom-select.ts`, import the helper:

```ts
import { anchorFloatingSurface } from './floating-surface.js';
```

Add cleanup state inside `createCustomSelect`:

```ts
let floatingCleanup: (() => void) | null = null;
```

Update `openDropdown()`:

```ts
function openDropdown(): void {
  dropdown.classList.add('visible');
  trigger.classList.add('open');
  trigger.setAttribute('aria-expanded', 'true');
  wrapper.dataset.state = 'open';
  activeIndex = options.findIndex(o => o.value === hidden.value);
  floatingCleanup?.();
  floatingCleanup = anchorFloatingSurface(trigger, dropdown, {
    placement: 'bottom-start',
    offsetPx: 6,
    maxWidthPx: 360,
    maxHeightPx: 320,
  });
  updateActive();
}
```

Update `closeDropdown()`:

```ts
function closeDropdown(): void {
  floatingCleanup?.();
  floatingCleanup = null;
  dropdown.classList.remove('visible');
  trigger.classList.remove('open');
  trigger.setAttribute('aria-expanded', 'false');
  wrapper.dataset.state = 'closed';
  activeIndex = -1;
  items.forEach(el => el.classList.remove('active'));
}
```

Update returned `destroy()`:

```ts
destroy() {
  floatingCleanup?.();
  document.removeEventListener('mousedown', onOutsideClick);
}
```

- [ ] **Step 4: Ensure dropdown CSS supports absolute positioning**

In `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/modals.css`, ensure `.custom-select-dropdown` can float above modal content:

```css
.custom-select-dropdown {
  z-index: 10000;
  overflow-y: auto;
}
```

- [ ] **Step 5: Run focused select tests**

Run:

```bash
./node_modules/.bin/vitest run src/renderer/components/custom-select.test.ts
```

Expected: passes.

### Task 7: Migrate Browser Target Menu And Inspect Popovers

**Files:**
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/browser-tab/pane.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/browser-tab/popover.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/browser-tab/popover.test.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/browser-tab-pane.test.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/browser-tab.css`

- [ ] **Step 1: Extend browser popover tests**

Update `/Users/batuhanyuksel/Documents/browser/src/renderer/components/browser-tab/popover.test.ts` to assert movable popovers still clamp to pane bounds and expose a drag state:

```ts
expect(source).toContain('enablePopoverDragging');
expect(source).toContain('setPopoverPosition');
expect(source).toContain('dragging');
```

If this file is a runtime test rather than a source contract, add a source contract block using `readFileSync(new URL('./popover.ts', import.meta.url), 'utf-8')`.

- [ ] **Step 2: Extend browser pane tests for target clarity**

Update `/Users/batuhanyuksel/Documents/browser/src/renderer/components/browser-tab-pane.test.ts` to assert:

```ts
expect(source).toContain('Open Sessions');
expect(source).toContain('Send to selected');
expect(source).toContain('Select Session');
expect(source).toContain('browser-target-menu');
```

- [ ] **Step 3: Run focused tests to verify RED if copy/hooks are missing**

Run:

```bash
./node_modules/.bin/vitest run \
  src/renderer/components/browser-tab/popover.test.ts \
  src/renderer/components/browser-tab-pane.test.ts
```

Expected: failures if required target-copy or popover hooks are not present.

- [ ] **Step 4: Update browser target menu button copy**

In `/Users/batuhanyuksel/Documents/browser/src/renderer/components/browser-tab/pane.ts`, keep existing send behavior but make target menu actions explicit:

```ts
const selectedAction = document.createElement('button');
selectedAction.className = 'browser-target-menu-action primary';
selectedAction.textContent = 'Send to selected';
```

Keep existing `sendToSelectedSession`, `sendDrawToSelectedSession`, and `sendFlowToSelectedSession` calls. Do not change the routing logic.

- [ ] **Step 5: Use shared popover class in browser surfaces**

Where `targetMenu` and element-info popovers are created, add:

```ts
targetMenu.classList.add('calder-popover');
```

and for inspect/draw popovers:

```ts
popover.classList.add('calder-popover');
```

- [ ] **Step 6: Add browser popover styling**

In `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/browser-tab.css`, add:

```css
.browser-target-menu,
.browser-element-popover,
.browser-draw-popover {
  border-radius: var(--radius-lg);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.035), rgba(255, 255, 255, 0)),
    var(--surface-glass);
  border: 1px solid var(--border-subtle);
  box-shadow: var(--shadow-elevated);
}

.browser-target-menu-action.primary {
  background: var(--accent);
  border-color: transparent;
  color: white;
}

.browser-element-popover.dragging,
.browser-draw-popover.dragging {
  cursor: grabbing;
  border-color: var(--accent-line);
}
```

- [ ] **Step 7: Run focused browser tests**

Run:

```bash
./node_modules/.bin/vitest run \
  src/renderer/components/browser-tab/popover.test.ts \
  src/renderer/components/browser-tab-pane.test.ts \
  src/renderer/components/browser-tab/session-integration.test.ts
```

Expected: all selected tests pass and session integration tests confirm send behavior still works.

### Task 8: Rework Control Panel Into Operational Inspector

**Files:**
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/index.html`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/config-sections.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/readiness-section.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/git-panel.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/session-history.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/context-inspector.css`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/context-language.contract.test.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/config-sections.test.ts`

- [ ] **Step 1: Write/update Control Panel language tests**

Update `/Users/batuhanyuksel/Documents/browser/src/renderer/components/context-language.contract.test.ts`:

```ts
expect(indexSource).toContain('Control Panel');
expect(indexSource).toContain('AI Setup');
expect(indexSource).toContain('Changes');
expect(indexSource).toContain('Recent Sessions');
expect(indexSource).toContain('Toolchain');
expect(configSectionsSource).toContain("'MCP Servers'");
expect(configSectionsSource).toContain('Model Context Protocol');
expect(configSectionsSource).not.toContain("'Integrations'");
```

- [ ] **Step 2: Add operational surface hook**

In `/Users/batuhanyuksel/Documents/browser/src/renderer/index.html`, update the aside:

```html
<aside id="context-inspector" class="context-inspector-open control-panel-surface">
```

- [ ] **Step 3: Make config sections use shared list-row language**

In `/Users/batuhanyuksel/Documents/browser/src/renderer/components/config-sections.ts`, ensure config items include `calder-list-row`:

```ts
el.className = 'config-item config-item-clickable calder-list-row';
```

Use the same class addition for agent, skill, command, and MCP items.

- [ ] **Step 4: Convert panel cards to inspector groups**

In `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/context-inspector.css`, replace heavy card effects for `.config-section` and `.history-body` with:

```css
.control-panel-surface {
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.025), rgba(255, 255, 255, 0)),
    var(--surface-rail);
}

#context-inspector .config-section,
#context-inspector .history-body,
#context-inspector .readiness-section-card {
  border: 1px solid var(--border-hairline);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--surface-panel) 72%, transparent);
  box-shadow: none;
}
```

- [ ] **Step 5: Run focused Control Panel tests**

Run:

```bash
./node_modules/.bin/vitest run \
  src/renderer/components/context-language.contract.test.ts \
  src/renderer/components/config-sections.test.ts \
  src/renderer/styles/native-ui-system.contract.test.ts
```

Expected: all selected tests pass.

### Task 9: Polish Shared Modals And Preferences

**Files:**
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/modal.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/preferences-modal.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/modals.css`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/preferences.css`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/preferences-modal.contract.test.ts`

- [ ] **Step 1: Write modal/preference contract tests**

Update `/Users/batuhanyuksel/Documents/browser/src/renderer/components/preferences-modal.contract.test.ts`:

```ts
expect(source).toContain('Preferences');
expect(source).toContain('Provider');
expect(source).toContain('Tracking');
expect(styles).toContain('.preferences-shell');
expect(styles).toContain('.preferences-section');
expect(modalStyles).toContain('.modal-surface');
expect(modalSource).toContain('restoreFocusAfterClose');
```

If the test file does not currently load `modal.ts` and `modals.css`, add:

```ts
const modalSource = readFileSync(new URL('./modal.ts', import.meta.url), 'utf-8');
const modalStyles = readFileSync(new URL('../styles/modals.css', import.meta.url), 'utf-8');
```

- [ ] **Step 2: Run focused test to verify RED**

Run:

```bash
./node_modules/.bin/vitest run src/renderer/components/preferences-modal.contract.test.ts
```

Expected: fails because `restoreFocusAfterClose`, `.modal-surface`, or preferences shell hooks are missing.

- [ ] **Step 3: Add focus restoration to modal.ts**

In `/Users/batuhanyuksel/Documents/browser/src/renderer/components/modal.ts`, add module state:

```ts
let restoreFocusAfterClose: HTMLElement | null = null;
```

At the start of `showModal()`:

```ts
restoreFocusAfterClose = document.activeElement instanceof HTMLElement ? document.activeElement : null;
```

In `closeModal()` after `cleanup()`:

```ts
restoreFocusAfterClose?.focus?.();
restoreFocusAfterClose = null;
```

Add the surface class when opening:

```ts
modal.classList.add('modal-surface');
```

Use the existing `const modal = document.getElementById('modal')!;` if it already exists; otherwise add it beside the existing modal element constants.

- [ ] **Step 4: Add modal and preferences shell styles**

In `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/modals.css`, add:

```css
.modal-surface {
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-xl);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0)),
    var(--surface-glass);
  box-shadow: var(--shadow-elevated);
}
```

In `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/preferences.css`, add:

```css
.preferences-shell {
  display: grid;
  grid-template-columns: minmax(160px, 0.36fr) minmax(0, 1fr);
  gap: var(--space-16);
}

.preferences-section {
  border: 1px solid var(--border-hairline);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--surface-panel) 78%, transparent);
}
```

- [ ] **Step 5: Add preferences class hooks**

In `/Users/batuhanyuksel/Documents/browser/src/renderer/components/preferences-modal.ts`, add `preferences-shell` to the main wrapper element and `preferences-section` to each settings group. Keep all existing preference keys and persistence calls unchanged.

- [ ] **Step 6: Run focused modal/preferences test**

Run:

```bash
./node_modules/.bin/vitest run src/renderer/components/preferences-modal.contract.test.ts
```

Expected: passes.

### Task 10: Improve Agents, Skills, Commands Document Reading

**Files:**
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/file-reader.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/file-reader-agent-doc.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/file-viewer.css`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/file-reader-agent-doc.test.ts`

- [ ] **Step 1: Write document viewer contract tests**

Update `/Users/batuhanyuksel/Documents/browser/src/renderer/components/file-reader-agent-doc.test.ts`:

```ts
expect(source).toContain('agent-doc-shell');
expect(source).toContain('agent-doc-header');
expect(source).toContain('agent-doc-body');
expect(source).toContain('agent-doc-meta');
expect(styles).toContain('.agent-doc-shell');
expect(styles).toContain('.agent-doc-body');
```

If the test does not read styles yet, add:

```ts
const styles = readFileSync(new URL('../styles/file-viewer.css', import.meta.url), 'utf-8');
```

- [ ] **Step 2: Run focused test to verify RED**

Run:

```bash
./node_modules/.bin/vitest run src/renderer/components/file-reader-agent-doc.test.ts
```

Expected: fails if the document shell hooks are missing.

- [ ] **Step 3: Add document shell class hooks**

In `/Users/batuhanyuksel/Documents/browser/src/renderer/components/file-reader-agent-doc.ts`, ensure rendered agent/skill/command markdown uses:

```ts
wrapper.className = 'agent-doc-shell';
header.className = 'agent-doc-header';
meta.className = 'agent-doc-meta';
body.className = 'agent-doc-body';
```

Use existing wrapper/header/body variable names if they differ.

- [ ] **Step 4: Add document reader styles**

In `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/file-viewer.css`, add:

```css
.agent-doc-shell {
  height: 100%;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  background: var(--surface-workspace);
}

.agent-doc-header {
  padding: var(--space-16) var(--space-20);
  border-bottom: 1px solid var(--border-hairline);
  background: color-mix(in srgb, var(--surface-panel) 76%, transparent);
}

.agent-doc-meta {
  color: var(--text-muted);
  font-size: 11px;
  line-height: 1.5;
}

.agent-doc-body {
  min-height: 0;
  overflow: auto;
  padding: var(--space-20);
  color: var(--text-secondary);
  line-height: 1.65;
}

.agent-doc-body h1,
.agent-doc-body h2,
.agent-doc-body h3 {
  color: var(--text-primary);
  line-height: 1.2;
}
```

- [ ] **Step 5: Run focused document tests**

Run:

```bash
./node_modules/.bin/vitest run src/renderer/components/file-reader-agent-doc.test.ts
```

Expected: passes.

### Task 11: Add Accessibility And Reduced-Motion Guardrails

**Files:**
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/modal.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/custom-select.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/native-ui-system.contract.test.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/base.css`

- [ ] **Step 1: Extend native UI test for ARIA hooks**

Update `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/native-ui-system.contract.test.ts` or add a small component contract test:

```ts
const modalSource = readFileSync(new URL('../components/modal.ts', import.meta.url), 'utf-8');
const selectSource = readFileSync(new URL('../components/custom-select.ts', import.meta.url), 'utf-8');

expect(modalSource).toContain("role', 'dialog'");
expect(modalSource).toContain("aria-modal', 'true'");
expect(selectSource).toContain("role', 'listbox'");
expect(selectSource).toContain("role', 'option'");
```

- [ ] **Step 2: Run focused test to verify RED if hooks are missing**

Run:

```bash
./node_modules/.bin/vitest run src/renderer/styles/native-ui-system.contract.test.ts
```

Expected: fails if modal/select ARIA hooks are missing.

- [ ] **Step 3: Add modal ARIA attributes**

In `/Users/batuhanyuksel/Documents/browser/src/renderer/components/modal.ts`, when opening the modal add:

```ts
modal.setAttribute('role', 'dialog');
modal.setAttribute('aria-modal', 'true');
modal.setAttribute('aria-labelledby', 'modal-title');
```

- [ ] **Step 4: Add custom select ARIA attributes**

In `/Users/batuhanyuksel/Documents/browser/src/renderer/components/custom-select.ts`, add:

```ts
trigger.setAttribute('aria-haspopup', 'listbox');
dropdown.setAttribute('role', 'listbox');
```

For each option item:

```ts
item.setAttribute('role', 'option');
item.setAttribute('aria-selected', String(opt.value === hidden.value));
```

When selection changes, update `aria-selected`:

```ts
items.forEach((el, itemIndex) => {
  el.classList.toggle('selected', itemIndex === index);
  el.setAttribute('aria-selected', String(itemIndex === index));
});
```

- [ ] **Step 5: Run focused accessibility guardrail test**

Run:

```bash
./node_modules/.bin/vitest run src/renderer/styles/native-ui-system.contract.test.ts
```

Expected: passes.

### Task 12: Final Verification And Visual Smoke Run

**Files:**
- No required source changes unless verification finds a regression.

- [ ] **Step 1: Run full build**

Run:

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 2: Run full tests**

Run:

```bash
npm test
```

Expected: all Vitest files pass.

- [ ] **Step 3: Search for banned visual regressions**

Run:

```bash
rg -n "btn-command-deck-more|btn-toggle-context-inspector|Integrations|dashboard-card-grid|Shoelace|shadcn|Radix|ReactDOM" /Users/batuhanyuksel/Documents/browser/src /Users/batuhanyuksel/Documents/browser/package.json
```

Expected: no runtime UI matches for removed buttons, old `Integrations` copy, or disallowed framework/library adoption. Test files may contain negative assertions only.

- [ ] **Step 4: Launch the app for visual smoke testing**

Run:

```bash
npm start
```

Expected: Calder opens.

Manually verify:
- Sidebar project switching still works.
- New session button still creates the selected provider session.
- Browser tab still stays left when browser is open.
- CLI sessions fit to the right side.
- Browser inspect popover is movable and does not clip.
- Browser send-to-session still sends to the selected open session.
- Control Panel can be opened from the View menu if closed.
- Preferences opens from the sidebar gear and app menu.
- Agents, Skills, and Commands markdown documents are easier to read.
- `prefers-reduced-motion` users do not get distracting transitions.

- [ ] **Step 5: Report final status**

If all checks pass, report:

```text
Build: passed
Tests: passed
Visual smoke: passed
Known risks: none beyond manual long-session use
```

If a visual issue remains, report the exact surface, reproduction path, and file to adjust first.

## Self-Review

- Spec coverage: This plan covers interface inventory, token/primitives foundation, shell/workspace polish, Floating UI adoption, browser workflow polish, Control Panel, modals/preferences, document reading surfaces, accessibility, reduced motion, and final verification.
- Draft-marker scan: no incomplete planning language is intended in task steps.
- Type consistency: `anchorFloatingSurface`, `FloatingSurfaceOptions`, `calder-*` primitive classes, and `agent-doc-*` document classes are used consistently across tasks.
