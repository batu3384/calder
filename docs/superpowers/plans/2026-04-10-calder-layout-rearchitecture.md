# Calder Layout Rearchitecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild Calder’s shell into a Project Rail + Command Deck + Context Inspector layout without breaking the existing session model, tab/split/swarm behavior, or tool surfaces.

**Architecture:** Keep the current renderer ids and component behavior wherever possible, but relocate shell containers so the left side becomes project-only, the top bar becomes a command deck, and project intelligence moves into a new shell-level right inspector. Reuse the existing `config-sections`, `readiness-section`, `git-panel`, and `session-history` components in their new placement instead of rewriting their business logic.

**Tech Stack:** Electron, TypeScript, vanilla DOM renderer, CSS, Vitest

---

## File Structure Lock

- `/Users/batuhanyuksel/Documents/browser/src/renderer/index.html`
  Main shell DOM. This is where the left rail is reduced to projects, the command deck wrappers are introduced, and the new context inspector container is added.
- `/Users/batuhanyuksel/Documents/browser/src/renderer/index.ts`
  Renderer bootstrap. This must initialize any new shell component and stop binding removed top-bar buttons directly.
- `/Users/batuhanyuksel/Documents/browser/src/renderer/index-shell.test.ts`
  Shell contract test. Expand it to lock the new Project Rail / Command Deck / Context Inspector structure.
- `/Users/batuhanyuksel/Documents/browser/src/renderer/components/context-inspector.ts`
  New shell-level controller for opening, closing, and reflecting the state of the project context inspector.
- `/Users/batuhanyuksel/Documents/browser/src/renderer/components/tab-bar.ts`
  Command deck behavior: primary session action, visible status chips, layout controls, overflow menu, and inspector toggle.
- `/Users/batuhanyuksel/Documents/browser/src/renderer/components/sidebar.ts`
  Project rail behavior only. Remove spend rendering ownership from the left rail and keep project switching intact.
- `/Users/batuhanyuksel/Documents/browser/src/renderer/components/project-terminal.ts`
  Stop assuming a dedicated visible top-bar button exists; expose terminal toggling through command deck overflow.
- `/Users/batuhanyuksel/Documents/browser/src/renderer/components/config-sections.ts`
  Existing capabilities surface. It should render unchanged inside the new right inspector.
- `/Users/batuhanyuksel/Documents/browser/src/renderer/components/readiness-section.ts`
  Existing health surface. Keep scan behavior but align with inspector placement.
- `/Users/batuhanyuksel/Documents/browser/src/renderer/components/git-panel.ts`
  Existing git surface. Keep staging/open diff behavior but let the new shell own placement.
- `/Users/batuhanyuksel/Documents/browser/src/renderer/components/session-history.ts`
  Existing activity surface. Keep resume/bookmark behavior while moving it into the right inspector.
- `/Users/batuhanyuksel/Documents/browser/src/renderer/components/preferences-modal.ts`
  Reframe “Sidebar” copy into shell/rail/inspector language while preserving persisted preference keys.
- `/Users/batuhanyuksel/Documents/browser/src/renderer/components/preferences-modal.contract.test.ts`
  Copy contract for preferences. Extend it so the modal cannot regress to old sidebar-first wording.
- `/Users/batuhanyuksel/Documents/browser/src/renderer/components/help-dialog.ts`
  Replace provider-specific legacy phrasing where the copy still says “Claude” when it should refer to sessions or supported coding tools.
- `/Users/batuhanyuksel/Documents/browser/src/renderer/components/usage-modal.ts`
  Remove provider-specific empty-state copy and keep usage language neutral across providers.
- `/Users/batuhanyuksel/Documents/browser/src/renderer/components/tab-bar-command-deck.test.ts`
  New source contract test that locks overflow ownership and inspector toggle wiring in `tab-bar.ts`.
- `/Users/batuhanyuksel/Documents/browser/src/renderer/styles.css`
  Import the new context inspector stylesheet.
