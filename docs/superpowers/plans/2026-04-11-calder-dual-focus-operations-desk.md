# Calder Dual-Focus Operations Desk Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recast Calder into a dual-focus operations desk by replacing inherited shell language, reworking the main visual hierarchy, and turning settings into an operational control center without breaking current browser, session, provider, or PTY behavior.

**Architecture:** Keep the existing Electron + TypeScript + vanilla DOM renderer and current runtime behavior. Implement the redesign in small TDD phases: first lock new naming and shell contracts, then reshape the DOM copy and settings IA, then retune theme tokens and major surfaces, then refresh browser/empty states and finish with regression coverage and smoke verification.

**Tech Stack:** Electron, TypeScript, vanilla DOM renderer, CSS custom properties, Vitest, esbuild

---

## Execution Notes

- The repo already contains many unrelated edits. Do not revert or restage files outside the scope of each task.
- Do not change provider launch APIs, PTY lifecycle, browser webview routing, or session persistence behavior.
- Preserve the existing browser-left behavior and current session/browser interaction model.
- Keep UI copy in English.
- After every task, run the focused tests listed in that task.
- After every two tasks, run `npm run build && npm test`.

## File Structure

### Shell naming and structure

- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/index.html`
  - Replace inherited shell labels with the new dual-focus naming.
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/tab-bar.ts`
  - Update workspace identity / spend copy hooks to the new vocabulary.
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/context-inspector.ts`
  - Align the right rail title and section framing with `Ops Rail`.
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/config-sections.ts`
  - Rename `Toolchain` presentation to `Tools`.
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/readiness-section.ts`
  - Rename `AI Setup` presentation to `Providers`.
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/session-history.ts`
  - Rename `Recent Sessions` presentation to `Activity`.
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/project-terminal.ts`
  - Rename `Scratch Shell` presentation to `Quick Terminal`.

### Settings control center

- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/preferences-modal.ts`
  - Replace left-nav shell framing with segmented control-center structure.
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/preferences.css`
  - Introduce the new control-center layout, section blocks, and status rows.
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/provider-neutral-copy.contract.test.ts`
  - Update contract assertions to new terminology.
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/preferences-modal.contract.test.ts`
  - Assert the new settings IA labels and section titles.

### Theme and surfaces

- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/base.css`
  - Replace inherited color bias with operations-desk tokens.
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/sidebar.css`
  - Reduce rail dominance and tighten project navigation styling.
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/tabs.css`
  - Reframe the top strip around `Live View` + `Session Deck` emphasis.
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/context-inspector.css`
  - Restyle the right rail as denser operational support.
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/browser-tab.css`
  - Give Live View a cleaner visual plane and retune NTP/default-state styling.
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/cockpit.css`
  - Reduce overused kicker / chip styling where it reinforces the inherited shell.

### Empty states and browser defaults

- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/browser-tab/pane.ts`
  - Replace `Calder Workspace` and old default-state copy with dual-focus copy.
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/split-layout.ts`
  - Rewrite empty-state labels and action copy to utility-first language.
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/alert-banner.ts`
  - Align warning copy with the new product language.

### Regression coverage

- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/context-language.contract.test.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/browser-tab-pane.test.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/layout-contract.test.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/theme-contract.test.ts`

## Task 1: Lock The New Shell Vocabulary

**Files:**
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/context-language.contract.test.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/provider-neutral-copy.contract.test.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/preferences-modal.contract.test.ts`

- [ ] **Step 1: Write the failing contract expectations for the new vocabulary**

Update `/Users/batuhanyuksel/Documents/browser/src/renderer/components/context-language.contract.test.ts` so the assertions move to the new shell names:

```ts
expect(html).toContain('Ops Rail');
expect(html).toContain('Providers');
expect(html).toContain('Activity');
expect(html).toContain('Tools');
expect(html).not.toContain('Control Panel');
expect(html).not.toContain('AI Setup');
expect(html).not.toContain('Recent Sessions');
expect(html).not.toContain('Toolchain');
```

Update `/Users/batuhanyuksel/Documents/browser/src/renderer/components/provider-neutral-copy.contract.test.ts` to assert:

