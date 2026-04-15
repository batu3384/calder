# Calder Settings-First Shell Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Calder ayarlar ekranını referans yüzey yapıp tüm shell boyunca görsel tutarlılık, dil bütünlüğü ve küçük UI-state güvenilirliği sorunlarını bozmadan düzeltmek.

**Architecture:** Önce ayarlar ve locale kapsamı için regresyon kontratları kilitlenecek, ardından settings modal içinde daha sakin alt grup yapısı kurulacak. Sonraki aşamada sidebar, tab bar, browser/CLI chrome ve right rail aynı shell dili altında normalize edilecek; davranış değişikliği sadece doğrudan kalite/kararlılık düzeltmesi gereken yerlerde yapılacak.

**Tech Stack:** TypeScript, Electron renderer, Vitest contract tests, CSS modules (`preferences.css`, `sidebar.css`, `tabs.css`, `browser-tab.css`, `terminal.css`, `context-inspector.css`)

---

## Scope Check

Spec tek alt-sistem odaklıdır: Calder renderer shell consistency. Ayrı alt proje spec’lerine bölünmesi gerekmiyor. Bu plan, davranışı koruyarak settings -> shell -> responsive doğrulama sırasıyla ilerler.

## Execution Setup

Bu planı uygulamaya başlamadan önce izole worktree aç:

```bash
cd /Users/batuhanyuksel/Documents/browser
git worktree add ../browser-settings-shell-consistency -b codex/calder-settings-shell-consistency
cd ../browser-settings-shell-consistency
```

İlk baseline komutları:

```bash
npm test -- src/renderer/components/preferences-modal.contract.test.ts src/renderer/i18n.contract.test.ts src/renderer/components/tab-bar-cli-surface.contract.test.ts src/renderer/components/context-inspector-reopen.contract.test.ts src/renderer/styles/sidebar.contract.test.ts src/renderer/components/split-layout.test.ts
npx tsc -p tsconfig.main.json
npx tsc -p tsconfig.preload.json
npm run build:renderer
```

Beklenen: mevcut çalışma ağacı için komutlar geçebilir; amaç baseline kanıtı almaktır.

## File Structure Lock

- `/Users/batuhanyuksel/Documents/browser/src/renderer/components/preferences-modal.ts`
  Settings shell içeriği, section helper’ları, daha sakin subsection grupları.
- `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/preferences.css`
  Settings menü scroll davranışı, content density, subsection shells, kısa ekran responsive kuralları.
- `/Users/batuhanyuksel/Documents/browser/src/renderer/i18n.ts`
  Settings + shell chrome için eksik TR/EN string kapsaması.
- `/Users/batuhanyuksel/Documents/browser/src/renderer/i18n.contract.test.ts`
  Dil bütünlüğü kontratı.
- `/Users/batuhanyuksel/Documents/browser/src/renderer/components/preferences-modal.contract.test.ts`
  Settings shell contract testi.
- `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/sidebar.css`
  Sidebar hover/active/collapsed polish.
- `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/sidebar.contract.test.ts`
  Sidebar style contract.
- `/Users/batuhanyuksel/Documents/browser/src/renderer/components/tab-bar.ts`
  Gerekirse küçük state helper / chrome slot wiring düzeltmeleri.
- `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/tabs.css`
  Top bar, tabs, update/session control polish.
- `/Users/batuhanyuksel/Documents/browser/src/renderer/components/tab-bar-cli-surface.contract.test.ts`
  CLI surface tab + top deck consistency contract.
- `/Users/batuhanyuksel/Documents/browser/src/renderer/components/context-inspector.ts`
  Right rail reopen affordance state senkronizasyonu.
- `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/context-inspector.css`
  Right rail reopen + ops rail chrome polish.
- `/Users/batuhanyuksel/Documents/browser/src/renderer/components/context-inspector-reopen.contract.test.ts`
  Reopen control contract.
- `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/browser-tab.css`
  Browser toolbar cluster spacing, hover stabilization, responsive cleanup.
- `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/terminal.css`
  Terminal/browser pane chrome dengelemesi.
- `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/tab-bar-responsive.contract.test.ts`
  Dar alan contract doğrulamaları.
