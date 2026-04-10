# Calder Precision Cockpit Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign Calder into a more modern, premium, clearly-owned desktop interface while preserving the existing workflow model, split/session behavior, and information architecture.

**Architecture:** Keep the current renderer structure, ids, and app state flow intact, but upgrade the shell in layers: first establish stronger shell DOM hooks and a tokenized cockpit design system, then redesign the highest-visibility surfaces in place. Favor markup additions and CSS systemization over behavioral rewrites so fast session creation, split handling, provider flows, and modal behavior remain unchanged.

**Tech Stack:** Electron, TypeScript, vanilla DOM renderer, CSS, Vitest

---

## File Structure Lock

These are the files this redesign should use and why:

- `/Users/batuhanyuksel/Documents/browser/src/renderer/index.html`
  Main shell DOM. Safe place to add non-behavioral wrappers for cockpit chrome.
- `/Users/batuhanyuksel/Documents/browser/src/renderer/styles.css`
  Shared stylesheet import list. Use to introduce any new shared cockpit stylesheet.
- `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/base.css`
  Global tokens, typography, shell foundations, selection/focus behavior.
- `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/sidebar.css`
  Sidebar chrome, project rail, update banner, footer rhythm.
- `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/tabs.css`
  Top chrome, tabs, git status rail, action buttons, tab context menu.
- `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/terminal.css`
  Workspace framing, terminal pane chrome, project terminal shell.
- `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/browser-tab.css`
  Browser toolbar, empty state, viewport controls, inspect/draw popovers.
- `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/modals.css`
  Shared modal system, config sections, shared control polish.
- `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/preferences.css`
  Preferences flagship modal layout and section polish.
- `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/usage.css`
  Usage/help-adjacent large modal surfaces that should align with the new cockpit system.
- `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/alerts.css`
  Alert banners, readiness surfaces, progress and semantic UI.
- `/Users/batuhanyuksel/Documents/browser/src/renderer/dom-utils.ts`
  Shared semantic color mapping.
- `/Users/batuhanyuksel/Documents/browser/src/renderer/components/browser-tab/pane.ts`
  Browser session DOM and empty-state structure.
- `/Users/batuhanyuksel/Documents/browser/src/renderer/components/preferences-modal.ts`
  Preferences modal DOM and section composition.
- `/Users/batuhanyuksel/Documents/browser/src/renderer/components/modal.ts`
  Shared modal body/footer and generic field composition.
- `/Users/batuhanyuksel/Documents/browser/src/renderer/components/custom-select.ts`
  Shared select control behavior and DOM hooks.
- `/Users/batuhanyuksel/Documents/browser/src/renderer/components/sidebar.ts`
  Project sidebar markup that can take richer shell classes without changing logic.
- `/Users/batuhanyuksel/Documents/browser/src/renderer/components/tab-bar.ts`
  Tab shell behavior and top action grouping.
- `/Users/batuhanyuksel/Documents/browser/src/renderer/components/config-sections.ts`
  Sidebar config section markup that should inherit the new cockpit hierarchy.
- `/Users/batuhanyuksel/Documents/browser/src/renderer/components/readiness-section.ts`
  Sidebar readiness summary UI that should align with the new secondary surface language.

New tests to create:

- `/Users/batuhanyuksel/Documents/browser/src/renderer/index-shell.test.ts`
  Verifies the shell HTML contains the new cockpit wrapper structure.
- `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/theme-contract.test.ts`
  Verifies required cockpit tokens exist.
- `/Users/batuhanyuksel/Documents/browser/src/renderer/components/browser-tab-pane.test.ts`
  Verifies the redesigned browser pane DOM still exposes the new grouped toolbar and branded empty state.

---

### Task 1: Add Shell DOM Hooks And Lock The New Chrome Contract

**Files:**
- Create: `/Users/batuhanyuksel/Documents/browser/src/renderer/index-shell.test.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/index.html`

