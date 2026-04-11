# Calder Browser Session Mosaic Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current browser-plus-swarm toggle with a persistent browser-left session mosaic that keeps open CLI sessions visible on the right, supports smart arrangement presets, and allows draggable resizing for both the browser split and internal session panes.

**Architecture:** First, normalize the old `swarm` state into a new browser-aware `mosaic` layout model so persisted projects can restore deterministic presets and ratios. Then move preset selection and ratio clamping into small pure helpers, teach the renderer to compose browser-left + right-side mosaic DOM from that model, and finally add draggable dividers plus a preset control in the top bar without disturbing session creation or browser targeting.

**Tech Stack:** Electron, TypeScript, DOM-rendered renderer UI, Vitest, persisted JSON state in `~/.calder/state.json`

---

### Task 1: Introduce A Real Mosaic Layout Model

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/renderer/state.ts`
- Modify: `src/renderer/state.test.ts`

- [ ] **Step 1: Write the failing layout-state tests**

Add focused tests proving:
- legacy `layout.mode === 'swarm'` is normalized to `mosaic` on load
- new projects default to `mosaic`
- `splitPanes` still stores only CLI session ids
- `browserWidthRatio`, `mosaicPreset`, and `mosaicRatios` persist on the project layout object

Use test shapes like:

```ts
expect(appState.activeProject!.layout).toMatchObject({
  mode: 'mosaic',
  splitPanes: [sessionA.id, sessionB.id],
  browserWidthRatio: 0.38,
  mosaicPreset: 'columns-2',
});
```

- [ ] **Step 2: Run the focused state tests to verify failure**

Run: `npm test -- src/renderer/state.test.ts`

Expected:
- FAIL because `ProjectRecord.layout.mode` still only supports `tabs | split | swarm`
- FAIL because layout persistence helpers do not know about preset or ratio fields

- [ ] **Step 3: Implement the minimal shared types and normalization helpers**

Update `src/shared/types.ts` so layout state becomes explicit and browser-aware:

```ts
export type ProjectLayoutMode = 'tabs' | 'mosaic';
export type MosaicPreset =
  | 'single'
  | 'columns-2'
  | 'rows-2'
  | 'focus-left'
  | 'focus-top'
  | 'grid-2x2';

export interface ProjectLayoutState {
  mode: ProjectLayoutMode;
  splitPanes: string[];
  splitDirection: 'horizontal' | 'vertical';
  browserWidthRatio?: number;
  mosaicPreset?: MosaicPreset;
  mosaicRatios?: Record<string, number>;
}
```

In `src/renderer/state.ts`, add a normalization helper and use it during load/project creation:

```ts
function normalizeProjectLayout(layout?: Partial<ProjectRecord['layout']>): ProjectRecord['layout'] {
  const mode = layout?.mode === 'tabs' ? 'tabs' : 'mosaic';
  return {
    mode,
    splitPanes: Array.isArray(layout?.splitPanes) ? [...layout!.splitPanes] : [],
    splitDirection: layout?.splitDirection === 'vertical' ? 'vertical' : 'horizontal',
    browserWidthRatio: typeof layout?.browserWidthRatio === 'number' ? layout.browserWidthRatio : 0.38,
    mosaicPreset: layout?.mosaicPreset,
    mosaicRatios: layout?.mosaicRatios ? { ...layout.mosaicRatios } : {},
  };
}
```

Also update every old `project.layout.mode === 'swarm'` branch to use `mosaic`.

- [ ] **Step 4: Re-run the focused state tests**

Run: `npm test -- src/renderer/state.test.ts`

Expected:
- PASS for the new layout-shape and normalization coverage

- [ ] **Step 5: Commit**

```bash
git add src/shared/types.ts src/renderer/state.ts src/renderer/state.test.ts
git commit -m "add calder mosaic layout state"
```

### Task 2: Add Pure Mosaic Preset Resolution Helpers

**Files:**
- Create: `src/renderer/components/mosaic-layout-model.ts`
- Create: `src/renderer/components/mosaic-layout-model.test.ts`
- Modify: `src/renderer/components/split-layout.ts`

- [ ] **Step 1: Write the failing preset-resolution tests**

Create focused tests that lock these rules:
- 1 session -> `single`
- 2 sessions -> default `columns-2`
- 3 sessions -> default `focus-left`
- 4 sessions -> `grid-2x2`
- invalid preset for current count is clamped back to the right default
- invalid ratios are clamped to a safe min/max range

Example expectations:

```ts
expect(resolveMosaicPreset(3, undefined)).toBe('focus-left');
expect(resolveMosaicPreset(2, 'focus-left')).toBe('columns-2');
expect(clampRatio(0.05, 0.2, 0.8)).toBe(0.2);
```

- [ ] **Step 2: Run the new preset tests to verify failure**

Run: `npm test -- src/renderer/components/mosaic-layout-model.test.ts`

Expected:
- FAIL because the helper module does not exist yet

- [ ] **Step 3: Implement a pure resolver module**

Create `src/renderer/components/mosaic-layout-model.ts` with small pure helpers only:

```ts
export function defaultPresetForCount(count: number): MosaicPreset {
  if (count <= 1) return 'single';
  if (count === 2) return 'columns-2';
  if (count === 3) return 'focus-left';
  return 'grid-2x2';
}