- `/Users/batuhanyuksel/Documents/browser/src/renderer/components/split-layout.test.ts`
  Layout iskeletinin korunması.

## Task 1: Lock Settings + Locale Regression Contracts

**Files:**
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/preferences-modal.contract.test.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/i18n.contract.test.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/preferences.css`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/i18n.ts`

- [ ] **Step 1: Write the failing settings/i18n contract**

```ts
// src/renderer/components/preferences-modal.contract.test.ts
it('keeps the settings rail scrollable and anchored on short viewports', () => {
  expect(styles).toContain('.preferences-menu {');
  expect(styles).toContain('overflow-y: auto;');
  expect(styles).toContain('overscroll-behavior: contain;');
  expect(styles).not.toContain('transform: translateX(1px);');
});
```

```ts
// src/renderer/i18n.contract.test.ts
it('covers settings shell subgroup copy in Turkish', () => {
  expect(source).toContain("['Provider health', 'Sağlayıcı durumu']");
  expect(source).toContain("['Orchestration phases', 'Orkestrasyon fazları']");
  expect(source).toContain("['Tracking & fixes', 'İzleme ve düzeltmeler']");
  expect(source).toContain("['Installed tools, defaults, and repair actions.', 'Yüklü araçlar, varsayılanlar ve onarım eylemleri.']");
});
```

- [ ] **Step 2: Run the new contracts to verify they fail**

Run:

```bash
npm test -- src/renderer/components/preferences-modal.contract.test.ts src/renderer/i18n.contract.test.ts
```

Expected: FAIL because the settings menu is not independently scrollable yet, the active item still uses `translateX(1px)`, and the new Turkish strings are missing.

- [ ] **Step 3: Write the minimal implementation**

```css
/* src/renderer/styles/preferences.css */
.preferences-menu {
  overflow-y: auto;
  overscroll-behavior: contain;
  padding-right: 10px;
}

.preferences-menu-item.active {
  transform: none;
}
```

```ts
// src/renderer/i18n.ts
['Provider health', 'Sağlayıcı durumu'],
['Orchestration phases', 'Orkestrasyon fazları'],
['Tracking & fixes', 'İzleme ve düzeltmeler'],
['Installed tools, defaults, and repair actions.', 'Yüklü araçlar, varsayılanlar ve onarım eylemleri.'],
```

- [ ] **Step 4: Re-run the contracts and make sure they pass**

Run:

```bash
npm test -- src/renderer/components/preferences-modal.contract.test.ts src/renderer/i18n.contract.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/preferences-modal.contract.test.ts src/renderer/i18n.contract.test.ts src/renderer/styles/preferences.css src/renderer/i18n.ts
git commit -m "test(renderer): lock settings scroll and locale shell contracts"
```

## Task 2: Refactor Settings Into Calmer Subsection Shells

**Files:**
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/preferences-modal.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/preferences.css`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/preferences-modal.contract.test.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/i18n.ts`

- [ ] **Step 1: Write the failing subsection-shell contract**

```ts
// src/renderer/components/preferences-modal.contract.test.ts
it('groups dense settings content into subsection shells instead of one flat stack', () => {
  expect(source).toContain('function appendSectionGroup');
  expect(source).toContain('preferences-subsection');
  expect(source).toContain('Provider health');
  expect(source).toContain('Orchestration phases');
  expect(source).toContain('Tracking & fixes');
  expect(styles).toContain('.preferences-subsection');
  expect(styles).toContain('.preferences-subsection-grid');
});
```

- [ ] **Step 2: Run the settings contract and verify it fails**

Run:

```bash
npm test -- src/renderer/components/preferences-modal.contract.test.ts
```

Expected: FAIL because the helper, subgroup labels, and subsection classes do not exist yet.

- [ ] **Step 3: Write the minimal implementation**