- `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/sidebar.css`
  Restyle the left surface into a project rail and retire cluster-heavy sidebar presentation.
- `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/tabs.css`
  Restyle the top chrome into a command deck with grouped status and actions.
- `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/context-inspector.css`
  New stylesheet for the right inspector shell.
- `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/session-inspector.css`
  Optional alignment pass so the existing session inspector feels related to the new right-panel language instead of like a separate product.
- `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/layout-contract.test.ts`
  New stylesheet contract test that locks the import of `context-inspector.css` and the existence of core layout selectors.

---

### Task 1: Add The New Shell Contract And Inspector Scaffold

**Files:**
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/index-shell.test.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/index.html`
- Create: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/context-inspector.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/index.ts`

- [ ] **Step 1: Expand the shell contract test so the new layout must exist before implementation**

Update `/Users/batuhanyuksel/Documents/browser/src/renderer/index-shell.test.ts` to add:

```ts
  it('exposes project rail, workspace shell, and context inspector anchors', () => {
    expect(html).toContain('id="workspace-shell"');
    expect(html).toContain('id="workspace-stack"');
    expect(html).toContain('id="context-inspector"');
    expect(html).toContain('id="btn-toggle-context-inspector"');
    expect(html).toContain('id="context-inspector-sections"');
    expect(html).toContain('class="command-deck-status"');
    expect(html).toContain('id="workspace-spend"');
  });
```

- [ ] **Step 2: Run the shell contract test to verify RED**

Run:

```bash
./node_modules/.bin/vitest run src/renderer/index-shell.test.ts
```

Expected: FAIL because the new `workspace-shell`, `context-inspector`, and command deck anchors do not exist yet.

- [ ] **Step 3: Rewrite the shell HTML so the utility surfaces live in a right inspector instead of the sidebar**

Update `/Users/batuhanyuksel/Documents/browser/src/renderer/index.html` so the shell body becomes:

```html
<div id="app">
  <div id="sidebar">
    <div id="sidebar-header">
      <div class="sidebar-title-group">
        <button id="btn-toggle-sidebar" class="icon-btn" title="Toggle Sidebar (Cmd+B)" aria-label="Toggle sidebar" style="font-size:13px;">&#x25E7;</button>
        <div class="sidebar-brand-block">
          <span class="sidebar-eyebrow">Calder</span>
          <span class="sidebar-title">Projects</span>
        </div>
      </div>
      <div class="sidebar-header-actions">
        <button id="btn-preferences" class="icon-btn" title="Preferences" aria-label="Open preferences">&#x2699;</button>
        <button id="btn-add-project" class="icon-btn" title="New Project (Ctrl+Shift+P)" aria-label="Create new project">+</button>
      </div>
    </div>
    <div id="sidebar-content">
      <div id="project-list"></div>
    </div>
    <div id="sidebar-footer"></div>
  </div>
  <div id="sidebar-resize-handle"></div>
  <div id="main-area">
    <div id="workspace-shell">
      <div id="workspace-stack">
        <div id="tab-bar">
          <div class="tab-bar-main">
            <div id="tab-list"></div>
          </div>
          <div class="command-deck-status">
            <div id="workspace-spend"></div>
            <div id="git-status"></div>
          </div>
          <div id="tab-actions">
            <button id="btn-toggle-context-inspector" class="icon-btn" title="Toggle Context Inspector" aria-label="Toggle context inspector">&#9776;</button>
            <button id="btn-toggle-swarm" class="icon-btn" title="Toggle Swarm Mode (Ctrl+\)" aria-label="Toggle swarm mode">&#x229E;</button>
            <button id="btn-command-deck-more" class="icon-btn" title="More Tools" aria-label="Open command deck overflow">&#x22ef;</button>
            <button id="btn-add-session" class="icon-btn" title="New Session (Ctrl+Shift+N)" aria-label="Create new session">+</button>
          </div>
        </div>
        <div id="terminal-container"></div>
        <div id="project-terminal-resize-handle" class="hidden"></div>
        <div id="project-terminal-panel" class="hidden">
          <div id="project-terminal-header">
            <span class="project-terminal-title">Scratch Shell</span>
            <button id="btn-close-terminal" class="icon-btn" title="Close Terminal">&times;</button>
          </div>
          <div id="project-terminal-container"></div>
        </div>
      </div>
      <aside id="context-inspector" class="context-inspector-open">
        <div id="context-inspector-header">
          <div class="context-inspector-title-group">
            <span class="context-inspector-eyebrow">Project Context</span>
            <span class="context-inspector-title">Signals</span>
          </div>
          <button id="btn-close-context-inspector" class="icon-btn" title="Close Context Inspector" aria-label="Close context inspector">&times;</button>
        </div>
        <div id="context-inspector-sections">
          <section class="context-inspector-section" data-section="health">
            <div class="context-inspector-section-label">Health</div>
            <div id="readiness-section"></div>
          </section>
          <section class="context-inspector-section" data-section="git">
            <div class="context-inspector-section-label">Git</div>
            <div id="git-panel"></div>
          </section>
          <section class="context-inspector-section" data-section="activity">
            <div class="context-inspector-section-label">Activity</div>
            <div id="session-history"></div>
          </section>
          <section class="context-inspector-section" data-section="capabilities">
            <div class="context-inspector-section-label">Capabilities</div>
            <div id="config-sections"></div>
          </section>
        </div>
      </aside>
    </div>
  </div>
</div>
```

