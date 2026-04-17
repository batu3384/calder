# Calder Single-Active CLI Launcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the crowded multi-provider launcher row with one active full-name CLI selector that opens a switcher popover, while keeping provider labels consistent across the shell.

**Architecture:** Reuse the existing provider metadata and persisted `preferences.defaultProvider` flow, but collapse the top launcher to a single active provider control. Remove chip-rack behavior from the command deck, rebuild the visual shell around a single provider trigger, and unify secondary-surface provider labels around shared provider metadata.

**Tech Stack:** Electron renderer, TypeScript, existing custom select component, shared provider availability cache, Vitest contract and unit tests, CSS theme layers.

---

### Task 1: Lock The New Launcher Contract In Tests

**Files:**
- Modify: `src/renderer/components/tab-bar-command-deck.test.ts`
- Modify: `src/renderer/styles/command-deck.contract.test.ts`
- Modify: `src/renderer/components/tab-bar-provider-selector.test.ts`
- Create: `src/renderer/components/context-inspector-provider.contract.test.ts`

- [ ] **Step 1: Write the failing command-deck contract**

Add assertions that the launcher source keeps `session-provider-slot`, still renders `command-deck-provider-select`, and no longer depends on the old multi-chip approach:

```ts
expect(source).toContain('session-provider-slot');
expect(source).toContain('command-deck-provider-select');
expect(source).not.toContain('session-provider-chipbar');
expect(source).not.toContain('SESSION_PROVIDER_SHORT_LABELS');
```

- [ ] **Step 2: Write the failing stylesheet contract**

Add assertions proving the command deck no longer styles a persistent chip bar and instead styles a single active provider trigger:

```ts
expect(tabsCss).toContain('.command-deck-provider-select .custom-select-trigger');
expect(tabsCss).not.toContain('.session-provider-chipbar');
expect(tabsCss).not.toContain('.session-provider-chip {');
```

- [ ] **Step 3: Extend the provider helper tests**

Add a helper-level expectation that launcher-facing labels come from provider metadata rather than short aliases:

```ts
expect(getProviderDisplayName('claude')).toBe('Claude Code');
expect(getProviderDisplayName('codex')).toBe('Codex CLI');
```

If this requires exported test-safe helpers, add them in a pure way instead of coupling tests to DOM rendering.

- [ ] **Step 4: Add a right-rail/provider-label contract**

Create `src/renderer/components/context-inspector-provider.contract.test.ts` with assertions like:

```ts
expect(source).toContain('getProviderDisplayName(getInspectorProviderId())');
expect(source).not.toContain('Claude Code for every project');
```

- [ ] **Step 5: Run the focused RED suite**

Run: `npm test -- src/renderer/components/tab-bar-command-deck.test.ts src/renderer/styles/command-deck.contract.test.ts src/renderer/components/tab-bar-provider-selector.test.ts src/renderer/components/context-inspector-provider.contract.test.ts`

Expected: FAIL because the codebase still contains the multi-chip implementation and short-label logic.

### Task 2: Simplify Launcher State To One Active Provider

**Files:**
- Modify: `src/renderer/components/tab-bar.ts`
- Modify: `src/renderer/provider-availability.ts`

- [ ] **Step 1: Remove chip-rack state from the tab bar**

Delete the old chip-specific state and short-label map:

```ts
let sessionProviderChipButtons = new Map<ProviderId, HTMLButtonElement>();
const SESSION_PROVIDER_SHORT_LABELS: Partial<Record<ProviderId, string>> = { ... };
```

The launcher should no longer maintain per-chip active state.

- [ ] **Step 2: Keep a single effective active provider path**

Continue to resolve the active quick-launch provider through:

```ts
const selectedProvider = resolvePreferredProviderForLaunch(
  appState.preferences.defaultProvider,
  snapshot,
);
```

but build only one visible trigger for that provider.

- [ ] **Step 3: Use full provider display names from metadata**

Where the launcher builds the select options, switch to:

```ts
label: available ? provider.displayName : `${provider.displayName} (not installed)`
```

Do not derive launcher labels from hand-written short aliases.

- [ ] **Step 4: Keep provider selection persistent**

Preserve the current persistence path:

```ts
appState.setPreference('defaultProvider', providerId);
```

so the new single-active launcher keeps the same storage behavior as the current selector.

- [ ] **Step 5: Run the focused provider tests**

Run: `npm test -- src/renderer/components/tab-bar-provider-selector.test.ts src/renderer/components/tab-bar-command-deck.test.ts`

Expected: PASS for the new single-active-provider contract.

### Task 3: Rebuild The Top Launcher Visual Shell

**Files:**
- Modify: `src/renderer/index.html`
- Modify: `src/renderer/styles/tabs.css`
- Modify: `src/renderer/styles/theme-aurora.css`

- [ ] **Step 1: Keep only one provider surface in the launcher slot**

Do not add a second row or secondary chip container in `src/renderer/index.html`. Keep:

```html
<div id="session-provider-slot" hidden></div>
```

as the single mount point inside `#session-launcher`.

- [ ] **Step 2: Remove chipbar CSS**

Delete the now-obsolete selectors:

```css
.session-provider-chipbar { ... }
.session-provider-chip { ... }
.session-provider-chip::before { ... }
```

and any responsive overrides that only exist to squeeze a multi-chip row into the launcher.