```ts
// src/renderer/components/preferences-modal.ts
function appendSectionGroup(
  container: HTMLElement,
  eyebrow: string,
  title: string,
  description: string,
): HTMLElement {
  const group = document.createElement('section');
  group.className = 'preferences-subsection';
  group.innerHTML = `
    <div class="preferences-subsection-header">
      <div class="preferences-subsection-eyebrow shell-kicker">${eyebrow}</div>
      <div class="preferences-subsection-title">${title}</div>
      <div class="preferences-subsection-description">${description}</div>
    </div>
  `;
  container.appendChild(group);
  return group;
}
```

```ts
// inside the providers section in src/renderer/components/preferences-modal.ts
const providerHealthGroup = appendSectionGroup(
  section,
  'Integrations',
  'Provider health',
  'Installed tools, defaults, and repair actions.',
);

const orchestrationGroup = appendSectionGroup(
  section,
  'Project flow',
  'Orchestration phases',
  'Context, previews, reviews, checkpoints, and workflow health in calmer groups.',
);

const trackingGroup = appendSectionGroup(
  section,
  'Diagnostics',
  'Tracking & fixes',
  'Validation, install health, and direct repair actions.',
);
```

```css
/* src/renderer/styles/preferences.css */
.preferences-subsection {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px 16px 15px;
  border: 1px solid color-mix(in srgb, var(--border-subtle) 88%, transparent);
  border-radius: 18px;
  background: color-mix(in srgb, var(--surface-muted) 54%, transparent);
}

.preferences-subsection-grid {
  display: grid;
  gap: 12px;
}
```

- [ ] **Step 4: Re-run the settings contracts**

Run:

```bash
npm test -- src/renderer/components/preferences-modal.contract.test.ts src/renderer/components/project-orchestration-overview-preferences.contract.test.ts src/renderer/components/project-preview-preferences.contract.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/preferences-modal.ts src/renderer/styles/preferences.css src/renderer/components/preferences-modal.contract.test.ts src/renderer/i18n.ts
git commit -m "feat(renderer): group settings content into calmer shells"
```

## Task 3: Lock Shell Chrome Stability Contracts