```ts
expect(preferencesSource).toContain('Ops Rail modules');
expect(preferencesSource).toContain('Live View behavior');
expect(preferencesSource).toContain('Session Deck defaults');
expect(preferencesSource).toContain('Providers');
expect(preferencesSource).not.toContain('Context inspector: Toolchain');
expect(preferencesSource).not.toContain('Context inspector: AI Setup');
```

Update `/Users/batuhanyuksel/Documents/browser/src/renderer/components/preferences-modal.contract.test.ts` to assert:

```ts
expect(source).toContain('Control Center');
expect(source).toContain('Layout');
expect(source).toContain('Providers');
expect(source).not.toContain('Control Surface');
expect(source).not.toContain('Shell Layout');
```

- [ ] **Step 2: Run the focused contract tests and confirm they fail**

Run:

```bash
./node_modules/.bin/vitest run \
  src/renderer/components/context-language.contract.test.ts \
  src/renderer/components/provider-neutral-copy.contract.test.ts \
  src/renderer/components/preferences-modal.contract.test.ts
```

Expected: FAIL because the renderer still contains old terms like `Control Panel`, `AI Setup`, and `Toolchain`.

- [ ] **Step 3: Implement the new vocabulary in the renderer**

Modify `/Users/batuhanyuksel/Documents/browser/src/renderer/index.html`:

```html
<span class="sidebar-title">Projects</span>
...
<span class="context-inspector-eyebrow">Support</span>
<span class="context-inspector-title">Ops Rail</span>
...
<div class="context-inspector-section-label">Providers</div>
...
<div class="context-inspector-section-label">Activity</div>
...
<div class="context-inspector-section-label">Tools</div>
```

Modify `/Users/batuhanyuksel/Documents/browser/src/renderer/components/readiness-section.ts`:

```ts
headingButton.innerHTML = `<span class="config-section-toggle ${collapsed ? 'collapsed' : ''}">&#x25BC;</span><span class="config-section-title">Providers</span>`;
```

Modify `/Users/batuhanyuksel/Documents/browser/src/renderer/components/session-history.ts`:

```ts
<span class="config-section-title">Activity</span>
```

Modify `/Users/batuhanyuksel/Documents/browser/src/renderer/components/git-panel.ts` only if needed to keep `Changes` unchanged.

Modify `/Users/batuhanyuksel/Documents/browser/src/renderer/components/config-sections.ts`:

```ts
title.textContent = 'Tools';
```

Modify `/Users/batuhanyuksel/Documents/browser/src/renderer/components/project-terminal.ts`:

```ts
<span class="project-terminal-title">Quick Terminal</span>
```

- [ ] **Step 4: Re-run the focused contract tests**

Run:

```bash
./node_modules/.bin/vitest run \
  src/renderer/components/context-language.contract.test.ts \
  src/renderer/components/provider-neutral-copy.contract.test.ts \
  src/renderer/components/preferences-modal.contract.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the vocabulary pass**

```bash
git add \
  src/renderer/index.html \
  src/renderer/components/readiness-section.ts \
  src/renderer/components/session-history.ts \
  src/renderer/components/config-sections.ts \
  src/renderer/components/project-terminal.ts \
  src/renderer/components/context-language.contract.test.ts \
  src/renderer/components/provider-neutral-copy.contract.test.ts \
  src/renderer/components/preferences-modal.contract.test.ts
git commit -m "refactor: adopt dual-focus shell vocabulary"
```

## Task 2: Reshape Preferences Into A Control Center

**Files:**
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/preferences-modal.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/preferences.css`
- Test: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/preferences-modal.contract.test.ts`

- [ ] **Step 1: Write a failing contract for the new settings IA**

In `/Users/batuhanyuksel/Documents/browser/src/renderer/components/preferences-modal.contract.test.ts`, add assertions like:

```ts
expect(source).toContain("type Section = 'general' | 'layout' | 'providers' | 'shortcuts' | 'about'");
expect(source).toContain("{ id: 'layout', label: 'Layout' }");
expect(source).toContain("{ id: 'providers', label: 'Providers' }");
expect(source).toContain('Ops Rail modules');
expect(source).toContain('Live View behavior');
expect(source).toContain('Session Deck defaults');
```