export function resolveMosaicPreset(count: number, requested?: MosaicPreset): MosaicPreset {
  const valid = validPresetsForCount(count);
  return requested && valid.includes(requested) ? requested : defaultPresetForCount(count);
}

export function clampRatio(value: number | undefined, min = 0.2, max = 0.8, fallback = 0.5): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}
```

Keep DOM-free logic here so renderer tests stay smaller.

- [ ] **Step 4: Wire `split-layout.ts` to the new helper without changing behavior yet**

Import the pure functions and replace ad-hoc `swarm` count math with resolver calls, but do not add draggable dividers yet. This step should only centralize preset computation.

- [ ] **Step 5: Re-run the focused preset tests**

Run: `npm test -- src/renderer/components/mosaic-layout-model.test.ts`

Expected:
- PASS for preset and ratio clamping

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/mosaic-layout-model.ts \
  src/renderer/components/mosaic-layout-model.test.ts \
  src/renderer/components/split-layout.ts
git commit -m "add mosaic preset resolution helpers"
```

### Task 3: Render Browser-Left + Session Mosaic Presets

**Files:**
- Modify: `src/renderer/components/split-layout.ts`
- Modify: `src/renderer/components/split-layout.test.ts`
- Modify: `src/renderer/styles/terminal.css`
- Modify: `src/renderer/styles/session-inspector.css`

- [ ] **Step 1: Write the failing renderer tests for every supported preset**

Extend `src/renderer/components/split-layout.test.ts` with cases for:
- browser-left + 1 session -> browser column + one large session area
- browser-left + 2 sessions -> two right-side session panes
- browser-left + 3 sessions -> one large left session plus two stacked right sessions
- browser-left + 4 sessions -> 2x2 right-side grid
- no browser -> right-side mosaic expands to full width

Use DOM assertions like:

```ts
expect(container.querySelector('.mosaic-browser-column')).toBeTruthy();
expect(container.querySelector('.mosaic-session-canvas')).toBeTruthy();
expect(container.style.gridTemplateColumns).toContain('minmax');
expect(sessionPane.parentElement?.className).toContain('mosaic-focus-left-main');
```

- [ ] **Step 2: Run the focused layout tests to verify failure**

Run: `npm test -- src/renderer/components/split-layout.test.ts`

Expected:
- FAIL because only the old `swarm-grid-wrapper` layout exists

- [ ] **Step 3: Implement the mosaic DOM wrappers and preset render paths**

Refactor `split-layout.ts` so it builds a browser-left shell and a right-side session canvas using preset-specific wrappers:

```ts
function renderMosaicMode(project: ProjectRecord): void {
  const browserSession = getMosaicBrowserSession(project);
  const visibleSessions = getVisibleMosaicSessions(project);
  const preset = resolveMosaicPreset(visibleSessions.length, project.layout.mosaicPreset);

  if (browserSession) {
    renderBrowserLeftWorkspace(project, browserSession, visibleSessions, preset);
  } else {
    renderSessionOnlyWorkspace(project, visibleSessions, preset);
  }
}
```

