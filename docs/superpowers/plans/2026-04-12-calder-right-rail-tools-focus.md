# Calder Right Rail Tools Focus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild Calder's right rail so it defaults to a `Tools Focus` hierarchy, promotes `Git` and `Health` only when needed, and stops reading like a stack of equal-weight utility cards.

**Architecture:** Keep the existing renderer sections and data providers, but introduce a small derived right-rail mode layer that decides section order and presentation (`compact`, `expanded`, `promoted`). `context-inspector.ts` will own the derived mode and section priority, while `config-sections.ts`, `git-panel.ts`, `readiness-section.ts`, and `session-history.ts` will render compact or promoted variants based on the wrapper dataset written by the inspector.

**Tech Stack:** Electron, TypeScript, vanilla DOM renderer, CSS, Vitest

---

## File Structure Lock

- `/Users/batuhanyuksel/Documents/browser/src/renderer/components/right-rail-mode.ts`
  New pure helper that derives the current rail mode and section presentation from active provider, settings validation, git status, and active project state.
- `/Users/batuhanyuksel/Documents/browser/src/renderer/components/right-rail-mode.test.ts`
  Focused unit tests for the new derived-mode helper.
- `/Users/batuhanyuksel/Documents/browser/src/renderer/components/context-inspector.ts`
  Coordinator for the right rail; will render `Project Snapshot`, set `data-rail-mode`, and apply per-section presentation hints.
- `/Users/batuhanyuksel/Documents/browser/src/renderer/index.html`
  Right-rail section order and wrapper ids.
- `/Users/batuhanyuksel/Documents/browser/src/renderer/components/config-sections.ts`
  Main `Tools Focus` section; will become the default primary block and surface tracking / integrations summary.
- `/Users/batuhanyuksel/Documents/browser/src/renderer/components/git-panel.ts`
  Operational secondary section; compact by default, promoted when git is dirty or conflicted.
- `/Users/batuhanyuksel/Documents/browser/src/renderer/components/readiness-section.ts`
  Health section; compact by default, promoted only when tracking or readiness is unhealthy.
- `/Users/batuhanyuksel/Documents/browser/src/renderer/components/session-history.ts`
  Tertiary activity block; should remain available, but quieter and compact in the default tools-focused rail.
- `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/context-inspector.css`
  Layout, ordering, promoted / compact styles, and visual hierarchy for the right rail.
- `/Users/batuhanyuksel/Documents/browser/src/renderer/components/context-language.contract.test.ts`
  Existing contract test for right-rail language; extend this instead of inventing a duplicate coverage layer.
- `/Users/batuhanyuksel/Documents/browser/src/renderer/components/config-sections-compact.contract.test.ts`
  Existing compact summary test; expand it to cover the new `Tools Focus` summary copy.
- `/Users/batuhanyuksel/Documents/browser/src/renderer/components/git-panel.test.ts`
  Add compact / promoted Git expectations here.
- `/Users/batuhanyuksel/Documents/browser/src/renderer/components/session-history.test.ts`
  Add compact activity-state expectations here.

## Task 1: Add Derived Right-Rail Mode Helper

**Files:**
- Create: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/right-rail-mode.ts`
- Create: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/right-rail-mode.test.ts`

- [ ] **Step 1: Write the failing unit test**