- [ ] **Step 3: Give the active trigger enough width budget**

Keep the provider trigger as the priority control:

```css
.command-deck-provider-select {
  min-width: 164px;
  max-width: 220px;
}

.command-deck-provider-select .custom-select-trigger {
  padding: 0 28px 0 28px;
  white-space: nowrap;
}
```

Then tune the exact numbers to the shell rhythm while preserving the full-name goal in normal desktop widths.

- [ ] **Step 4: Fix responsive overrides so the provider dot never overlaps text**

Preserve the left padding for provider-dot layout at narrower breakpoints:

```css
@container workspace-stack (max-width: 980px) {
  .command-deck-provider-select .custom-select-trigger {
    padding: 0 24px 0 28px;
  }
}
```

Do not let generic trigger overrides collapse that left padding back to `8px`.

- [ ] **Step 5: Keep the aurora theme provider-neutral**

Do not reintroduce generic cyan tinting on the provider badge. `theme-aurora.css` must not style `.terminal-pane-provider` as a generic aurora label again.

- [ ] **Step 6: Run launcher-style verification**

Run: `npm test -- src/renderer/styles/command-deck.contract.test.ts src/renderer/styles/theme-contract.test.ts`

Expected: PASS

### Task 4: Unify Provider Labels Across Secondary Surfaces

**Files:**
- Modify: `src/renderer/components/context-inspector.ts`
- Modify: `src/renderer/components/terminal-pane.ts`
- Modify: `src/renderer/components/cli-surface/pane.ts`
- Modify: `src/renderer/components/session-history.ts`
- Modify: `src/renderer/components/terminal-pane.test.ts`
- Modify: `src/renderer/components/session-history.test.ts`

- [ ] **Step 1: Remove local provider name drift where shared metadata is available**

Prefer:

```ts
import { getProviderDisplayName } from '../provider-availability.js';
```

and call it for visible provider text instead of maintaining duplicated label maps unless a tested fallback is truly required.

- [ ] **Step 2: Keep terminal pane provider styling data-driven**

Retain:

```ts
providerBadge.dataset.provider = providerId;
```

but make the text source align with shared provider display names so `Codex CLI`, `Claude Code`, and `MiniMax CLI` stay identical across surfaces.

- [ ] **Step 3: Verify the right rail reflects the actual active provider**

Keep or tighten:

```ts
const providerLabel = getProviderDisplayName(getInspectorProviderId());
```

and make sure the overview pill is always built from that value.

- [ ] **Step 4: Strengthen tests for provider-label consistency**

Add or update expectations such as:

```ts
expect(details?.textContent).toContain('Codex CLI');
expect(providerBadge?.dataset.provider).toBe('claude');
```

so stale `Claude Code` fallback regressions are caught early.

- [ ] **Step 5: Run the secondary-surface slice**

Run: `npm test -- src/renderer/components/context-inspector-provider.contract.test.ts src/renderer/components/terminal-pane.test.ts src/renderer/components/session-history.test.ts`

Expected: PASS

### Task 5: Manual Smoke Proof And Final Verification

**Files:**
- Verify only

- [ ] **Step 1: Run the complete focused verification bundle**

Run:

```bash
npm test -- \
  src/renderer/components/tab-bar-command-deck.test.ts \
  src/renderer/components/tab-bar-provider-selector.test.ts \
  src/renderer/components/context-inspector-provider.contract.test.ts \
  src/renderer/styles/command-deck.contract.test.ts \
  src/renderer/styles/theme-contract.test.ts \
  src/renderer/components/terminal-pane.test.ts \
  src/renderer/components/session-history.test.ts
```

Expected: all listed suites pass.

- [ ] **Step 2: Run the production build**

Run: `npm run build`

Expected: exit code `0`.

- [ ] **Step 3: Run a manual launcher smoke check**

Run: `node scripts/run-electron.js`

Verify:

- only one active CLI capsule is visible in the launcher
- the capsule uses the full provider name
- the switcher popover lists all providers with full names
- the update button and new-session button remain visually separate
- medium desktop widths do not show clipped or half-visible provider controls
- the right rail shows the provider of the actual active session

- [ ] **Step 4: Commit the planning and implementation slice**

```bash
git add \
  docs/superpowers/specs/2026-04-17-calder-single-active-cli-launcher-design.md \
  docs/superpowers/plans/2026-04-17-calder-single-active-cli-launcher.md \
  src/renderer/components/tab-bar.ts \
  src/renderer/provider-availability.ts \
  src/renderer/index.html \
  src/renderer/styles/tabs.css \
  src/renderer/styles/theme-aurora.css \
  src/renderer/components/context-inspector.ts \
  src/renderer/components/terminal-pane.ts \
  src/renderer/components/cli-surface/pane.ts \
  src/renderer/components/session-history.ts \
  src/renderer/components/tab-bar-command-deck.test.ts \
  src/renderer/components/tab-bar-provider-selector.test.ts \
  src/renderer/components/context-inspector-provider.contract.test.ts \
  src/renderer/styles/command-deck.contract.test.ts \
  src/renderer/styles/theme-contract.test.ts \
  src/renderer/components/terminal-pane.test.ts \
  src/renderer/components/session-history.test.ts

git commit -m "refine calder single-active cli launcher"
```