- [ ] **Step 2: Run the settings contract test and confirm it fails**

Run:

```bash
./node_modules/.bin/vitest run src/renderer/components/preferences-modal.contract.test.ts
```

Expected: FAIL because the file still defines `sidebar`, `setup`, and legacy shell copy.

- [ ] **Step 3: Replace the settings structure and copy**

In `/Users/batuhanyuksel/Documents/browser/src/renderer/components/preferences-modal.ts`, change the section type and menu model:

```ts
type Section = 'general' | 'layout' | 'providers' | 'shortcuts' | 'about';

const sections: { id: Section; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'layout', label: 'Layout' },
  { id: 'providers', label: 'Providers' },
  { id: 'shortcuts', label: 'Shortcuts' },
  { id: 'about', label: 'About' },
];
```

Replace the old left-nav header copy:

```ts
menuHeader.innerHTML = `
  <div class="preferences-menu-kicker shell-kicker">Calder</div>
  <div class="preferences-menu-title">Control Center</div>
  <div class="preferences-menu-caption">Live layout, provider health, session defaults, and app behavior.</div>
`;
```

Replace the old `sidebar` branch with `layout` and group layout controls into blocks:

```ts
appendSectionIntro(
  content,
  'Layout',
  'Surface Defaults',
  'Choose which support modules stay visible around Live View and the Session Deck.',
);
```

Use grouped labels instead of implementation-heavy toggle labels:

```ts
[
  { key: 'configSections', label: 'Ops Rail modules' },
  { key: 'readinessSection', label: 'Providers visibility' },
  { key: 'gitPanel', label: 'Changes visibility' },
  { key: 'sessionHistory', label: 'Activity visibility' },
  { key: 'costFooter', label: 'Spend chip visibility' },
]
```

Rename `setup` to `providers` and change the intro:

```ts
appendSectionIntro(
  content,
  'Providers',
  'Provider Health',
  'Review connected coding tools, readiness, and tracking status in one place.',
);
```

- [ ] **Step 4: Restyle the settings shell as a control center**

In `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/preferences.css`, introduce a segmented, block-based layout:

```css
.preferences-layout {
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-height: 520px;
}

.preferences-menu {
  width: auto;
  display: flex;
  align-items: center;
  gap: 8px;
  border-right: none;
  border-bottom: 1px solid var(--border-subtle);
  padding: 0 0 14px;
  background: transparent;
}

.preferences-menu-item {
  min-height: 34px;
  padding: 0 12px;
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
}

.preferences-content {
  padding: 0;
  border: none;
  background: transparent;
}

.preferences-section-card {
  border: 1px solid var(--border-hairline);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--surface-panel) 78%, transparent);
  padding: 16px;
}
```

- [ ] **Step 5: Re-run the settings contract test**

Run:

```bash
./node_modules/.bin/vitest run src/renderer/components/preferences-modal.contract.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the settings control-center pass**

```bash
git add \
  src/renderer/components/preferences-modal.ts \
  src/renderer/styles/preferences.css \
  src/renderer/components/preferences-modal.contract.test.ts \
  src/renderer/components/provider-neutral-copy.contract.test.ts
git commit -m "feat: turn preferences into a control center"
```

## Task 3: Rebuild The Theme Tokens Around Operations Desk Styling

**Files:**
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/base.css`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/cockpit.css`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/theme-contract.test.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/layout-contract.test.ts`

- [ ] **Step 1: Add failing assertions for the new token direction**

Update `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/theme-contract.test.ts`:

```ts
expect(baseCss).toContain('--surface-live');
expect(baseCss).toContain('--surface-deck');
expect(baseCss).toContain('--surface-ops');
expect(baseCss).toContain('--accent-warm');
expect(baseCss).not.toContain('--accent: #ef6879;');
```

Update `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/layout-contract.test.ts`:

```ts
expect(contextCss).toContain('.ops-rail-surface');
expect(browserCss).toContain('.live-view-surface');
expect(tabsCss).toContain('.session-deck-surface');
```

- [ ] **Step 2: Run the theme/layout contract tests and confirm they fail**