```ts
import { describe, expect, it } from 'vitest';
import {
  deriveRightRailMode,
  deriveRightRailPresentation,
  type RightRailSignals,
} from './right-rail-mode.js';

const baseSignals: RightRailSignals = {
  hasHealthWarning: false,
  hasDirtyGit: false,
  hasGitConflicts: false,
  hasToolingContext: true,
};

describe('deriveRightRailMode', () => {
  it('prefers warning when health issues exist', () => {
    expect(deriveRightRailMode({ ...baseSignals, hasHealthWarning: true })).toBe('warning');
  });

  it('uses tools-focus when tooling context is present and health is clear', () => {
    expect(deriveRightRailMode(baseSignals)).toBe('tools-focus');
  });

  it('falls back to normal when there is no active tooling context', () => {
    expect(deriveRightRailMode({ ...baseSignals, hasToolingContext: false })).toBe('normal');
  });
});

describe('deriveRightRailPresentation', () => {
  it('promotes capabilities in tools-focus mode', () => {
    expect(deriveRightRailPresentation('tools-focus').capabilities).toBe('promoted');
  });

  it('promotes health in warning mode', () => {
    expect(deriveRightRailPresentation('warning').health).toBe('promoted');
  });

  it('promotes git when the worktree is dirty in normal mode', () => {
    expect(
      deriveRightRailPresentation('normal', { hasDirtyGit: true, hasGitConflicts: false }).git,
    ).toBe('promoted');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npx vitest run src/renderer/components/right-rail-mode.test.ts
```

Expected: FAIL with `Cannot find module './right-rail-mode.js'` or missing export errors.

- [ ] **Step 3: Write the minimal helper implementation**

```ts
export type RightRailMode = 'normal' | 'warning' | 'tools-focus';
export type RightRailSectionId = 'capabilities' | 'git' | 'health' | 'activity';
export type RightRailPresentation = 'compact' | 'expanded' | 'promoted';

export interface RightRailSignals {
  hasHealthWarning: boolean;
  hasDirtyGit: boolean;
  hasGitConflicts: boolean;
  hasToolingContext: boolean;
}

export function deriveRightRailMode(signals: RightRailSignals): RightRailMode {
  if (signals.hasHealthWarning) return 'warning';
  if (signals.hasToolingContext) return 'tools-focus';
  return 'normal';
}

export function deriveRightRailPresentation(
  mode: RightRailMode,
  git: Pick<RightRailSignals, 'hasDirtyGit' | 'hasGitConflicts'> = {
    hasDirtyGit: false,
    hasGitConflicts: false,
  },
): Record<RightRailSectionId, RightRailPresentation> {
  if (mode === 'warning') {
    return {
      capabilities: 'expanded',
      git: git.hasDirtyGit || git.hasGitConflicts ? 'expanded' : 'compact',
      health: 'promoted',
      activity: 'compact',
    };
  }

  if (mode === 'tools-focus') {
    return {
      capabilities: 'promoted',
      git: git.hasDirtyGit || git.hasGitConflicts ? 'expanded' : 'compact',
      health: 'compact',
      activity: 'compact',
    };
  }

  return {
    capabilities: 'expanded',
    git: git.hasDirtyGit || git.hasGitConflicts ? 'promoted' : 'compact',
    health: 'compact',
    activity: 'compact',
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
npx vitest run src/renderer/components/right-rail-mode.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/right-rail-mode.ts src/renderer/components/right-rail-mode.test.ts
git commit -m "feat: add right rail mode helper"
```

## Task 2: Wire Context Inspector To The New Rail Mode

**Files:**
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/context-inspector.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/index.html`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/context-language.contract.test.ts`

- [ ] **Step 1: Extend the contract test first**

```ts
it('marks the right rail with rail mode and keeps a dedicated project snapshot card', () => {
  expect(inspectorSource).toContain('deriveRightRailMode');
  expect(inspectorSource).toContain("inspectorEl.dataset.railMode = mode");
  expect(inspectorSource).toContain('Project Snapshot');
  expect(html).toContain('data-section="capabilities"');
  expect(html).toContain('data-section="git"');
  expect(html).toContain('data-section="health"');
  expect(html).toContain('data-section="activity"');
});
```

- [ ] **Step 2: Run the contract test to verify it fails**

Run:

```bash
npx vitest run src/renderer/components/context-language.contract.test.ts
```

Expected: FAIL because the inspector does not yet derive or expose a rail mode.

- [ ] **Step 3: Update `index.html` and `context-inspector.ts`**