- [ ] **Step 4: Add a shell-level context inspector controller**

Create `/Users/batuhanyuksel/Documents/browser/src/renderer/components/context-inspector.ts` with:

```ts
import { appState } from '../state.js';

const mainAreaEl = document.getElementById('main-area')!;
const inspectorEl = document.getElementById('context-inspector')!;
const toggleBtn = document.getElementById('btn-toggle-context-inspector')!;
const closeBtn = document.getElementById('btn-close-context-inspector')!;

let inspectorOpen = true;

export function setContextInspectorOpen(next: boolean): void {
  inspectorOpen = next;
  mainAreaEl.classList.toggle('context-inspector-open', next);
  inspectorEl.classList.toggle('context-inspector-open', next);
  inspectorEl.classList.toggle('context-inspector-closed', !next);
  toggleBtn.setAttribute('aria-pressed', next ? 'true' : 'false');
}

export function toggleContextInspector(): void {
  setContextInspectorOpen(!inspectorOpen);
}

export function initContextInspector(): void {
  toggleBtn.addEventListener('click', () => toggleContextInspector());
  closeBtn.addEventListener('click', () => setContextInspectorOpen(false));

  appState.on('project-changed', () => {
    if (!appState.activeProject) setContextInspectorOpen(false);
  });

  setContextInspectorOpen(true);
}
```

- [ ] **Step 5: Initialize the new shell controller during renderer boot**

Update `/Users/batuhanyuksel/Documents/browser/src/renderer/index.ts` imports and init sequence:

```ts
import { initContextInspector } from './components/context-inspector.js';
```

and in `main()`:

```ts
  initSidebar();
  initContextInspector();
  initTabBar();
```

- [ ] **Step 6: Run the shell contract test to verify GREEN**

Run:

```bash
./node_modules/.bin/vitest run src/renderer/index-shell.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit the shell scaffold**

```bash
git add src/renderer/index-shell.test.ts src/renderer/index.html src/renderer/components/context-inspector.ts src/renderer/index.ts
git commit -m "implement calder shell inspector scaffold"
```

Expected: commit succeeds.

---

### Task 2: Turn The Top Bar Into A Command Deck And Demote Utility Buttons

**Files:**
- Create: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/tab-bar-command-deck.test.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/tab-bar.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/project-terminal.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/sidebar.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/index.ts`