**Files:**
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/sidebar.contract.test.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/tab-bar-cli-surface.contract.test.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/context-inspector-reopen.contract.test.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/tab-bar-responsive.contract.test.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/sidebar.css`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/tabs.css`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/context-inspector.css`

- [ ] **Step 1: Write the failing shell-stability contracts**

```ts
// src/renderer/styles/sidebar.contract.test.ts
it('prefers anchored emphasis over hover lift in the project rail', () => {
  expect(sidebarCss).toContain('.project-item:hover');
  expect(sidebarCss).toContain('transform: none;');
  expect(sidebarCss).toContain('box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);');
});
```

```ts
// src/renderer/components/tab-bar-cli-surface.contract.test.ts
it('keeps session actions and surface controls in one steady control family', () => {
  expect(tabsCss).toContain('.tab-item.active');
  expect(tabsCss).toContain('.tab-item:hover');
  expect(tabsCss).toContain('transform: none;');
  expect(tabsCss).toContain('.tab-action-secondary');
});
```

```ts
// src/renderer/components/context-inspector-reopen.contract.test.ts
it('keeps the reopen control visible and state-synchronised with the right rail', () => {
  expect(source).toContain('syncInspectorOpenState');
  expect(styles).toContain('.context-inspector-reopen');
  expect(styles).toContain('opacity: 0.96;');
});
```

- [ ] **Step 2: Run the shell contracts and verify they fail**

Run:

```bash
npm test -- src/renderer/styles/sidebar.contract.test.ts src/renderer/components/tab-bar-cli-surface.contract.test.ts src/renderer/components/context-inspector-reopen.contract.test.ts src/renderer/styles/tab-bar-responsive.contract.test.ts
```

Expected: FAIL because sidebar/tabs still use lift transforms and the right rail reopen helper does not exist.

- [ ] **Step 3: Write the minimal implementation**

```css
/* src/renderer/styles/sidebar.css */
.project-item:hover {
  transform: none;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
}
```

```css
/* src/renderer/styles/tabs.css */
.tab-item:hover,
.tab-item.active {
  transform: none;
}
```

```ts
// src/renderer/components/context-inspector.ts
function syncInspectorOpenState(): void {
  const hideOpenButton = inspectorOpen || !appState.activeProject;
  openBtn?.classList.toggle('hidden', hideOpenButton);
  openBtn?.toggleAttribute('hidden', hideOpenButton);
  openBtn?.setAttribute('aria-hidden', hideOpenButton ? 'true' : 'false');
}
```

```css
/* src/renderer/styles/context-inspector.css */
.context-inspector-reopen {
  opacity: 0.96;
}
```

- [ ] **Step 4: Re-run the shell contracts**

Run:

```bash
npm test -- src/renderer/styles/sidebar.contract.test.ts src/renderer/components/tab-bar-cli-surface.contract.test.ts src/renderer/components/context-inspector-reopen.contract.test.ts src/renderer/styles/tab-bar-responsive.contract.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/styles/sidebar.contract.test.ts src/renderer/components/tab-bar-cli-surface.contract.test.ts src/renderer/components/context-inspector-reopen.contract.test.ts src/renderer/styles/tab-bar-responsive.contract.test.ts src/renderer/styles/sidebar.css src/renderer/styles/tabs.css src/renderer/components/context-inspector.ts src/renderer/styles/context-inspector.css
git commit -m "test(renderer): lock stable shell chrome behavior"
```

## Task 4: Implement Sidebar, Tab Bar, Surface, and Right Rail Polish

**Files:**
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/sidebar.css`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/tabs.css`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/browser-tab.css`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/terminal.css`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/context-inspector.css`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/context-inspector.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/tab-bar.ts`

- [ ] **Step 1: Write the failing surface-polish contract**

```ts
// src/renderer/components/tab-bar-cli-surface.contract.test.ts
it('styles the top deck like one polished control rail', () => {
  expect(tabsCss).toContain('.tab-bar-meta');
  expect(tabsCss).toContain('.surface-mode-switcher');
  expect(tabsCss).toContain('.surface-profile-group');
  expect(tabsCss).toContain('height: 34px;');
});
```

```ts
// src/renderer/styles/sidebar.contract.test.ts
it('treats sidebar actions and rows like one authored rail system', () => {
  expect(sidebarCss).toContain('.sidebar-header-actions');
  expect(sidebarCss).toContain('.project-item.active');
  expect(sidebarCss).toContain('border-radius: 14px;');
});
```

- [ ] **Step 2: Run the targeted renderer contracts and verify they fail**

Run:

```bash
npm test -- src/renderer/components/tab-bar-cli-surface.contract.test.ts src/renderer/styles/sidebar.contract.test.ts src/renderer/components/context-inspector-reopen.contract.test.ts
```

Expected: FAIL because the refined control-rail spacing and calmer shell chrome are not fully implemented yet.

- [ ] **Step 3: Write the minimal implementation**

```css
/* src/renderer/styles/tabs.css */
.tab-item {
  min-height: 35px;
  border-radius: 12px;
}

.tab-bar-meta .tab-action-secondary,
.tab-bar-meta .tab-action-primary,
.surface-mode-button,
.surface-profile-group .custom-select-trigger {
  height: 34px;
}
```

```css
/* src/renderer/styles/browser-tab.css */
.browser-toolbar-nav-shell:hover,
.browser-toolbar-address-shell:hover,
.browser-toolbar-tools-shell:hover {
  transform: none;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.03),
    0 12px 24px rgba(0, 0, 0, 0.09);
}