- [ ] **Step 1: Write the failing shell-structure test**

Create `/Users/batuhanyuksel/Documents/browser/src/renderer/index-shell.test.ts` with:

```ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf-8');

describe('index shell contract', () => {
  it('exposes cockpit wrappers for sidebar and top bar chrome', () => {
    expect(html).toContain('class="sidebar-title-group"');
    expect(html).toContain('class="sidebar-brand-block"');
    expect(html).toContain('class="tab-bar-main"');
    expect(html).toContain('class="tab-bar-meta"');
  });
});
```

- [ ] **Step 2: Run the test to verify RED**

Run:

```bash
./node_modules/.bin/vitest run src/renderer/index-shell.test.ts
```

Expected: FAIL because those wrapper classes are not yet in `index.html`.

- [ ] **Step 3: Add non-behavioral cockpit wrappers to the shell HTML**

Update `/Users/batuhanyuksel/Documents/browser/src/renderer/index.html` so the sidebar and tab bar gain structure without changing ids used by existing code:

```html
<div id="sidebar-header">
  <div class="sidebar-title-group">
    <button id="btn-toggle-sidebar" class="icon-btn" title="Toggle Sidebar (Cmd+B)">&#x25E7;</button>
    <div class="sidebar-brand-block">
      <span class="sidebar-eyebrow">Calder</span>
      <span class="sidebar-title">Projects</span>
    </div>
  </div>
  <div class="sidebar-header-actions">
    <button id="btn-preferences" class="icon-btn" title="Preferences">&#x2699;</button>
    <button id="btn-add-project" class="icon-btn" title="New Project (Ctrl+Shift+P)">+</button>
  </div>
</div>
```

and:

```html
<div id="tab-bar">
  <div class="tab-bar-main">
    <div id="tab-list"></div>
  </div>
  <div class="tab-bar-meta">
    <div id="git-status"></div>
    <div id="tab-actions">
      <button id="btn-help" class="icon-btn" title="Session Indicators Help (F1)">?</button>
      <button id="btn-usage-stats" class="icon-btn" title="Usage Stats (Ctrl+Shift+U)">&#x2261;</button>
      <button id="btn-toggle-terminal" class="icon-btn" title="Toggle Terminal (Ctrl+\`)">&#x2588;</button>
      <button id="btn-add-mcp-inspector" class="icon-btn" title="MCP Inspector">MCP</button>
      <button id="btn-toggle-swarm" class="icon-btn" title="Toggle Swarm Mode (Ctrl+\\)">&#x229E;</button>
      <button id="btn-add-session" class="icon-btn" title="New Session (Ctrl+Shift+N)">+</button>
    </div>
  </div>
</div>
```

- [ ] **Step 4: Run the shell-structure test to verify GREEN**

Run:

```bash
./node_modules/.bin/vitest run src/renderer/index-shell.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the shell DOM contract**

```bash
git add src/renderer/index.html src/renderer/index-shell.test.ts
git commit -m "implement cockpit shell html wrappers"
```

Expected: commit succeeds.

---

### Task 2: Build The Shared Precision Cockpit Theme System

**Files:**
- Create: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/theme-contract.test.ts`
- Create: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/cockpit.css`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles.css`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/base.css`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/dom-utils.ts`

- [ ] **Step 1: Write the failing theme contract test**

Create `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/theme-contract.test.ts` with:

```ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const baseCss = readFileSync(new URL('./base.css', import.meta.url), 'utf-8');
const cockpitCss = readFileSync(new URL('./cockpit.css', import.meta.url), 'utf-8');

describe('precision cockpit theme contract', () => {
  it('defines the shared cockpit design tokens', () => {
    expect(baseCss).toContain('--surface-canvas');
    expect(baseCss).toContain('--surface-panel');
    expect(baseCss).toContain('--surface-elevated');
    expect(baseCss).toContain('--control-height-md');
    expect(baseCss).toContain('--accent-soft');
  });

  it('defines shared cockpit control classes', () => {
    expect(cockpitCss).toContain('.shell-kicker');
    expect(cockpitCss).toContain('.control-chip');
    expect(cockpitCss).toContain('.surface-card');
  });
});
```