- [ ] **Step 1: Add a command deck source contract test**

Create `/Users/batuhanyuksel/Documents/browser/src/renderer/components/tab-bar-command-deck.test.ts` with:

```ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const source = readFileSync(new URL('./tab-bar.ts', import.meta.url), 'utf-8');

describe('tab bar command deck contract', () => {
  it('owns the command deck overflow and context inspector toggle', () => {
    expect(source).toContain("btn-command-deck-more");
    expect(source).toContain("btn-toggle-context-inspector");
    expect(source).toContain('showUsageModal');
    expect(source).toContain('toggleProjectTerminal');
    expect(source).toContain('promptNewMcpInspector');
  });
});
```

- [ ] **Step 2: Run the command deck contract test to verify RED**

Run:

```bash
./node_modules/.bin/vitest run src/renderer/components/tab-bar-command-deck.test.ts
```

Expected: FAIL because `tab-bar.ts` does not yet own the new overflow button or inspector toggle.

- [ ] **Step 3: Move command ownership into `tab-bar.ts` and render the workspace spend chip there**

Update `/Users/batuhanyuksel/Documents/browser/src/renderer/components/tab-bar.ts` imports and shell bindings:

```ts
import { onChange as onCostChange, getAggregateCost } from '../session-cost.js';
import { showUsageModal } from './usage-modal.js';
import { toggleProjectTerminal } from './project-terminal.js';
import { toggleContextInspector } from './context-inspector.js';
```

Add the new button references:

```ts
const workspaceSpendEl = document.getElementById('workspace-spend')!;
const btnCommandDeckMore = document.getElementById('btn-command-deck-more')!;
const btnToggleContextInspector = document.getElementById('btn-toggle-context-inspector')!;
```

In `initTabBar()` wire the new actions:

```ts
  btnAddSession.classList.add('tab-action-primary');
  btnToggleSwarm.classList.add('tab-action-toggle');
  btnToggleContextInspector.classList.add('tab-action-secondary');

  btnAddSession.addEventListener('click', () => quickNewSession());
  btnToggleSwarm.addEventListener('click', () => appState.toggleSwarm());
  btnToggleContextInspector.addEventListener('click', () => toggleContextInspector());
  btnCommandDeckMore.addEventListener('click', (e) => showCommandDeckOverflowMenu(e));

  onCostChange(renderWorkspaceSpend);
  appState.on('project-changed', renderWorkspaceSpend);
```

Add the new spend-chip renderer:

```ts
function renderWorkspaceSpend(): void {
  const visible = appState.preferences.sidebarViews?.costFooter ?? true;
  const agg = getAggregateCost();
  if (!visible || agg.totalCostUsd <= 0) {
    workspaceSpendEl.innerHTML = '';
    workspaceSpendEl.classList.add('hidden');
    return;
  }

  workspaceSpendEl.classList.remove('hidden');
  workspaceSpendEl.innerHTML = `<span class="workspace-spend-label">Spend</span><span class="workspace-spend-value">$${agg.totalCostUsd.toFixed(4)}</span>`;
}
```

And add a shared overflow menu helper:

```ts
function showCommandDeckOverflowMenu(event: MouseEvent): void {
  event.preventDefault();
  hideTabContextMenu();

  const menu = document.createElement('div');
  menu.className = 'tab-context-menu';
  menu.style.left = `${event.clientX}px`;
  menu.style.top = `${event.clientY}px`;

  const items: Array<[string, () => void]> = [
    ['Project Scratch Shell', () => toggleProjectTerminal()],
    ['Usage Stats', () => showUsageModal()],
    ['Session Indicators Help', () => showHelpDialog()],
    ['Open MCP Inspector', () => promptNewMcpInspector()],
  ];

  for (const [label, action] of items) {
    const item = document.createElement('div');
    item.className = 'tab-context-menu-item';
    item.textContent = label;
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      hideTabContextMenu();
      action();
    });
    menu.appendChild(item);
  }

  document.body.appendChild(menu);
  activeContextMenu = menu;
}
```