.browser-toolbar-cluster {
  gap: 10px;
  padding: 10px 12px;
}
```

```css
/* src/renderer/styles/terminal.css */
.terminal-pane-chrome {
  min-height: 40px;
  padding: 0 14px;
}
```

```css
/* src/renderer/styles/context-inspector.css */
.context-inspector-reopen:hover,
.context-inspector-reopen:focus {
  transform: none;
}
```

- [ ] **Step 4: Re-run layout and shell tests**

Run:

```bash
npm test -- src/renderer/components/tab-bar-cli-surface.contract.test.ts src/renderer/components/tab-bar-command-deck.test.ts src/renderer/components/tab-bar-single-layout.test.ts src/renderer/components/context-inspector-reopen.contract.test.ts src/renderer/styles/sidebar.contract.test.ts src/renderer/components/split-layout.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/styles/sidebar.css src/renderer/styles/tabs.css src/renderer/styles/browser-tab.css src/renderer/styles/terminal.css src/renderer/styles/context-inspector.css src/renderer/components/context-inspector.ts src/renderer/components/tab-bar.ts src/renderer/components/tab-bar-cli-surface.contract.test.ts src/renderer/styles/sidebar.contract.test.ts
git commit -m "feat(renderer): polish shell chrome consistency"
```

## Task 5: Responsive Tightening + Final Verification

**Files:**
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/preferences.css`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/tabs.css`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/browser-tab.css`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/tab-bar-responsive.contract.test.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/split-layout.test.ts`

- [ ] **Step 1: Write the failing responsive contract**

```ts
// src/renderer/styles/tab-bar-responsive.contract.test.ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const tabsCss = readFileSync(new URL('./tabs.css', import.meta.url), 'utf-8');
const browserCss = readFileSync(new URL('./browser-tab.css', import.meta.url), 'utf-8');
const preferencesCss = readFileSync(new URL('./preferences.css', import.meta.url), 'utf-8');

describe('tab bar responsive contract', () => {
  it('keeps shell controls readable on constrained width and height', () => {
    expect(tabsCss).toContain('@container workspace-stack');
    expect(browserCss).toContain('@container workspace-stack');
    expect(preferencesCss).toContain('@media (max-height: 860px)');
  });
});
```

- [ ] **Step 2: Run the responsive contract and verify it fails**

Run:

```bash
npm test -- src/renderer/styles/tab-bar-responsive.contract.test.ts src/renderer/components/split-layout.test.ts
```

Expected: FAIL because the new constrained-height/width rules are not all present yet.

- [ ] **Step 3: Write the minimal implementation**

```css
/* src/renderer/styles/preferences.css */
@media (max-height: 860px) {
  .preferences-layout {
    min-height: 0;
  }

  .preferences-menu {
    max-height: 100%;
  }
}
```

```css
/* src/renderer/styles/tabs.css */
@container workspace-stack (max-width: 1180px) {
  #tab-bar {
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
      "main actions"
      "meta actions";
    height: auto;
    min-height: 0;
  }
}
```

```css
/* src/renderer/styles/browser-tab.css */
@container workspace-stack (max-width: 1180px) {
  .browser-toolbar-primary {
    min-width: 100%;
  }

  .browser-toolbar-tools {
    width: 100%;
  }
}
```

- [ ] **Step 4: Run the full regression matrix**

Run:

```bash
npm test -- src/renderer/components/preferences-modal.contract.test.ts src/renderer/i18n.contract.test.ts src/renderer/components/tab-bar-cli-surface.contract.test.ts src/renderer/components/tab-bar-command-deck.test.ts src/renderer/components/tab-bar-single-layout.test.ts src/renderer/components/context-inspector-reopen.contract.test.ts src/renderer/styles/sidebar.contract.test.ts src/renderer/styles/tab-bar-responsive.contract.test.ts src/renderer/components/split-layout.test.ts
npx tsc -p tsconfig.main.json
npx tsc -p tsconfig.preload.json
npm run build:renderer
```

Expected: All PASS. If any fail, fix only the failing contract/build issue before moving on.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/styles/preferences.css src/renderer/styles/tabs.css src/renderer/styles/browser-tab.css src/renderer/styles/tab-bar-responsive.contract.test.ts src/renderer/components/split-layout.test.ts
git commit -m "feat(renderer): tighten responsive shell consistency"
```

## Self-Review Checklist

- Spec coverage:
  - settings cleanup -> Task 1 + Task 2
  - locale completeness -> Task 1 + Task 2
  - sidebar/top bar/tab/right rail/surface polish -> Task 3 + Task 4
  - constrained-size behavior -> Task 5
  - protected workflow preservation -> all tasks use contract-first incremental edits
- Placeholder scan:
  - no unresolved placeholder markers or vague implementation instructions remain
- Type consistency:
  - helper name `appendSectionGroup` is introduced only once and reused consistently
  - right rail state helper is consistently named `syncInspectorOpenState`