- [ ] **Step 2: Run the theme contract test to verify RED**

Run:

```bash
./node_modules/.bin/vitest run src/renderer/styles/theme-contract.test.ts
```

Expected: FAIL because the new token and class names do not exist yet.

- [ ] **Step 3: Add the shared cockpit stylesheet and import it**

Create `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/cockpit.css` with:

```css
.shell-kicker {
  font-size: 10px;
  line-height: 1;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}

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
  background: var(--surface-panel);
  color: var(--text-secondary);
}
```

Then update `/Users/batuhanyuksel/Documents/browser/src/renderer/styles.css` to import it immediately after `base.css`:

```css
@import url('./styles/base.css');
@import url('./styles/cockpit.css');
```

- [ ] **Step 4: Replace the base token system with cockpit-level foundations**

Update `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/base.css` to establish the new system:

```css
:root {
  --surface-canvas: #080d12;
  --surface-panel: #10161d;
  --surface-panel-2: #161d26;
  --surface-elevated: #151c24;
  --surface-hover: #1c2632;
  --border-subtle: #273241;
  --border-strong: #354457;
  --accent: #ef5c72;
  --accent-soft: rgba(239, 92, 114, 0.12);
  --control-height-sm: 28px;
  --control-height-md: 34px;
  --shadow-soft: 0 18px 40px rgba(0, 0, 0, 0.24);
  --shadow-elevated: 0 30px 72px rgba(0, 0, 0, 0.38);
}
```

and map the existing variables onto those new foundations instead of removing them:

```css
:root {
  --bg-primary: var(--surface-canvas);
  --bg-secondary: var(--surface-panel);
  --bg-tertiary: var(--surface-panel-2);
  --bg-hover: var(--surface-hover);
  --border: var(--border-subtle);
}
```

- [ ] **Step 5: Align semantic color helpers**

Update `/Users/batuhanyuksel/Documents/browser/src/renderer/dom-utils.ts` so readiness colors use the same semantic palette as the new shell:

```ts
export function scoreColor(score: number): string {
  if (score >= 70) return '#57b483';
  if (score >= 40) return '#d8a44c';
  return '#ef5c72';
}
```

- [ ] **Step 6: Run the theme contract test to verify GREEN**

Run:

```bash
./node_modules/.bin/vitest run src/renderer/styles/theme-contract.test.ts
```

Expected: PASS.

- [ ] **Step 7: Run a build to verify the new foundations compile**

Run:

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 8: Commit the new shared theme system**

```bash
git add src/renderer/styles.css src/renderer/styles/base.css src/renderer/styles/cockpit.css src/renderer/styles/theme-contract.test.ts src/renderer/dom-utils.ts
git commit -m "implement precision cockpit theme tokens"
```

Expected: commit succeeds.

---

### Task 3: Redesign Sidebar And Top Chrome Into A Control Tower

**Files:**
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/sidebar.css`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/tabs.css`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/sidebar.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/tab-bar.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/config-sections.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/readiness-section.ts`
- Test: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/config-sections.test.ts`

- [ ] **Step 1: Add a failing config-section test for cockpit section headers**

Append this test to `/Users/batuhanyuksel/Documents/browser/src/renderer/components/config-sections.test.ts`:

```ts
it('renders cockpit section count and action affordances', async () => {
  await refresh();
  const headerHtml = document.getElementById('config-sections')!.innerHTML;
  expect(headerHtml).toContain('config-section-count');
  expect(headerHtml).toContain('config-section-header');
  expect(headerHtml).toContain('config-item-clickable');
});
```

- [ ] **Step 2: Run the focused test to verify current behavior still gives you coverage**

Run:

```bash
./node_modules/.bin/vitest run src/renderer/components/config-sections.test.ts
```