- [ ] **Step 4: Remove now-obsolete direct button assumptions from the terminal and bootstrap code**

Update `/Users/batuhanyuksel/Documents/browser/src/renderer/components/project-terminal.ts` so it no longer requires `btn-toggle-terminal`:

```ts
  const closeBtn = document.getElementById('btn-close-terminal')!;

  closeBtn.addEventListener('click', () => {
    hidePanel();
    appState.setTerminalPanelOpen(false);
  });
```

Remove the old button-title and click wiring block entirely.

Update `/Users/batuhanyuksel/Documents/browser/src/renderer/index.ts` to remove:

```ts
document.getElementById('btn-usage-stats')!.addEventListener('click', () => showUsageModal());
```

Update `/Users/batuhanyuksel/Documents/browser/src/renderer/components/sidebar.ts` so the left rail stops rendering spend ownership:

```ts
function renderCostFooter(): void {
  sidebarFooterEl.innerHTML = '';
  sidebarFooterEl.classList.add('hidden');
}
```

- [ ] **Step 5: Run the targeted command deck tests to verify GREEN**

Run:

```bash
./node_modules/.bin/vitest run src/renderer/components/tab-bar-command-deck.test.ts src/renderer/index-shell.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the command deck behavior**

```bash
git add src/renderer/components/tab-bar-command-deck.test.ts src/renderer/components/tab-bar.ts src/renderer/components/project-terminal.ts src/renderer/components/sidebar.ts src/renderer/index.ts
git commit -m "implement calder command deck behavior"
```

Expected: commit succeeds.

---

### Task 3: Restyle The Shell Into Project Rail, Command Deck, And Context Inspector

**Files:**
- Create: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/layout-contract.test.ts`
- Create: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/context-inspector.css`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles.css`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/sidebar.css`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/tabs.css`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/session-inspector.css`

- [ ] **Step 1: Add a stylesheet contract test for the new shell**

Create `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/layout-contract.test.ts` with:

```ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const imports = readFileSync(new URL('../styles.css', import.meta.url), 'utf-8');
const tabsCss = readFileSync(new URL('./tabs.css', import.meta.url), 'utf-8');
const railCss = readFileSync(new URL('./sidebar.css', import.meta.url), 'utf-8');

describe('layout stylesheet contract', () => {
  it('imports the context inspector stylesheet and command deck selectors', () => {
    expect(imports).toContain("./styles/context-inspector.css");
    expect(tabsCss).toContain('.command-deck-status');
    expect(tabsCss).toContain('.workspace-spend-value');
    expect(railCss).toContain('#sidebar-content');
  });
});
```

- [ ] **Step 2: Run the layout contract test to verify RED**

Run:

```bash
./node_modules/.bin/vitest run src/renderer/styles/layout-contract.test.ts
```

Expected: FAIL because `context-inspector.css` is not imported yet and the new selectors do not exist.

- [ ] **Step 3: Add the context inspector stylesheet and import it**

Create `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/context-inspector.css` with:

```css
#workspace-shell {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
}

#workspace-stack {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

#context-inspector {
  width: 336px;
  min-width: 280px;
  border-left: 1px solid var(--border-subtle);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.025), rgba(255, 255, 255, 0)),
    linear-gradient(180deg, color-mix(in srgb, var(--surface-panel) 92%, black), var(--surface-muted));
  display: flex;
  flex-direction: column;
  min-height: 0;
}

#context-inspector.context-inspector-closed {
  display: none;
}

#context-inspector-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 14px 12px;
  border-bottom: 1px solid var(--border-subtle);
}