Run:

```bash
./node_modules/.bin/vitest run \
  src/renderer/styles/theme-contract.test.ts \
  src/renderer/styles/layout-contract.test.ts
```

Expected: FAIL because the new tokens and selectors do not exist yet.

- [ ] **Step 3: Replace the root theme tokens**

In `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/base.css`, replace the accent and surface model with the operations-desk hierarchy:

```css
:root {
  --surface-canvas: #071019;
  --surface-rail: #0a1118;
  --surface-live: #08131d;
  --surface-deck: #0d1722;
  --surface-ops: #0b141d;
  --surface-panel: #101923;
  --surface-panel-alt: #131d28;
  --accent-warm: #d39a56;
  --accent: var(--accent-warm);
  --accent-soft: rgba(211, 154, 86, 0.14);
  --border-focus: rgba(211, 154, 86, 0.36);
}
```

Also reduce inherited atmospheric glow in `html, body`:

```css
background:
  radial-gradient(circle at top left, rgba(211, 154, 86, 0.05), transparent 24%),
  radial-gradient(circle at top right, rgba(97, 129, 169, 0.06), transparent 22%),
  linear-gradient(180deg, #09111a 0%, var(--surface-canvas) 26%, #06090d 100%);
```

- [ ] **Step 4: Add the new surface aliases**

In `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/cockpit.css`, define:

```css
.live-view-surface {
  background: linear-gradient(180deg, rgba(255,255,255,0.018), rgba(255,255,255,0)), var(--surface-live);
}

.session-deck-surface {
  background: linear-gradient(180deg, rgba(255,255,255,0.024), rgba(255,255,255,0)), var(--surface-deck);
}

.ops-rail-surface {
  background: linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0)), var(--surface-ops);
}
```

- [ ] **Step 5: Re-run the focused theme/layout contract tests**

Run:

```bash
./node_modules/.bin/vitest run \
  src/renderer/styles/theme-contract.test.ts \
  src/renderer/styles/layout-contract.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the theme-token pass**

```bash
git add \
  src/renderer/styles/base.css \
  src/renderer/styles/cockpit.css \
  src/renderer/styles/theme-contract.test.ts \
  src/renderer/styles/layout-contract.test.ts
git commit -m "refactor: adopt operations desk theme tokens"
```

## Task 4: Differentiate Project Rail, Live View, Session Deck, And Ops Rail

**Files:**
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/sidebar.css`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/tabs.css`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/context-inspector.css`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/index.html`

- [ ] **Step 1: Write a failing shell-structure contract**

Extend `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/layout-contract.test.ts` with:

```ts
expect(html).toContain('project-rail');
expect(html).toContain('live-view');
expect(html).toContain('session-deck');
expect(html).toContain('ops-rail');
```

- [ ] **Step 2: Run the shell-structure contract and confirm it fails**

Run:

```bash
./node_modules/.bin/vitest run src/renderer/styles/layout-contract.test.ts
```

Expected: FAIL because the DOM still uses generic shell identifiers only.

- [ ] **Step 3: Add semantic shell hooks without changing behavior**

Update `/Users/batuhanyuksel/Documents/browser/src/renderer/index.html`:

```html
<div id="sidebar" class="sidebar-surface project-rail">
...
<div id="workspace-shell" class="workspace-shell-surface">
  <div id="workspace-stack" class="session-deck session-deck-surface">
...
  <aside id="context-inspector" class="context-inspector-open control-panel-surface ops-rail ops-rail-surface">
```

Add the Live View hook in `/Users/batuhanyuksel/Documents/browser/src/renderer/components/browser-tab/pane.ts`:

```ts
contentShell.className = 'browser-content-shell live-view-surface live-view';
```

- [ ] **Step 4: Retune the major surface CSS**

In `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/sidebar.css`, reduce dominance:

```css
#sidebar {
  width: 204px;
  background: linear-gradient(180deg, rgba(255,255,255,0.018), rgba(255,255,255,0)), var(--surface-rail);
  box-shadow: inset -1px 0 0 rgba(255,255,255,0.02);
}
```

In `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/tabs.css`, strengthen Session Deck:

```css
#tab-bar {
  background: linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0)), var(--surface-deck);
}