Add semantic wrappers instead of overloading one grid:
- `.mosaic-browser-column`
- `.mosaic-session-canvas`
- `.mosaic-columns-2`
- `.mosaic-focus-left-main`
- `.mosaic-focus-left-stack`

- [ ] **Step 4: Update CSS to match the new structure**

Add structural styles in `src/renderer/styles/terminal.css`:

```css
#terminal-container.mosaic-mode {
  display: grid;
  gap: 10px;
}

.mosaic-session-canvas {
  display: grid;
  min-width: 0;
  min-height: 0;
  gap: 10px;
}

.mosaic-focus-left {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 0.8fr);
}
```

Update `session-inspector.css` selectors from `.swarm-mode` to `.mosaic-mode` where needed.

- [ ] **Step 5: Re-run the focused layout tests**

Run: `npm test -- src/renderer/components/split-layout.test.ts`

Expected:
- PASS for browser-left preset rendering

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/split-layout.ts \
  src/renderer/components/split-layout.test.ts \
  src/renderer/styles/terminal.css \
  src/renderer/styles/session-inspector.css
git commit -m "render browser-left session mosaic presets"
```

### Task 4: Add Draggable Browser And Mosaic Dividers

**Files:**
- Create: `src/renderer/components/mosaic-resize.ts`
- Create: `src/renderer/components/mosaic-resize.test.ts`
- Modify: `src/renderer/components/split-layout.ts`
- Modify: `src/renderer/state.ts`
- Modify: `src/renderer/styles/terminal.css`

- [ ] **Step 1: Write the failing resize tests**

Add focused tests that prove:
- dragging the browser/session divider updates `layout.browserWidthRatio`
- dragging an internal preset divider updates `layout.mosaicRatios`
- ratios are clamped and persisted

Example test shape:

```ts
expect(appState.activeProject!.layout.browserWidthRatio).toBeCloseTo(0.44, 2);
expect(appState.activeProject!.layout.mosaicRatios?.['focus-left-main']).toBeCloseTo(0.62, 2);
```

- [ ] **Step 2: Run the resize test slice to verify failure**

Run: `npm test -- src/renderer/components/mosaic-resize.test.ts`

Expected:
- FAIL because there is no resize controller or ratio persistence path

- [ ] **Step 3: Add small state setters for persisted ratios**

In `src/renderer/state.ts`, add dedicated setters instead of mutating layout objects all over the renderer:

```ts
setBrowserWidthRatio(projectId: string, ratio: number): void {
  const project = this.state.projects.find((p) => p.id === projectId);
  if (!project) return;
  project.layout.browserWidthRatio = clampRatio(ratio, 0.25, 0.7, 0.38);
  this.persist();
  this.emit('layout-changed');
}

setMosaicRatio(projectId: string, key: string, ratio: number): void {
  const project = this.state.projects.find((p) => p.id === projectId);
  if (!project) return;
  const next = { ...(project.layout.mosaicRatios ?? {}) };
  next[key] = clampRatio(ratio, 0.2, 0.8, next[key] ?? 0.5);
  project.layout.mosaicRatios = next;
  this.persist();
  this.emit('layout-changed');
}
```

- [ ] **Step 4: Implement the resize controller**

Create `src/renderer/components/mosaic-resize.ts` with pointer-driven helpers:

```ts
export function attachHorizontalRatioHandle(
  handle: HTMLElement,
  getBounds: () => DOMRect,
  onRatio: (ratio: number) => void,
): () => void {
  const onPointerDown = (event: PointerEvent) => {
    const bounds = getBounds();
    const onPointerMove = (moveEvent: PointerEvent) => {
      const ratio = (moveEvent.clientX - bounds.left) / bounds.width;
      onRatio(ratio);
    };
    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp, { once: true });
    event.preventDefault();
  };
  handle.addEventListener('pointerdown', onPointerDown);
  return () => handle.removeEventListener('pointerdown', onPointerDown);
}
```

Use it from `split-layout.ts` to bind:
- browser/session divider
- 2-session column divider
- 3-session focus-left vertical divider
- 3-session stack horizontal divider

- [ ] **Step 5: Add visible divider styling**

Add CSS for handles that reads as professional layout chrome instead of debug bars:

```css
.mosaic-divider {
  position: relative;
  background: color-mix(in srgb, var(--border-subtle) 86%, transparent);
  border-radius: 999px;
}