#context-inspector-sections {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
```

Update `/Users/batuhanyuksel/Documents/browser/src/renderer/styles.css` to import it after `sidebar.css`:

```css
@import url('./styles/sidebar.css');
@import url('./styles/context-inspector.css');
@import url('./styles/tabs.css');
```

- [ ] **Step 4: Rewrite the sidebar and top chrome styles around the new hierarchy**

Update `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/sidebar.css` so the rail reads project-only:

```css
#sidebar {
  width: 218px;
  min-width: 168px;
  max-width: 320px;
}

#sidebar-content {
  flex: 1;
  overflow-y: auto;
  padding: 12px 10px 14px;
  display: block;
}

.sidebar-cluster,
.sidebar-cluster-title,
.sidebar-cluster-body {
  display: none;
}

#project-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
```

Update `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/tabs.css` with the new command deck groups:

```css
#tab-bar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
}

.command-deck-status {
  display: flex;
  align-items: center;
  gap: 8px;
}

#workspace-spend {
  min-height: 36px;
  padding: 0 11px;
  border: 1px solid var(--border-subtle);
  border-radius: 999px;
  background: color-mix(in srgb, var(--surface-panel) 90%, transparent);
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.workspace-spend-label {
  color: var(--text-muted);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.workspace-spend-value {
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 650;
}
```

Update `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/session-inspector.css` so the existing session inspector uses the same surface family:

```css
#session-inspector {
  border-left: 1px solid var(--border-subtle);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.02), rgba(255, 255, 255, 0)),
    linear-gradient(180deg, color-mix(in srgb, var(--surface-panel) 92%, black), var(--surface-muted));
}
```

- [ ] **Step 5: Run the layout tests to verify GREEN**

Run:

```bash
./node_modules/.bin/vitest run src/renderer/styles/layout-contract.test.ts src/renderer/index-shell.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the shell styling**

```bash
git add src/renderer/styles/layout-contract.test.ts src/renderer/styles/context-inspector.css src/renderer/styles.css src/renderer/styles/sidebar.css src/renderer/styles/tabs.css src/renderer/styles/session-inspector.css
git commit -m "style calder project rail and context inspector"
```

Expected: commit succeeds.

---

### Task 4: Reframe Preferences And Remove Provider-Specific Legacy Copy

**Files:**
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/preferences-modal.contract.test.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/preferences-modal.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/help-dialog.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/usage-modal.ts`

- [ ] **Step 1: Tighten the copy contract so shell language cannot regress**

Update `/Users/batuhanyuksel/Documents/browser/src/renderer/components/preferences-modal.contract.test.ts` to assert:

```ts
  it('uses shell language for layout controls', () => {
    expect(source).toContain('Shell Layout');
    expect(source).toContain('Project rail');
    expect(source).toContain('Context inspector');
  });
```

- [ ] **Step 2: Run the preferences contract test to verify RED**

Run:

```bash
./node_modules/.bin/vitest run src/renderer/components/preferences-modal.contract.test.ts
```

Expected: FAIL because the modal still talks about “Sidebar” and left-rail blocks.

- [ ] **Step 3: Update preferences copy while keeping persisted state keys intact**

Update `/Users/batuhanyuksel/Documents/browser/src/renderer/components/preferences-modal.ts` so the section label and descriptions change without renaming stored keys:

```ts
      appendSectionIntro(
        content,
        'Chrome',
        'Shell Layout',
        'Control which project signals stay visible in the project rail versus the right-side context inspector.',
      );
```

and:

```ts
      const toggles: { key: keyof typeof views; label: string }[] = [
        { key: 'configSections', label: 'Context inspector: Capabilities' },
        { key: 'readinessSection', label: 'Context inspector: AI Readiness' },
        { key: 'gitPanel', label: 'Context inspector: Git' },
        { key: 'sessionHistory', label: 'Context inspector: Session History' },
        { key: 'costFooter', label: 'Command deck: Workspace Spend chip' },
      ];