```html
<section class="context-inspector-section" data-section="capabilities">
  <div id="config-sections"></div>
</section>
<section class="context-inspector-section" data-section="git">
  <div id="git-panel"></div>
</section>
<section class="context-inspector-section" data-section="health">
  <div id="readiness-section"></div>
</section>
<section class="context-inspector-section" data-section="activity">
  <div id="session-history"></div>
</section>
```

```ts
import {
  deriveRightRailMode,
  deriveRightRailPresentation,
} from './right-rail-mode.js';

function applyRailMode(): void {
  const project = appState.activeProject;
  if (!project) {
    inspectorEl.dataset.railMode = 'normal';
    return;
  }

  const gitStatus = getGitStatus(project.id);
  const hasDirtyGit = Boolean(
    gitStatus?.isGitRepo && (gitStatus.staged + gitStatus.modified + gitStatus.untracked) > 0,
  );
  const hasGitConflicts = Boolean(gitStatus?.conflicted);
  const hasToolingContext = Boolean(getInspectorProviderId());
  const hasHealthWarning = project.readiness?.overallScore !== undefined
    ? project.readiness.overallScore < 70
    : false;

  const mode = deriveRightRailMode({
    hasHealthWarning,
    hasDirtyGit,
    hasGitConflicts,
    hasToolingContext,
  });

  inspectorEl.dataset.railMode = mode;
  const presentation = deriveRightRailPresentation(mode, { hasDirtyGit, hasGitConflicts });

  inspectorEl
    .querySelectorAll<HTMLElement>('.context-inspector-section')
    .forEach((section) => {
      const id = section.dataset.section as keyof typeof presentation;
      section.dataset.presentation = presentation[id];
    });
}

function renderOverview(): void {
  // Keep the top card compact and stable.
  overviewEl.innerHTML = `
    <section class="inspector-overview-card">
      <div class="inspector-overview-header">
        <div class="inspector-overview-project">
          <span class="inspector-overview-kicker">Project Snapshot</span>
          <span class="inspector-overview-name">${esc(project.name)}</span>
        </div>
        <span class="inspector-overview-provider">${esc(providerLabel)}</span>
      </div>
      ...
    </section>
  `;
}
```

- [ ] **Step 4: Re-run the contract test**

Run:

```bash
npx vitest run src/renderer/components/context-language.contract.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/index.html src/renderer/components/context-inspector.ts src/renderer/components/context-language.contract.test.ts
git commit -m "feat: wire context inspector to right rail mode"
```

## Task 3: Turn Config Sections Into The Tools Focus Primary Block

**Files:**
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/config-sections.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/config-sections-compact.contract.test.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/types.ts`

- [ ] **Step 1: Strengthen the compact contract around the new summary**

```ts
it('renders tools focus summary copy for tracking and integrations', () => {
  expect(source).toContain('window.calder.settings.validate');
  expect(source).toContain('isTrackingHealthy');
  expect(source).toContain('Tracking is on');
  expect(source).toContain('Tracking is off');
  expect(source).toContain('MCP servers connected');
  expect(source).toContain('custom commands available');
});
```

- [ ] **Step 2: Run the compact contract test to verify it fails**

Run:

```bash
npx vitest run src/renderer/components/config-sections-compact.contract.test.ts
```

Expected: FAIL because the current summary does not surface tracking or tools-focus copy.

- [ ] **Step 3: Implement the `Tools Focus` summary using existing validation APIs**

```ts
import { isTrackingHealthy } from '../../shared/tracking-health.js';