.mosaic-divider[data-axis='x'] {
  width: 6px;
  cursor: col-resize;
}
```

- [ ] **Step 6: Re-run the focused resize tests**

Run: `npm test -- src/renderer/components/mosaic-resize.test.ts`

Expected:
- PASS for browser and internal ratio persistence

- [ ] **Step 7: Commit**

```bash
git add src/renderer/components/mosaic-resize.ts \
  src/renderer/components/mosaic-resize.test.ts \
  src/renderer/components/split-layout.ts \
  src/renderer/state.ts \
  src/renderer/styles/terminal.css
git commit -m "add resizable mosaic dividers"
```

### Task 5: Repurpose The Top-Bar Toggle Into A Preset Control

**Files:**
- Modify: `src/renderer/components/tab-bar.ts`
- Modify: `src/renderer/index.html`
- Modify: `src/renderer/styles/tabs.css`
- Create: `src/renderer/components/tab-bar-mosaic-control.test.ts`

- [ ] **Step 1: Write the failing top-bar control tests**

Add tests proving:
- the old swarm button now reflects mosaic preset state instead of simple on/off
- with 2 sessions, the control can switch between `columns-2` and `rows-2`
- with 3 sessions, the control can switch between `focus-left` and `focus-top`

Example assertions:

```ts
expect(button.getAttribute('aria-label')).toContain('Session layout');
expect(button.dataset.preset).toBe('focus-left');
```

- [ ] **Step 2: Run the focused control tests to verify failure**

Run: `npm test -- src/renderer/components/tab-bar-mosaic-control.test.ts`

Expected:
- FAIL because `btn-toggle-swarm` still exposes only binary active/idle semantics

- [ ] **Step 3: Implement preset-aware control behavior**

Update `tab-bar.ts` so the old toggle button becomes a small preset selector:

```ts
btnToggleSwarm.addEventListener('click', (event) => {
  event.preventDefault();
  showMosaicPresetMenu();
});
```

Render state from project layout:

```ts
btnToggleSwarm.dataset.state = project.layout.mode === 'mosaic' ? 'active' : 'idle';
btnToggleSwarm.dataset.preset = project.layout.mosaicPreset ?? 'single';
btnToggleSwarm.setAttribute('aria-label', 'Choose session layout');
```

The control should:
- enter mosaic mode if currently in tabs
- otherwise open/cycle valid presets for the current session count
- never collapse the right-side workspace back to tabs as a side effect of a preset change

- [ ] **Step 4: Add compact styling for the preset control**

Update `tabs.css` so the control still fits the command deck and visually matches the new layout model. Keep the icon compact, but show active preset state through `data-preset` and tooltip text.

- [ ] **Step 5: Re-run the focused top-bar tests**

Run: `npm test -- src/renderer/components/tab-bar-mosaic-control.test.ts`

Expected:
- PASS for preset switching behavior

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/tab-bar.ts \
  src/renderer/index.html \
  src/renderer/styles/tabs.css \
  src/renderer/components/tab-bar-mosaic-control.test.ts
git commit -m "repurpose layout toggle into mosaic preset control"
```

### Task 6: Full Verification And Manual Workspace Smoke Test

**Files:**
- Verify: `src/renderer/components/split-layout.ts`
- Verify: `src/renderer/components/mosaic-layout-model.ts`
- Verify: `src/renderer/components/mosaic-resize.ts`
- Verify: `src/renderer/components/tab-bar.ts`

- [ ] **Step 1: Run the full test suite**

Run: `npm test`

Expected:
- all Vitest suites pass

- [ ] **Step 2: Run the production build**

Run: `npm run build`

Expected:
- exit code `0`

- [ ] **Step 3: Launch Calder and manually verify the layout stories**

Run: `npm start`

Verify manually:
- one browser + one CLI session renders browser-left + one large right session
- adding a second CLI session keeps both sessions visible on the right
- with three sessions, the default preset is one large left session plus two stacked right sessions
- the preset control changes arrangement without collapsing the session workspace
- dragging the browser divider and an internal mosaic divider persists after relaunch
