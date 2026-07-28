# Calder Aurora Lite — Shell Visual Redesign

**Date:** 2026-07-28  
**Status:** Draft for review (user approved direction B in chat)  
**Mode:** Redesign — preserve IA / layout; overhaul visual layer only  
**Direction:** **B — Aurora sade** (keep Calder teal/cyan identity; cut decorative excess)

---

## 1. Problem

Current shell (`base.css` tokens + `theme-aurora.css` overlay) reads busy and cheap:

- Multiple decorative accents (teal + warm gold + rose + cool cyan) compete
- Heavy radial blobs, dual glows, frosted glass on chrome that should stay quiet
- Inconsistent elevation (shadow + gradient + inset highlight on the same control)

Product is an Electron IDE/cockpit. Users stare for hours. Visual noise hurts trust more than it adds “premium.”

## 2. Goals

1. Keep **Calder brand signal** (teal/cyan accent family, dark cockpit).
2. Make UI feel **professional and calm** (Cursor/Linear quietness without abandoning Aurora identity).
3. Preserve **layout, IA, features, preference themes** (no sidebar move, no mosaic rewrite).
4. One accent rule: decorative UI uses **one** accent; semantic colors stay for status/git only.

## 3. Non-goals

- Layout rearchitecture (sidebar placement, ops rail structure, mosaic)
- New component library / Tailwind migration
- Landing-page motion, GSAP, marquees
- Redesigning Evidence/Pixel product behavior (only theme token alignment)
- Shipping a new light-mode brand (existing light tokens may get token cleanup only)

## 4. Design dials

| Dial     | Value | Rationale                                       |
| -------- | ----- | ----------------------------------------------- |
| Variance | 4     | Preserve shell symmetry; product UI             |
| Motion   | 3     | Existing `--motion-*` only; no new choreography |
| Density  | 6     | Cockpit density stays                           |

## 5. Visual system

### 5.1 Color

**Keep**

- Primary accent: `--accent-aurora` / `--accent` (teal family)
- Surfaces: `--surface-canvas`, `--surface-panel`, `--surface-elevated`, etc.
- Semantic: `--success`, `--warning`, `--danger`, `--info`, git status colors

**Retire from chrome decoration**

- Warm gold radial / sheen as ambient background (`accent-warm` as page glow)
- Rose decorative glows on shell
- Second competing “cool cyan blob” alongside teal on the same surface
- Multi-accent gradients on tabs, sidebar rows, cards

**Rules**

1. Decorative accent count in shell chrome = **1** (teal).
2. Semantic colors appear only where they encode state (git, toast type, status badge).
3. Gray family stays cool (slate); do not mix warm beige neutrals into shell.

### 5.2 Surfaces

| Surface                      | Target                                                                                         |
| ---------------------------- | ---------------------------------------------------------------------------------------------- |
| `html` / `#app`              | Flat or single subtle top sheen; **no dual radial blobs**                                      |
| Sidebar / tab bar / ops rail | Solid surface + hairline border; optional 1px inset highlight only                             |
| Panels / cards               | Prefer `surface-panel` / `surface-elevated`; drop heavy `aurora-panel-gradient` where possible |
| Modals / overlays            | May keep light frost **only** on overlay; chrome underneath stays solid                        |
| Buttons                      | One control gradient max, or flat; no glow shadow                                              |

### 5.3 Typography

- Keep existing stacks: IBM Plex Sans + JetBrains Mono (no Inter-as-brand swap required for Lite).
- Tighten hierarchy via tokens already present (`--type-*`, `--text-primary|secondary|muted|dim`).
- Avoid new all-caps eyebrow spam in chrome; no new decorative micro-labels.

### 5.4 Shape & elevation

- Radius: controls `--radius-sm`; panels `--radius-md`; large sheets `--radius-lg`. Do not invent new radii.
- Shadows: prefer border separation over large soft shadows; reduce `--shadow-elevated` usage on everyday chrome.
- Focus: keep `--border-focus` / `--shadow-focus-ring` accent-tinted; no neon outer glow.

### 5.5 Motion