async function refresh(): Promise<void> {
  ...
  const [config, meta, validation] = await Promise.all([
    window.calder.provider.getConfig(providerId, project.path),
    window.calder.provider.getMeta(providerId),
    window.calder.settings.validate(providerId),
  ]);

  const trackingHealthy = isTrackingHealthy(meta, validation);

  function renderToolchainSummary(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'toolchain-summary toolchain-summary-tools-focus';

    wrap.innerHTML = `
      <div class="toolchain-provider">
        <span class="toolchain-provider-kicker">Tools Focus</span>
        <span class="toolchain-provider-value">${esc(providerLabel(providerId))}</span>
      </div>
      <div class="toolchain-summary-status">
        ${trackingHealthy ? 'Tracking is on' : 'Tracking is off'}
      </div>
      <div class="toolchain-summary-chips">
        <button type="button" class="toolchain-summary-chip control-chip">
          <span class="toolchain-summary-chip-label">MCP</span>
          <span class="toolchain-summary-chip-value">${config.mcpServers.length} MCP servers connected</span>
        </button>
        <button type="button" class="toolchain-summary-chip control-chip">
          <span class="toolchain-summary-chip-label">Commands</span>
          <span class="toolchain-summary-chip-value">${config.commands.length} custom commands available</span>
        </button>
      </div>
    `;

    return wrap;
  }
  ...
}
```

- [ ] **Step 4: Re-run the compact contract**

Run:

```bash
npx vitest run src/renderer/components/config-sections-compact.contract.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/config-sections.ts src/renderer/components/config-sections-compact.contract.test.ts src/renderer/types.ts
git commit -m "feat: promote tools focus summary in right rail"
```

## Task 4: Add Compact And Promoted Variants For Git, Health, And Activity

**Files:**
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/git-panel.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/git-panel.test.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/readiness-section.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/session-history.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/session-history.test.ts`

- [ ] **Step 1: Add failing tests for compact / promoted behavior**

```ts
it('keeps git compact when the repo is clean', async () => {
  const container = await renderGitPanel({
    isGitRepo: true,
    staged: 0,
    modified: 0,
    untracked: 0,
    conflicted: 0,
  });
  expect(container.innerHTML).toContain('Git is clean');
});

it('renders a compact run log summary before the full list', async () => {
  const { renderSessionHistory } = await import('./session-history.js');
  expect(renderSessionHistory.toString()).toContain('No run history yet');
  expect(renderSessionHistory.toString()).toContain('recent run');
});
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run:

```bash
npx vitest run src/renderer/components/git-panel.test.ts src/renderer/components/session-history.test.ts
```

Expected: FAIL because the current sections do not have explicit compact / promoted rendering.

- [ ] **Step 3: Teach each section to read its wrapper presentation**

```ts
function getSectionPresentation(container: HTMLElement): 'compact' | 'expanded' | 'promoted' {
  return (container.closest('.context-inspector-section')?.getAttribute('data-presentation') ??
    'expanded') as 'compact' | 'expanded' | 'promoted';
}
```

```ts
// git-panel.ts
const presentation = getSectionPresentation(container);
if (presentation === 'compact' && total === 0) {
  renderGitBodyState(body, 'Git is clean');
  return;
}
collapsed = presentation === 'compact';
```

```ts
// readiness-section.ts
const presentation = getSectionPresentation(container);
if (presentation === 'compact' && result) {
  const compact = document.createElement('div');
  compact.className = 'readiness-compact-summary';
  compact.textContent = result.overallScore >= 70 ? 'All good' : `${result.categories.length} health checks`;
  body.appendChild(compact);
  ...
}
```

```ts
// session-history.ts
if (presentation === 'compact') {
  const summary = document.createElement('div');
  summary.className = 'history-compact-summary';
  summary.textContent = history.length === 0
    ? 'No run history yet'
    : `${history.length} saved runs · ${history.at(-1)?.name ?? 'recent run'}`;
  container.appendChild(summary);
  return;
}
```

- [ ] **Step 4: Re-run the focused tests**

Run:

```bash
npx vitest run src/renderer/components/git-panel.test.ts src/renderer/components/session-history.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/git-panel.ts src/renderer/components/git-panel.test.ts src/renderer/components/readiness-section.ts src/renderer/components/session-history.ts src/renderer/components/session-history.test.ts
git commit -m "feat: add adaptive right rail section variants"
```

## Task 5: Restyle The Rail And Run Full Verification

**Files:**
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/context-inspector.css`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/context-language.contract.test.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/config-sections-compact.contract.test.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/right-rail-mode.test.ts`

- [ ] **Step 1: Add the final contract assertions for promoted / compact styling**

```ts
it('styles promoted and compact right-rail sections differently', () => {
  expect(inspectorCss).toContain('#context-inspector[data-rail-mode=');
  expect(inspectorCss).toContain('.context-inspector-section[data-presentation="promoted"]');
  expect(inspectorCss).toContain('.context-inspector-section[data-presentation="compact"]');
  expect(inspectorCss).toContain('.toolchain-summary-tools-focus');
});
```

- [ ] **Step 2: Run the contract tests to verify they fail**

Run:

```bash
npx vitest run src/renderer/components/context-language.contract.test.ts src/renderer/components/config-sections-compact.contract.test.ts src/renderer/components/right-rail-mode.test.ts
```

Expected: FAIL because the new styling hooks are not in CSS yet.

- [ ] **Step 3: Add the final CSS hierarchy**

```css
#context-inspector[data-rail-mode='tools-focus'] .context-inspector-section[data-section='capabilities'] {
  order: 1;
}