```

Also change the menu label from:

```ts
{ id: 'sidebar', label: 'Sidebar' },
```

to:

```ts
{ id: 'sidebar', label: 'Shell' },
```

- [ ] **Step 4: Remove legacy provider-specific copy from help and usage surfaces**

Update `/Users/batuhanyuksel/Documents/browser/src/renderer/components/help-dialog.ts` rows:

```ts
    { visual: () => dot('#e94560', true), label: 'Working', description: 'Active session is generating output' },
    { visual: () => dot('#f4b400'), label: 'Waiting', description: 'Session is paused between turns' },
    { visual: () => dot('#34a853'), label: 'Completed', description: 'Session finished its task' },
    { visual: () => dot('#e67e22', true), label: 'Input', description: 'Session is waiting for user input' },
```

Update `/Users/batuhanyuksel/Documents/browser/src/renderer/components/usage-modal.ts` empty state:

```ts
  empty.textContent = 'No usage data found yet. Stats appear after supported CLI sessions record activity.';
```

And make model names provider-neutral:

```ts
function prettyModelName(raw: string): string {
  return raw
    .replace(/-\d{8,}$/, '')
    .split(/[-_]/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
```

- [ ] **Step 5: Run the copy-focused tests to verify GREEN**

Run:

```bash
./node_modules/.bin/vitest run src/renderer/components/preferences-modal.contract.test.ts src/renderer/components/tab-bar-command-deck.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the shell-copy cleanup**

```bash
git add src/renderer/components/preferences-modal.contract.test.ts src/renderer/components/preferences-modal.ts src/renderer/components/help-dialog.ts src/renderer/components/usage-modal.ts
git commit -m "clean calder shell and provider copy"
```

Expected: commit succeeds.

---

### Task 5: Verify The Rearchitecture End-To-End

**Files:**
- No planned code changes unless verification exposes regressions.

- [ ] **Step 1: Run the targeted shell contract suite**

Run:

```bash
./node_modules/.bin/vitest run \
  src/renderer/index-shell.test.ts \
  src/renderer/styles/layout-contract.test.ts \
  src/renderer/components/tab-bar-command-deck.test.ts \
  src/renderer/components/preferences-modal.contract.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run the full build**

Run:

```bash
npm run build
```

Expected: build succeeds with no TypeScript or bundling errors.

- [ ] **Step 3: Run the full Vitest suite**

Run:

```bash
npm test
```

Expected: PASS across the full renderer test suite.

- [ ] **Step 4: Launch the app for a visual smoke test**

Run:

```bash
npm run dev
```

Expected visual checks:
- Left side shows projects only.
- Right side shows the new context inspector with Health, Git, Activity, and Capabilities sections.
- Top chrome shows tabs, status chips, inspector toggle, overflow button, and a strong primary new-session action.
- Project scratch shell still opens and closes correctly from the overflow menu.
- Split/swarm/session switching still work.

- [ ] **Step 5: Capture evidence and close out**

Capture one updated screenshot of the main shell and note the result of each manual check:

```text
- new session
- project switching
- context inspector open/close
- git list interactions
- readiness scan and modal
- history resume
- project scratch shell
- browser pane still opens and renders
```

- [ ] **Step 6: Commit only if verification required follow-up fixes**

```bash
git status --short
```

Expected: clean working tree. If not clean, inspect the remaining diff and commit only the verification follow-up changes with a focused message.

---

## Self-Review

Spec coverage check:
- Project Rail: covered by Tasks 1 and 3.
- Command Deck: covered by Task 2 and Task 3.
- Context Inspector: covered by Tasks 1 and 3.
- Preserve git/readiness/history/capabilities behavior: covered by Tasks 1 and 2 because the existing component ids and modules are reused.
- Preferences/help/usage cleanup: covered by Task 4.
- Verification and regression control: covered by Task 5.

Placeholder scan:
- No `TODO`, `TBD`, or deferred “implement later” steps remain.

Type and naming consistency:
- The persisted preference key remains `sidebarViews`; only the UI wording changes.
- The new shell uses one name consistently: `context-inspector`.
- The top chrome uses one name consistently: `command deck`.
