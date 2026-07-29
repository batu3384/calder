# Calder Linear Skin + Brand Mark Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Linear-inspired dark skin (lavender accent), a geometric brand mark (dock + in-app), and a prefs nav that no longer overlaps text.

**Architecture:** Retoken `base.css` + theme overrides to Linear surfaces/accent; replace mascot with SVG mark in empty state/sidebar/About; rewrite prefs menu markup (icon + single label) and kill the absolute `::before` indicator; regenerate `build/icon.png` + `icon.icns` from the SVG.

**Tech Stack:** Electron renderer CSS/HTML/TS, Vitest contract tests, macOS `sips` + `iconutil` for icns.

**Spec:** `docs/superpowers/specs/2026-07-29-calder-linear-skin-brand-design.md`

## Global Constraints

- Accent is exactly `#5e6ad2`; no product chrome teal (`#66e7df` / `rgb(102, 231, 223)` / `--studio-cyan` as cyan).
- Flat surfaces only — no ambient radial/linear washes on shell.
- Preferences captions must not render; active indicator must be `inset box-shadow`, never absolute `::before` bar.
- Mascot must not appear in UI (empty state / sidebar / About).
- Do not redesign activity bar / explorer / prefs field IA.
- Shell commands start with `rtk `; user-facing explanations in Turkish; code/commits normal English.
- Commit after each task when executing.

## File map

| File                                                                                                         | Role                                                    |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| `src/renderer/assets/brand/mark.svg`                                                                         | Create — geometric monogram                             |
| `src/renderer/assets/brand/maskot-ui.png`                                                                    | Delete or leave unused after UI stop referencing        |
| `build/icon.png`, `build/icon.icns`                                                                          | Regenerate from mark                                    |
| `src/renderer/styles/base.css`                                                                               | Linear tokens + empty-state mark styles                 |
| `src/renderer/styles/theme-command-studio.css`                                                               | Map cyan→lavender; strip teal literals; prefs overrides |
| `src/renderer/styles/theme-aurora.css`                                                                       | De-teal / align surfaces                                |
| `src/renderer/styles/preferences.css`                                                                        | Nav density + remove `::before` indicator               |
| `src/renderer/styles/sidebar.css`                                                                            | Brand row mark sizing                                   |
| `src/renderer/index.html`                                                                                    | Sidebar brand mark `<img>`/`<svg>`                      |
| `src/renderer/components/split-layout-empty-state.ts`                                                        | Mark instead of mascot                                  |
| `src/renderer/components/preferences/preferences-modal-shell.ts`                                             | Icon + label markup; aria-label from caption            |
| `src/renderer/components/preferences/preferences-modal.ts`                                                   | Keep caption data for aria only (or inline map)         |
| Contract tests under `src/renderer/styles/*.contract.test.ts`, `index-shell.test.ts`, prefs tests if present |

---

### Task 1: Brand mark SVG + contract test

**Files:**

- Create: `src/renderer/assets/brand/mark.svg`
- Create: `src/renderer/styles/brand-mark.contract.test.ts`
- Modify: none yet for empty state (Task 3)

**Interfaces:**

- Produces: `assets/brand/mark.svg` path string used by empty state / sidebar / About as `'assets/brand/mark.svg'`
- Mark geometry: 32×32 viewBox; two vertical bars + thin horizontal bridge; `fill="#5e6ad2"`

- [ ] **Step 1: Write the failing contract test**

```ts
import { existsSync, readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const markPath = new URL('../assets/brand/mark.svg', import.meta.url);

describe('brand mark asset', () => {
  it('ships a lavender geometric SVG mark', () => {
    expect(existsSync(markPath)).toBe(true);
    const svg = readFileSync(markPath, 'utf-8');
    expect(svg).toContain('viewBox="0 0 32 32"');
    expect(svg).toContain('#5e6ad2');
    expect(svg).not.toContain('maskot');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk npx vitest run src/renderer/styles/brand-mark.contract.test.ts`
Expected: FAIL — file missing

- [ ] **Step 3: Write mark.svg**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none">
  <rect x="6" y="6" width="6" height="20" rx="1.5" fill="#5e6ad2"/>
  <rect x="20" y="6" width="6" height="20" rx="1.5" fill="#5e6ad2"/>
  <rect x="12" y="14" width="8" height="4" rx="1" fill="#5e6ad2"/>