#tab-list {
  background: color-mix(in srgb, var(--surface-panel) 78%, transparent);
}
```

In `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/context-inspector.css`, tighten Ops Rail:

```css
#context-inspector {
  width: 312px;
  background: linear-gradient(180deg, rgba(255,255,255,0.016), rgba(255,255,255,0)), var(--surface-ops);
}

.context-inspector-section {
  gap: 6px;
}
```

- [ ] **Step 5: Re-run the layout contract**

Run:

```bash
./node_modules/.bin/vitest run src/renderer/styles/layout-contract.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run build and full tests after the first two UI passes**

Run:

```bash
npm run build && npm test
```

Expected: PASS.

- [ ] **Step 7: Commit the shell-surface pass**

```bash
git add \
  src/renderer/index.html \
  src/renderer/components/browser-tab/pane.ts \
  src/renderer/styles/sidebar.css \
  src/renderer/styles/tabs.css \
  src/renderer/styles/context-inspector.css \
  src/renderer/styles/layout-contract.test.ts
git commit -m "feat: reshape calder into a dual-focus shell"
```

## Task 5: Rewrite Browser Defaults And Empty States To Match The New Identity

**Files:**
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/browser-tab/pane.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/split-layout.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/browser-tab.css`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/base.css`
- Test: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/browser-tab-pane.test.ts`

- [ ] **Step 1: Add failing copy expectations for browser defaults**

Update `/Users/batuhanyuksel/Documents/browser/src/renderer/components/browser-tab-pane.test.ts`:

```ts
expect(source).toContain("ntpEyebrow.textContent = 'Live View'");
expect(source).toContain('Open a live target');
expect(source).not.toContain('Calder Workspace');
```

Add a failing empty-state expectation in a relevant contract or create one inline in `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/layout-contract.test.ts`:

```ts
expect(splitLayoutSource).toContain("eyebrow.textContent = 'Ready'");
expect(splitLayoutSource).not.toContain("eyebrow.textContent = 'Workspace'");
```

- [ ] **Step 2: Run the focused tests and confirm they fail**

Run:

```bash
./node_modules/.bin/vitest run \
  src/renderer/components/browser-tab-pane.test.ts \
  src/renderer/styles/layout-contract.test.ts
```

Expected: FAIL because the old default-state copy is still present.

- [ ] **Step 3: Rewrite the browser default-state copy**

In `/Users/batuhanyuksel/Documents/browser/src/renderer/components/browser-tab/pane.ts`, replace:

```ts
ntpEyebrow.textContent = 'Calder Workspace';
```

with:

```ts
ntpEyebrow.textContent = 'Live View';
```

Replace section copy blocks with more direct utility language:

```ts
ntpTitle.textContent = 'Open a live target';
ntpSubtitle.textContent = 'Jump into a local app, inspect a page, and send context to the active session without leaving Calder.';
ntpTargetsTitle.textContent = 'Local targets';
ntpWorkflowTitle.textContent = 'Working loop';
```

- [ ] **Step 4: Rewrite split-layout empty states**

In `/Users/batuhanyuksel/Documents/browser/src/renderer/components/split-layout.ts`, replace the old empty-state nouns:

```ts
eyebrow.textContent = 'Ready';
title.textContent = 'Start a session or open Live View';
copy.textContent = 'Choose a coding tool, open a browser target, or continue recent work from the current project.';
detail.textContent = 'This area keeps your live product surface and AI work side by side.';
```

Use the secondary state:

```ts
eyebrow.textContent = 'Live';
title.textContent = 'Project surface is ready';
```

- [ ] **Step 5: Retune browser and empty-state styling**

In `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/browser-tab.css`, make the default state less inherited and less card-heavy:

```css
.browser-ntp-layout {
  grid-template-columns: minmax(0, 1.15fr) minmax(280px, 0.85fr);
}