Expected: PASS now, giving you a safe edit harness before visual changes.

- [ ] **Step 3: Rebuild the sidebar chrome in CSS without changing the sidebar logic**

Update `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/sidebar.css` so the sidebar becomes a stronger rail:

```css
#sidebar {
  background: linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0)) , var(--surface-panel);
  border-right: 1px solid var(--border-subtle);
}

.sidebar-title-group {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.sidebar-brand-block {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.project-item.active {
  background: linear-gradient(90deg, var(--accent-soft), transparent);
  border-left-color: var(--accent);
}
```

- [ ] **Step 4: Enrich the sidebar project markup with extra hooks instead of changing behavior**

Update `/Users/batuhanyuksel/Documents/browser/src/renderer/components/sidebar.ts` so each project row gets a stable content wrapper:

```ts
el.innerHTML = `
  <div class="project-item-main">
    <div class="project-name-row">
      <div class="project-name${hasUnreadInProject(project.id) ? ' unread' : ''}">${esc(project.name)}</div>
      ${project.sessions.length ? `<span class="project-session-count">${project.sessions.length}</span>` : ''}
    </div>
    <div class="project-path">${esc(project.path)}</div>
  </div>
  <span class="project-delete" title="Remove project">&times;</span>
`;
```

- [ ] **Step 5: Rebuild the tab bar as cockpit chrome**

Update `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/tabs.css` so the top bar becomes segmented instead of flat:

```css
#tab-bar {
  height: 44px;
  background: var(--surface-panel);
  border-bottom: 1px solid var(--border-subtle);
}

.tab-bar-main {
  display: flex;
  flex: 1;
  min-width: 0;
}

.tab-bar-meta {
  display: flex;
  align-items: center;
  gap: 0;
  border-left: 1px solid var(--border-subtle);
  background: rgba(255,255,255,0.02);
}
```

and make active tabs feel anchored rather than loud:

```css
.tab-item.active {
  background: var(--surface-elevated);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.03);
}
```

- [ ] **Step 6: Tighten tab-bar behavior glue without changing flows**

Update `/Users/batuhanyuksel/Documents/browser/src/renderer/components/tab-bar.ts` only where the new structure needs grouping-safe assumptions. For example, keep using the same ids, but do not query parent ordering.

Use this rule when editing:

```ts
const gitStatusEl = document.getElementById('git-status')!;
const tabListEl = document.getElementById('tab-list')!;
const btnAddSession = document.getElementById('btn-add-session')!;
```

Do not replace these ids or move the action ids out of `index.html`.

- [ ] **Step 7: Align config and readiness sections with the new control-tower language**

Update `/Users/batuhanyuksel/Documents/browser/src/renderer/components/config-sections.ts` and `/Users/batuhanyuksel/Documents/browser/src/renderer/components/readiness-section.ts` only to add better structural text and rely on CSS, for example:

```ts
header.innerHTML = `<span class="config-section-toggle ${isCollapsed ? 'collapsed' : ''}">&#x25BC;</span><span class="config-section-label">${title}</span><span class="config-section-count">${count}</span>`;
```

and:

```ts
header.innerHTML = `${toggleSpan}<span class="config-section-label">AI Readiness</span>${scoreBadge}`;
```

- [ ] **Step 8: Run focused verification**

Run:

```bash
./node_modules/.bin/vitest run src/renderer/components/config-sections.test.ts
npm run build
```

Expected:
- config sections test passes
- build succeeds

- [ ] **Step 9: Commit the shell chrome redesign**

```bash
git add src/renderer/styles/sidebar.css src/renderer/styles/tabs.css src/renderer/components/sidebar.ts src/renderer/components/tab-bar.ts src/renderer/components/config-sections.ts src/renderer/components/readiness-section.ts src/renderer/components/config-sections.test.ts
git commit -m "implement cockpit sidebar and top chrome"
```

Expected: commit succeeds.

---

### Task 4: Redesign The Browser Surface As Calder's Flagship Workspace

**Files:**
- Create: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/browser-tab-pane.test.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/browser-tab/pane.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/browser-tab.css`