</svg>
```

- [ ] **Step 4: Run test — expect PASS**

Run: `rtk npx vitest run src/renderer/styles/brand-mark.contract.test.ts`

- [ ] **Step 5: Commit**

```bash
rtk git add src/renderer/assets/brand/mark.svg src/renderer/styles/brand-mark.contract.test.ts
rtk git commit -m "$(cat <<'EOF'
feat(brand): add geometric lavender mark SVG

EOF
)"
```

---

### Task 2: Linear color tokens (base + studio + aurora)

**Files:**

- Modify: `src/renderer/styles/base.css` (`:root` dark tokens)
- Modify: `src/renderer/styles/theme-command-studio.css` (`--studio-*`, `--accent`, remove `#66e7df` literals)
- Modify: `src/renderer/styles/theme-aurora.css` (align accents / surfaces)
- Modify: `src/renderer/styles/theme-contract.test.ts` (expect lavender / not teal)

**Interfaces:**

- Consumes: spec token table
- Produces: `--accent: #5e6ad2`, `--surface-canvas: #010102`, `--surface-panel: #0f1011`, `--studio-line: #23252a`; `--studio-cyan` either deleted or aliased to `--accent`

- [ ] **Step 1: Write failing theme contract assertions**

In `theme-contract.test.ts` add/adjust:

```ts
expect(baseCss).toContain('--accent:');
expect(baseCss).toMatch(/--accent:\s*#5e6ad2/);
expect(commandStudioCss).not.toContain('#66e7df');
expect(commandStudioCss).not.toContain('102, 231, 223');
```

- [ ] **Step 2: Run — expect FAIL** on old teal values

Run: `rtk npx vitest run src/renderer/styles/theme-contract.test.ts`

- [ ] **Step 3: Update tokens**

In `base.css` dark `:root` set:

```css
--surface-canvas: #010102;
--surface-panel: #0f1011;
--surface-elevated: #141516;
--surface-raised: #141516;
--border-subtle: #23252a;
--text-primary: #f7f8f8;
--text-secondary: #d0d6e0;
--text-muted: #8a8f98;
--accent: #5e6ad2;
--accent-soft: rgba(94, 106, 210, 0.14);
--border-focus: #5e6ad2;
```

In `theme-command-studio.css` `:root` block(s):

```css
--studio-canvas: #010102;
--studio-panel: #0f1011;
--studio-panel-raised: #141516;
--studio-line: #23252a;
--studio-line-soft: rgba(35, 37, 42, 0.8);
--studio-cyan: var(--accent); /* alias only — no teal literal */
--accent: #5e6ad2;
--accent-soft: rgba(94, 106, 210, 0.14);
```

Replace remaining teal rgba literals (`102, 231, 223`) with `94, 106, 210` or `var(--accent)` / `var(--accent-soft)`.

- [ ] **Step 4: Audit**

Run: `rtk rg -n "#66e7df|102, 231, 223" src/renderer/styles`
Expected: 0 matches in product chrome CSS (or only comments)

- [ ] **Step 5: Run theme contract — PASS**

- [ ] **Step 6: Commit**

```bash
rtk git add src/renderer/styles/base.css src/renderer/styles/theme-command-studio.css src/renderer/styles/theme-aurora.css src/renderer/styles/theme-contract.test.ts
rtk git commit -m "$(cat <<'EOF'
style(theme): adopt Linear lavender skin tokens

EOF
)"
```

---

### Task 3: Empty state + sidebar brand — mascot out, mark in

**Files:**

- Modify: `src/renderer/components/split-layout-empty-state.ts`
- Modify: `src/renderer/styles/base.css` (`.empty-state-mascot` → `.empty-state-mark`)
- Modify: `src/renderer/index.html` (sidebar brand row)
- Modify: `src/renderer/styles/sidebar.css` / `theme-command-studio.css` for `.sidebar-brand-mark`
- Modify: `src/renderer/index-shell.test.ts`

**Interfaces:**

- Consumes: `assets/brand/mark.svg`
- Produces: empty-state first child `<img class="empty-state-mark" src="assets/brand/mark.svg" alt="">`; sidebar `<img class="sidebar-brand-mark" …>` before name

- [ ] **Step 1: Update index-shell contract (fail first)**

```ts
expect(html).toContain('class="sidebar-brand-mark"');
expect(html).toContain('assets/brand/mark.svg');
expect(html).not.toContain('maskot-ui.png');
```

- [ ] **Step 2: Run index-shell test — FAIL**

- [ ] **Step 3: Implement empty state**