.browser-ntp-panel {
  border-radius: 16px;
  background: color-mix(in srgb, var(--surface-panel) 68%, transparent);
}
```

In `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/base.css`, simplify the empty-state card:

```css
.empty-state-card {
  padding: 24px;
  border-radius: 18px;
  background: color-mix(in srgb, var(--surface-panel) 92%, black);
  box-shadow: none;
}
```

- [ ] **Step 6: Re-run the focused tests**

Run:

```bash
./node_modules/.bin/vitest run \
  src/renderer/components/browser-tab-pane.test.ts \
  src/renderer/styles/layout-contract.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit the browser/default-state pass**

```bash
git add \
  src/renderer/components/browser-tab/pane.ts \
  src/renderer/components/split-layout.ts \
  src/renderer/styles/browser-tab.css \
  src/renderer/styles/base.css \
  src/renderer/components/browser-tab-pane.test.ts \
  src/renderer/styles/layout-contract.test.ts
git commit -m "refactor: align live view and empty states with new shell"
```

## Task 6: Final Regression Sweep And Visual Verification

**Files:**
- Modify only if a failing test reveals a regression within scope.

- [ ] **Step 1: Run the focused renderer smoke tests**

Run:

```bash
./node_modules/.bin/vitest run \
  src/renderer/components/browser-tab/session-integration.test.ts \
  src/renderer/components/browser-tab/popover.test.ts \
  src/renderer/components/tab-bar-command-deck.test.ts \
  src/renderer/keybindings.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run the full validation pass**

Run:

```bash
npm run build
npm test
```

Expected: both commands PASS.

- [ ] **Step 3: Launch Calder for a visual smoke check**

Run:

```bash
./node_modules/electron/dist/Electron.app/Contents/MacOS/Electron . --remote-debugging-port=9222
```

Verify manually:

- Project Rail is visually quieter than the central work area
- Live View is still anchored on the left when browser is open
- Session Deck remains the main AI work surface on the right
- Ops Rail labels show `Providers`, `Changes`, `Activity`, `Tools`
- Preferences reads as `Control Center` and uses the new top navigation
- No old labels such as `Control Panel`, `Control Surface`, or `Calder Workspace` remain on visible UI

- [ ] **Step 4: If the smoke pass is clean, create the final commit**

```bash
git add \
  src/renderer/index.html \
  src/renderer/components/tab-bar.ts \
  src/renderer/components/context-inspector.ts \
  src/renderer/components/config-sections.ts \
  src/renderer/components/readiness-section.ts \
  src/renderer/components/session-history.ts \
  src/renderer/components/project-terminal.ts \
  src/renderer/components/preferences-modal.ts \
  src/renderer/components/browser-tab/pane.ts \
  src/renderer/components/split-layout.ts \
  src/renderer/components/alert-banner.ts \
  src/renderer/styles/base.css \
  src/renderer/styles/cockpit.css \
  src/renderer/styles/sidebar.css \
  src/renderer/styles/tabs.css \
  src/renderer/styles/context-inspector.css \
  src/renderer/styles/browser-tab.css \
  src/renderer/styles/preferences.css \
  src/renderer/components/context-language.contract.test.ts \
  src/renderer/components/provider-neutral-copy.contract.test.ts \
  src/renderer/components/preferences-modal.contract.test.ts \
  src/renderer/components/browser-tab-pane.test.ts \
  src/renderer/styles/layout-contract.test.ts \
  src/renderer/styles/theme-contract.test.ts
git commit -m "feat: redesign calder as a dual-focus operations desk"
```

## Self-Review

### Spec coverage

- Shell renaming and anti-inherited language: covered by Tasks 1, 4, and 5.
- Settings as a control center: covered by Task 2.
- Theme / surface hierarchy shift: covered by Tasks 3 and 4.
- Browser-left + AI-right dual-focus identity: covered by Tasks 4 and 5.
- Empty-state cleanup and less decorative default surfaces: covered by Task 5.
- Full regression safety: covered by Task 6.

### Placeholder scan

- No draft markers remain in the plan body.
- Each task names exact files, exact tests, and concrete commands.

### Type and naming consistency

- New naming is consistent across the plan:
  - `Ops Rail`
  - `Live View`
  - `Session Deck`
  - `Providers`
  - `Activity`
  - `Tools`
- The plan preserves current behavioral APIs and limits scope to renderer/UI work.