- [ ] **Step 1: Write the failing browser pane DOM test**

Create `/Users/batuhanyuksel/Documents/browser/src/renderer/components/browser-tab-pane.test.ts` with assertions for grouped toolbar and branded empty state:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../state.js', () => ({ appState: {} }));
vi.mock('../shortcuts.js', () => ({ shortcutManager: {} }));
vi.mock('./browser-tab/instance.js', () => ({ instances: new Map(), getPreloadPath: () => 'preload.js' }));
vi.mock('./browser-tab/navigation.js', () => ({ navigateTo: vi.fn() }));
vi.mock('./browser-tab/viewport.js', () => ({ applyViewport: vi.fn(), openViewportDropdown: vi.fn(), closeViewportDropdown: vi.fn() }));
vi.mock('./browser-tab/inspect-mode.js', () => ({ toggleInspectMode: vi.fn(), showElementInfo: vi.fn(), dismissInspect: vi.fn() }));
vi.mock('./browser-tab/draw-mode.js', () => ({ toggleDrawMode: vi.fn(), clearDrawing: vi.fn(), dismissDraw: vi.fn(), sendDrawToNewSession: vi.fn(), sendDrawToCustomSession: vi.fn(), positionDrawPopover: vi.fn() }));
vi.mock('./browser-tab/flow-recording.js', () => ({ addFlowStep: vi.fn(), clearFlow: vi.fn(), toggleFlowMode: vi.fn() }));
vi.mock('./browser-tab/flow-picker.js', () => ({ showFlowPicker: vi.fn(), dismissFlowPicker: vi.fn() }));
vi.mock('./browser-tab/session-integration.js', () => ({ sendFlowToCustomSession: vi.fn(), sendFlowToNewSession: vi.fn(), sendToCustomSession: vi.fn(), sendToNewSession: vi.fn() }));

