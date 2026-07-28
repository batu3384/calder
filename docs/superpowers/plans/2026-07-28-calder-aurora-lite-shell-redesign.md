# Calder Aurora Lite Shell Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quiet the Calder Electron shell to Aurora Lite — one teal accent, no warm/rose ambient chrome, preserve IA.

**Architecture:** CSS-only visual pass. Primary levers are `theme-aurora.css` and last-loaded `theme-command-studio.css`. Update CSS contract tests that pin old “premium glow” strings. No layout/HTML rewrites.

**Tech Stack:** Vanilla CSS tokens (`base.css`), Electron renderer stylesheets, Vitest contract tests.

## Global Constraints

- Direction B from `docs/superpowers/specs/2026-07-28-calder-aurora-lite-shell-redesign-design.md`
- Decorative accent count in chrome = 1 (teal / `--accent-aurora`)
- No layout/IA changes
- Semantic success/warning/danger/git colors stay
- Do not edit `docs/archive/ui-backups/`
- Prefer smallest CSS diffs that kill dual-blob + brass ambient

## File map

| File                                           | Role                                                                  |
| ---------------------------------------------- | --------------------------------------------------------------------- |
| `src/renderer/styles/theme-aurora.css`         | Strip dual glows, warm ambient, drift animation on shell              |
| `src/renderer/styles/theme-command-studio.css` | Last layer: kill brass dual-wash, halo spam; keep structure           |
| `src/renderer/styles/base.css`                 | Optional: comment/deprecate warm as decorative; keep token for compat |
| `src/renderer/styles/primitives.css`           | Quiet button shadows if still noisy                                   |
| `src/renderer/styles/theme-contract.test.ts`   | Update pinned aurora/studio expectations for Lite                     |
| Other `*.contract.test.ts`                     | Only if assertions break                                              |

---

### Task 1: Aurora shell ambient Lite

**Files:**

- Modify: `src/renderer/styles/theme-aurora.css` (header tokens + `html`/`#app`/`#app::before` + drift keyframes usage)
- Test: `src/renderer/styles/theme-contract.test.ts`

- [ ] **Step 1:** Replace `--aurora-glow-rose` / warm gold ambient usages in `:root` gradients with teal-only or transparent.
- [ ] **Step 2:** Simplify `html`, `#app`, `#app::before` backgrounds to canvas + single teal wash ≤ ~6% opacity.
- [ ] **Step 3:** Disable or neutralize `calder-aurora-drift` animation on shell (prefer `animation: none` on animated shell layers).
- [ ] **Step 4:** Soften `--aurora-panel-gradient` / `--aurora-card-gradient` / `--aurora-active-gradient` to remove warm second stop.
- [ ] **Step 5:** Run `rtk npx vitest run src/renderer/styles/theme-contract.test.ts` — update assertions that require old warm/glow copy while keeping structural token checks.

---

### Task 2: Command Studio last-layer Lite

**Files:**

- Modify: `src/renderer/styles/theme-command-studio.css` (top `:root` + `#app` overrides + focus halo intensity)
- Test: `src/renderer/styles/theme-contract.test.ts`

- [ ] **Step 1:** Stop mapping `--accent-warm` to brass for chrome; map to muted teal or leave unused.
- [ ] **Step 2:** Remove brass radial from `#app` / body / sidebar brand ambient dual-washes; teal-only or flat.
- [ ] **Step 3:** Reduce `--studio-focus-halo` / `--studio-resonance-glow` intensity; no multi-color glow stacks on everyday chrome.
- [ ] **Step 4:** Keep required contract markers that describe passes if still accurate, or update test strings to “Aurora Lite restraint pass”.
- [ ] **Step 5:** Re-run theme contract tests.

---

### Task 3: Primitives + chrome spot fixes

**Files:**

- Modify: `src/renderer/styles/primitives.css` (if button shadows still warm/heavy)
- Modify: `src/renderer/styles/tabs.css` / `sidebar.css` only if leftover hard-coded warm colors remain after Tasks 1–2
- Test: related contract tests if any

- [ ] **Step 1:** Grep for `213, 169, 79` / `accent-warm` / brass hex in renderer styles; fix stragglers in chrome paths.
- [ ] **Step 2:** Ensure active tab / focus use `--accent-soft` / `--accent` only.
- [ ] **Step 3:** Run `rtk npx vitest run src/renderer/styles`

---

### Task 4: Verify gates + visual smoke

- [ ] **Step 1:** `rtk npm run lint` (touched paths) and `rtk npm run format:check`
- [ ] **Step 2:** `rtk npm run build`
- [ ] **Step 3:** Launch app (`rtk npm start` or electron) and smoke: sidebar, tabs, inspector, git, preferences
- [ ] **Step 4:** Mark spec acceptance checkboxes mentally; note any follow-ups

---

## Done when

- No warm/rose dual ambient on `#app`
- Teal remains the only decorative accent
- Theme contract tests green
- Build passes
- Shell looks calmer without layout change