- Keep `--motion-fast` / `--motion-normal` / `--ease-standard`.
- No new scroll hijack, ambient blob animation, or magnetic physics.
- Honor `prefers-reduced-motion` where new CSS animations would be added (prefer none in Lite).

## 6. File ownership

| File                                                                   | Change                                                                                                                            |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `src/renderer/styles/base.css`                                         | Token cleanup: deprecate unused decorative aliases; ensure single accent path                                                     |
| `src/renderer/styles/theme-aurora.css`                                 | **Primary work**: strip dual glows, warm ambient, heavy panel gradients; leave thin brand sheen                                   |
| `src/renderer/styles/theme-command-studio.css`                         | **Also primary**: many “premium / studio / glow / halo” overrides load last — Lite must quiet this layer or gains get overwritten |
| `src/renderer/styles/primitives.css`                                   | Align buttons/rows to Lite surface rules                                                                                          |
| `src/renderer/styles/sidebar.css`                                      | Remove leftover multi-accent chrome if present                                                                                    |
| `src/renderer/styles/tabs.css`                                         | Active tab = teal soft, not multi-glow                                                                                            |
| `src/renderer/styles/session-inspector.css`                            | Match Lite panels                                                                                                                 |
| `src/renderer/styles/git-panel.css`                                    | Quiet chrome; keep semantic git colors                                                                                            |
| `src/renderer/styles/modals.css` / `dialogs.css` / `ui-components.css` | Overlay discipline                                                                                                                |
| Contract tests under `src/renderer/styles/*contract*`                  | Update expectations if they assert aurora gradient strings                                                                        |

Do **not** edit archived backups under `docs/archive/ui-backups/`.

## 7. Implementation phases

### Phase 1 — Tokens + Aurora overlay (highest leverage)

1. Inventory hard-coded warm/rose/gold decorations in `theme-aurora.css`.
2. Replace `#app` / `html` backgrounds with quiet canvas + optional single teal wash ≤ ~6% opacity.
3. Collapse panel/card/control gradients to solid or single-sheen variants.
4. Verify theme preference (light/system) still resolves.

**Verify:** visual smoke on shell; `theme-contract` / related CSS contract tests.

### Phase 2 — Chrome components

1. Sidebar, tabs, primitives, toast, git panel, session inspector.
2. Ensure hover/focus use `--accent-soft` / `--accent-ghost` only.
3. Kill neon box-shadows on interactive chrome.

**Verify:** click through project switch, tabs, inspector, git, preferences modal.

### Phase 3 — Polish + regression

1. Update CSS contract tests that pin old aurora strings.
2. Lint / format / build.
3. Optional: short before/after note in `docs/superpowers/reports/` (only if useful; not required for ship).

## 8. Acceptance criteria

- [ ] Shell chrome uses **one** decorative accent (teal); no warm/rose ambient on `#app`
- [ ] Sidebar, tabs, terminal chrome feel flatter/calmer without losing dark Calder identity
- [ ] Semantic status/git colors still readable (contrast AA for text-on-badge where applicable)
- [ ] Preferences appearance theme still works
- [ ] No layout/IA regressions (same structure, same panels)
- [ ] CSS contract tests updated and green
- [ ] `npm run lint`, `format:check`, `build` pass for touched paths

## 9. Risks

| Risk                                               | Mitigation                                                             |
| -------------------------------------------------- | ---------------------------------------------------------------------- |
| Contract tests assert old aurora gradient snippets | Update tests with Lite expectations, not delete coverage               |
| Over-stripping makes UI “dead”                     | Keep one subtle teal wash + accent soft on active states               |
| Accidental layout churn                            | CSS-only; no HTML structure rewrites unless required for class cleanup |
| Light theme breakage                               | Smoke both appearance modes after token edits                          |

## 10. Open questions (resolved)

- Direction: **B Aurora Lite** (user approved 2026-07-28)
- Out of scope: layout redesign, new DS framework

---

## Spec self-review

- No TBD placeholders for core decisions
- Scope bounded to CSS visual layer
- Conflicts: none with Evidence feature work (theme-only touch)
- Ready for implementation plan after user reviews this file