#context-inspector[data-rail-mode='warning'] .context-inspector-section[data-section='health'] {
  order: 1;
}

.context-inspector-section[data-presentation='promoted'] {
  padding: 12px 12px 10px;
  border-radius: 16px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.03), rgba(255, 255, 255, 0)),
    color-mix(in srgb, var(--surface-panel) 76%, transparent);
  border: 1px solid color-mix(in srgb, var(--border-subtle) 82%, transparent);
}

.context-inspector-section[data-presentation='compact'] {
  padding-top: 6px;
  opacity: 0.92;
}

#context-inspector .toolchain-summary-tools-focus {
  gap: 10px;
  padding: 14px 12px 12px;
  border-radius: 16px;
  background:
    radial-gradient(circle at top right, rgba(255, 193, 93, 0.1), transparent 28%),
    color-mix(in srgb, var(--surface-panel) 82%, transparent);
}
```

- [ ] **Step 4: Run the full renderer verification**

Run:

```bash
npx tsc -p tsconfig.test.json --noEmit
npx vitest run src/renderer/components/right-rail-mode.test.ts src/renderer/components/context-language.contract.test.ts src/renderer/components/config-sections-compact.contract.test.ts src/renderer/components/git-panel.test.ts src/renderer/components/session-history.test.ts
npm run build
npm test
```

Expected:

- TypeScript exits `0`
- focused Vitest suite PASS
- `npm run build` PASS
- `npm test` PASS

- [ ] **Step 5: Launch Calder and visually verify the adaptive rail**

Run:

```bash
npm start
```

Expected:

- `Tools Focus` is the default dominant block
- clean repos keep Git compact
- dirty repos expand Git
- tracking / readiness issues promote `Health`

- [ ] **Step 6: Commit**

```bash
git add src/renderer/styles/context-inspector.css src/renderer/components/context-language.contract.test.ts src/renderer/components/config-sections-compact.contract.test.ts src/renderer/components/right-rail-mode.test.ts
git commit -m "feat: restyle right rail around tools focus"
```

## Self-Review Checklist

- Spec coverage: `Tools Focus`, `Git-first as secondary`, `Health warning override`, `Project Snapshot`, and `compact activity` each map to a task above.
- Placeholder scan: no `TODO`, `TBD`, or unnamed steps remain.
- Type consistency: the plan uses one shared vocabulary across tasks:
  - `RightRailMode`
  - `RightRailPresentation`
  - `data-rail-mode`
  - `data-presentation`