In `split-layout-empty-state.ts` replace mascot block with:

```ts
const mark = document.createElement('img');
mark.className = 'empty-state-mark';
mark.src = 'assets/brand/mark.svg';
mark.alt = '';
mark.width = 56;
mark.height = 56;
mark.decoding = 'async';
// append mark instead of mascot
```

CSS:

```css
.empty-state-mark {
  width: 56px;
  height: 56px;
  display: block;
  margin: 0 0 var(--space-16, 16px);
}
```

Remove `.empty-state-mascot` rules.

Sidebar `index.html` brand row:

```html
<div id="sidebar-brand-row" class="sidebar-brand-row">
  <img class="sidebar-brand-mark" src="assets/brand/mark.svg" alt="" width="16" height="16" />
  <div class="sidebar-brand-meta">
    <span class="sidebar-brand-name">Calder</span>
    <span class="sidebar-brand-status">Workspace</span>
  </div>
</div>
```

- [ ] **Step 4: Tests PASS** (`index-shell`, any empty-state contracts)

- [ ] **Step 5: Commit**

```bash
rtk git commit -m "$(cat <<'EOF'
feat(brand): replace mascot with geometric mark in shell

EOF
)"
```

---

### Task 4: Preferences nav — icons, no captions, no overlapping bar

**Files:**

- Modify: `src/renderer/components/preferences/preferences-modal-shell.ts`
- Modify: `src/renderer/components/preferences/preferences-modal.ts` (aria source)
- Modify: `src/renderer/styles/preferences.css`
- Modify: `src/renderer/styles/theme-command-studio.css` (prefs menu overrides)
- Create or modify: `src/renderer/components/preferences/preferences-modal-shell.contract.test.ts` (or existing prefs contract)

**Interfaces:**

- Consumes: `sections: { id, label, caption }[]` — caption used only for `aria-label`, not DOM caption span
- Produces: button HTML shape:

```html
<button
  class="preferences-menu-item"
  type="button"
  data-section="…"
  aria-label="Session — Startup, language, and session memory"
>
  <span class="preferences-menu-item-icon" aria-hidden="true"><!-- inline SVG 16x16 --></span>
  <span class="preferences-menu-item-label">Session</span>
</button>
```

- [ ] **Step 1: Failing contract**

```ts
const shellSource = readFileSync(new URL('./preferences-modal-shell.ts', import.meta.url), 'utf-8');
expect(shellSource).not.toContain('preferences-menu-item-caption');
expect(shellSource).toContain('preferences-menu-item-icon');
expect(shellSource).toContain('aria-label');

const prefsCss = readFileSync(new URL('../../styles/preferences.css', import.meta.url), 'utf-8');
expect(prefsCss).not.toContain('.preferences-menu-item::before');
expect(prefsCss).toContain('inset 2px 0 0 var(--accent)');
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Rewrite shell render**

```ts
item.setAttribute('aria-label', `${section.label} — ${section.caption}`);
item.innerHTML = `
  <span class="preferences-menu-item-icon" aria-hidden="true">${iconFor(section.id)}</span>
  <span class="preferences-menu-item-label">${section.label}</span>
`;
```

Provide `iconFor(id)` returning minimal 16×16 inline SVGs (stroke `currentColor`) — one path per section; keep tiny.

Simplify menu header (drop long caption or shorten to one line muted):

```html
<div class="preferences-menu-title">Settings</div>
```

- [ ] **Step 4: CSS**

Delete `.preferences-menu-item::before` and `.active::before` blocks.

```css
.preferences-menu-item {
  min-height: 34px;
  padding: 6px 10px 6px 12px;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  box-shadow: none;
}
.preferences-menu-item.active {
  background: var(--accent-soft);
  box-shadow: inset 2px 0 0 var(--accent);
}
.preferences-menu-item-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  color: var(--text-muted);
}
.preferences-menu-item.active .preferences-menu-item-icon {
  color: var(--accent);
}
.preferences-menu-item-label {
  font-size: 13px;
  font-weight: 500;
}
```

In `theme-command-studio.css`, remove prefs menu overrides that set `padding: 7px 10px` / gradients / `inset 2px` duplicates conflicting with `::before` — single source of truth in `preferences.css`.

Content density:

```css
.preferences-overview-card,
.preferences-section-card,
.preferences-subsection {
  border-radius: 8px;
  padding: 12px;
  background: var(--surface-raised);
  border: 1px solid var(--border-subtle);
  box-shadow: none;
}
```

- [ ] **Step 5: Tests PASS**

- [ ] **Step 6: Commit**

```bash
rtk git commit -m "$(cat <<'EOF'
fix(prefs): densify nav and remove overlapping accent bar