describe('browser tab pane cockpit markup', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="terminal-container"></div>';
  });

  it('renders grouped browser toolbar and branded empty state', async () => {
    const { createBrowserTabPane } = await import('./browser-tab/pane.js');
    createBrowserTabPane('session-1');
    const pane = document.querySelector('.browser-tab-pane')!;
    expect(pane.querySelector('.browser-toolbar-nav')).toBeTruthy();
    expect(pane.querySelector('.browser-toolbar-address')).toBeTruthy();
    expect(pane.querySelector('.browser-toolbar-tools')).toBeTruthy();
    expect(pane.querySelector('.browser-ntp-eyebrow')?.textContent).toContain('Calder');
    expect(pane.querySelector('.browser-ntp-grid')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the browser pane test to verify RED**

Run:

```bash
./node_modules/.bin/vitest run src/renderer/components/browser-tab-pane.test.ts
```

Expected: FAIL because the new browser DOM hooks do not exist yet.

- [ ] **Step 3: Recompose the browser toolbar and new-tab page structure**

Update `/Users/batuhanyuksel/Documents/browser/src/renderer/components/browser-tab/pane.ts` so the toolbar is grouped and the empty state has a more authored skeleton:

```ts
const navGroup = document.createElement('div');
navGroup.className = 'browser-toolbar-nav';
navGroup.appendChild(backBtn);
navGroup.appendChild(fwdBtn);
navGroup.appendChild(reloadBtn);

const addressGroup = document.createElement('div');
addressGroup.className = 'browser-toolbar-address';
addressGroup.appendChild(urlInput);
addressGroup.appendChild(goBtn);

const toolsGroup = document.createElement('div');
toolsGroup.className = 'browser-toolbar-tools';
toolsGroup.appendChild(viewportWrapper);
toolsGroup.appendChild(inspectBtn);
toolsGroup.appendChild(recordBtn);
toolsGroup.appendChild(drawBtn);

toolbar.appendChild(navGroup);
toolbar.appendChild(addressGroup);
toolbar.appendChild(toolsGroup);
```

and replace the current empty-state block with:

```ts
const ntpEyebrow = document.createElement('div');
ntpEyebrow.className = 'browser-ntp-eyebrow shell-kicker';
ntpEyebrow.textContent = 'Calder Browser';

const ntpTitle = document.createElement('div');
ntpTitle.className = 'browser-ntp-title';
ntpTitle.textContent = 'Browse, inspect, and hand off.';

const ntpSubtitle = document.createElement('div');
ntpSubtitle.className = 'browser-ntp-subtitle';
ntpSubtitle.textContent = 'Open a local app or live page, then move findings directly into a session.';

const ntpGrid = document.createElement('div');
ntpGrid.className = 'browser-ntp-grid';
```

- [ ] **Step 4: Rebuild the browser CSS around grouped controls and a premium hero**

Update `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/browser-tab.css` so the browser shell becomes one of the strongest faces of the product:

```css
.browser-tab-toolbar {
  display: grid;
  grid-template-columns: auto minmax(320px, 1fr) auto;
  gap: 10px;
  padding: 10px 12px;
  background: var(--surface-panel);
  border-bottom: 1px solid var(--border-subtle);
}

.browser-toolbar-nav,
.browser-toolbar-tools {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.browser-toolbar-address {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
}

.browser-new-tab-page {
  gap: 14px;
  padding: 32px;
  background:
    radial-gradient(circle at top, rgba(239,92,114,0.10), transparent 32%),
    var(--surface-canvas);
}
```

and:

```css
.browser-ntp-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(140px, 180px));
  gap: 10px;
}
```

- [ ] **Step 5: Run browser verification**

Run:

```bash
./node_modules/.bin/vitest run src/renderer/components/browser-tab-pane.test.ts
npm run build
```

Expected:
- browser pane test passes
- build succeeds

- [ ] **Step 6: Commit the browser redesign**

```bash
git add src/renderer/components/browser-tab/pane.ts src/renderer/styles/browser-tab.css src/renderer/components/browser-tab-pane.test.ts
git commit -m "implement calder browser cockpit surface"
```

Expected: commit succeeds.

---

### Task 5: Redesign Modal, Preferences, And Secondary Utility Surfaces

**Files:**
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/modal.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/custom-select.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/preferences-modal.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/modals.css`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/preferences.css`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/usage.css`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/alerts.css`

- [ ] **Step 1: Add richer DOM hooks to the shared modal builder**

Update `/Users/batuhanyuksel/Documents/browser/src/renderer/components/modal.ts` so generic fields gain classes that the cockpit system can target:

```ts
const div = document.createElement('div');
div.className = field.type === 'checkbox'
  ? 'modal-field modal-field-checkbox'
  : 'modal-field modal-field-stack';

label.classList.add('modal-field-label');
```

and for input rows:

```ts
row.className = 'modal-field-row modal-field-row-inline';
btn.className = 'modal-field-btn control-chip';
```

- [ ] **Step 2: Give the custom select a stronger trigger and dropdown contract**

Update `/Users/batuhanyuksel/Documents/browser/src/renderer/components/custom-select.ts` so the trigger and items expose more precise cockpit selectors:

```ts
wrapper.className = 'custom-select control-select';
trigger.className = 'custom-select-trigger control-select-trigger';
dropdown.className = 'custom-select-dropdown control-select-dropdown';
item.className = 'custom-select-item control-select-item';
```

- [ ] **Step 3: Recompose Preferences into a flagship settings surface**

Update `/Users/batuhanyuksel/Documents/browser/src/renderer/components/preferences-modal.ts` so the content area begins with a compact header block:

```ts
const headerBlock = document.createElement('div');
headerBlock.className = 'preferences-content-header';

const headerKicker = document.createElement('div');
headerKicker.className = 'shell-kicker';
headerKicker.textContent = 'Settings';

const headerTitle = document.createElement('div');
headerTitle.className = 'preferences-content-title';
headerTitle.textContent = sections.find(s => s.id === section)?.label ?? 'Preferences';

headerBlock.appendChild(headerKicker);
headerBlock.appendChild(headerTitle);
content.appendChild(headerBlock);
```

Then render the section body after that header block instead of directly into `content`.

- [ ] **Step 4: Redesign the shared modal, preferences, usage, and alert CSS**

Update the styles to match the new cockpit system:

In `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/modals.css`:

```css
#modal, .modal-box {
  background: var(--surface-elevated);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-elevated);
}

.modal-field-stack {
  gap: 8px;
}
```

In `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/preferences.css`:

```css
.preferences-content-header {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-bottom: 14px;
  margin-bottom: 14px;
  border-bottom: 1px solid var(--border-subtle);
}

.preferences-content-title {
  font-size: 18px;
  font-weight: 650;
  color: var(--text-primary);
}
```

In `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/usage.css` and `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/alerts.css`, align utility surfaces to the same border/elevation/badge system instead of bespoke colors.

- [ ] **Step 5: Run build verification**

Run:

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 6: Commit the modal and utility redesign**

```bash
git add src/renderer/components/modal.ts src/renderer/components/custom-select.ts src/renderer/components/preferences-modal.ts src/renderer/styles/modals.css src/renderer/styles/preferences.css src/renderer/styles/usage.css src/renderer/styles/alerts.css
git commit -m "implement calder cockpit modal system"
```

Expected: commit succeeds.

---

### Task 6: Finish The Workspace Frame And Run Full Verification

**Files:**
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/terminal.css`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/sidebar.css`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/tabs.css`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/browser-tab.css`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/preferences.css`
- Test: existing and newly-created tests

- [ ] **Step 1: Tighten the pane framing and bottom terminal shell**

Update `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/terminal.css` so pane borders, status bars, and project terminal framing use the new cockpit weight:

```css
.terminal-pane {
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  background: var(--surface-canvas);
}

.terminal-pane.focused {
  border-color: var(--border-strong);
  box-shadow: 0 0 0 1px rgba(69, 86, 107, 0.22);
}

.session-status-bar {
  min-height: 24px;
  padding: 0 10px;
  background: var(--surface-panel);
}
```

- [ ] **Step 2: Run the focused redesign test pack**

Run:

```bash
./node_modules/.bin/vitest run \
  src/renderer/index-shell.test.ts \
  src/renderer/styles/theme-contract.test.ts \
  src/renderer/components/browser-tab-pane.test.ts \
  src/renderer/components/config-sections.test.ts
```

Expected: all focused redesign tests pass.

- [ ] **Step 3: Run the full verification suite**

Run:

```bash
npm run build
./node_modules/.bin/vitest run
# Run a dedicated legacy-brand residue search for prior namespaces, paths, and hook markers.
git -C /Users/batuhanyuksel/Documents/browser status --short --branch
```

Expected:
- build passes
- full test suite passes
- old-brand residue search returns no results
- git status shows only the intended redesign changes before the final commit

- [ ] **Step 4: Capture visual proof of the redesigned shell**

Run:

```bash
python3 /Users/batuhanyuksel/.codex/skills/screenshot/scripts/take_screenshot.py --list-windows --app "Electron"
python3 /Users/batuhanyuksel/.codex/skills/screenshot/scripts/take_screenshot.py --window-id <calder-window-id> --mode temp
```

Expected: a fresh screenshot path for the redesigned Calder window.

- [ ] **Step 5: Commit the completed redesign**

```bash
git add src/renderer docs/superpowers/plans/2026-04-10-calder-precision-cockpit-redesign.md
git commit -m "implement calder precision cockpit redesign"
```

Expected: commit succeeds and `git status --short --branch` returns `## main`.