EOF
)"
```

---

### Task 5: Dock icon regeneration (`icon.png` + `icon.icns`)

**Files:**

- Modify: `build/icon.png`
- Modify: `build/icon.icns`
- Optional create: `scripts/generate-app-icon.mjs` (one-shot helper)

**Interfaces:**

- Consumes: `mark.svg`
- Produces: 1024×1024 PNG with `#0f1011` rounded-square background + centered lavender mark; `icon.icns` via `iconutil`

- [ ] **Step 1: Generate master PNG**

Use a small Node script with existing deps if available, or macOS-only pipeline:

```bash
# Rasterize via rsvg-convert or qlmanage; fallback: hand-authored PNG from SVG using:
# 1) Create iconset folder
# 2) sips to resize
mkdir -p /tmp/calder.iconset
# After producing build/icon.png at 1024x1024:
rtk sips -z 16 16     build/icon.png --out /tmp/calder.iconset/icon_16x16.png
rtk sips -z 32 32     build/icon.png --out /tmp/calder.iconset/diana@2x_placeholder.png
# … complete standard iconset sizes …
rtk iconutil -c icns /tmp/calder.iconset -o build/icon.icns
```

Exact iconset names must follow Apple’s list (`icon_16x16.png`, `diana@2x` → `icon_16x16@2x.png`, etc.). Prefer a checked-in `scripts/generate-app-icon.mjs` that writes PNG via `sharp` if already in package.json; otherwise document the sips steps in the commit message and check in binary results.

- [ ] **Step 2: Verify package.json still points at `build/icon.png` / `build/icon.icns`**

- [ ] **Step 3: Visual check** — open Finder Get Info / relaunch Electron; dock shows new mark

- [ ] **Step 4: Commit**

```bash
rtk git add build/icon.png build/icon.icns scripts/generate-app-icon.mjs
rtk git commit -m "$(cat <<'EOF'
chore(brand): regenerate dock icon from geometric mark

EOF
)"
```

---

### Task 6: About section + leftover mascot cleanup

**Files:**

- Modify: About prefs renderer (`preferences-modal-sections-about.ts` or similar) if it embeds mascot/old icon
- Delete unused: `src/renderer/assets/brand/maskot-ui.png` if no remaining refs
- Grep cleanup i18n key `Calder mascot stage` optional (leave string harmless)

- [ ] **Step 1: Audit**

Run: `rtk rg -n "maskot|mascot" src/`
Expected: only historical i18n or none

- [ ] **Step 2: If About shows old art, swap to `mark.svg`**

- [ ] **Step 3: Delete `maskot-ui.png` when refs are zero**

- [ ] **Step 4: Commit**

```bash
rtk git commit -m "$(cat <<'EOF'
chore(brand): drop unused mascot asset

EOF
)"
```

---

### Task 7: Final verification

**Files:** none (verify only); update `scripts/structure-audit-baseline.json` only if line counts trip the gate

- [ ] **Step 1: Full test**

Run: `rtk npm test`  
Expected: all pass

- [ ] **Step 2: Lint + format**

Run: `rtk npm run lint && rtk npm run format:check`

- [ ] **Step 3: Build + Electron visual**

Run: `rtk npm run build` then relaunch Electron. Check: dock icon, empty state mark, prefs nav (no overlap, icons, lavender accent), no teal chrome.

- [ ] **Step 4: Teal audit**

Run: `rtk rg -n "#66e7df|102, 231, 223" src/renderer`
Expected: empty (or documented exceptions only)

- [ ] **Step 5: Final commit if baseline/format fixes needed**

---

## Spec coverage checklist

| Spec requirement            | Task       |
| --------------------------- | ---------- |
| Linear color tokens         | Task 2     |
| No teal chrome              | Task 2 + 7 |
| Geometric mark SVG          | Task 1     |
| Empty state / sidebar mark  | Task 3     |
| Dock icon regenerate        | Task 5     |
| Mascot removed              | Task 3 + 6 |
| Prefs icon + single label   | Task 4     |
| Prefs no `::before` overlap | Task 4     |
| Prefs dense cards           | Task 4     |
| Tests + build + visual      | Task 7     |

## Placeholder scan

No TBD / “implement later” / “similar to Task N” steps remain.
