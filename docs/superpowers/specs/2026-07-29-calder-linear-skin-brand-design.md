# Calder Linear Skin + Brand Mark Design

**Date:** 2026-07-29  
**Status:** Approved in conversation (color §1, logo §2, preferences §3)  
**Approach:** Full Linear skin (option 2)  
**References:** `awesome-design-md/design-md/linear.app/DESIGN.md`, prior IDE Chrome Reset

## Problem

1. App logo (dock ice/`>_` icon + pixel mascot) reads as indie/game, not professional IDE.
2. Color/chrome still feels cheap: leftover teal identity, card sheen, dense overlapping prefs text.
3. Preferences left nav: absolute `::before` accent bar + tight padding overlaps Turkish labels/captions.

## Goals

- Professional IDE product look (Linear / Warp / Cursor product UI), not marketing landing.
- Single chromatic accent: Linear lavender-blue.
- New geometric brand mark; mascot removed from product UI.
- Preferences: icon + single-line label, no caption, no overlapping indicator.
- Preserve chrome-reset rules: flat surfaces, no ambient gradients/glows.

## Non-goals

- Activity bar / file tree / command palette redesign.
- Full rewrite of preferences section content (fields stay; chrome + nav density change).
- Light theme pixel-perfect parity in first pass (same token hierarchy; polish later if needed).
- Changing product architecture or IPC.

## Decisions (user)

| Topic           | Choice                                        |
| --------------- | --------------------------------------------- |
| Logo direction  | Abstract geometric mark; mascot fully removed |
| Accent          | Linear lavender `#5e6ad2`                     |
| Preferences nav | Icon + single-line label; captions removed    |
| Approach        | Full Linear skin                              |

---

## §1 Color system

| Token                               | Value                      | Role                                        |
| ----------------------------------- | -------------------------- | ------------------------------------------- |
| `--surface-canvas`                  | `#010102`                  | Window ground                               |
| `--surface-panel`                   | `#0f1011`                  | Sidebar, inspector, prefs shell             |
| `--surface-raised`                  | `#141516`                  | Active row, elevated strips                 |
| `--studio-line` / `--border-subtle` | `#23252a`                  | Hairline                                    |
| `--text-primary`                    | `#f7f8f8`                  | Titles / labels                             |
| `--text-secondary`                  | `#d0d6e0`                  | Body                                        |
| `--text-muted`                      | `#8a8f98`                  | Rare secondary copy                         |
| `--accent`                          | `#5e6ad2`                  | Focus, active tab, primary CTA, prefs inset |
| `--accent-soft`                     | `rgba(94, 106, 210, 0.14)` | Hover/active fill                           |
| Success / warning                   | Linear green / amber       | Semantic only                               |

**Rules**

- Accent only on: focus ring, active tab indicator, primary buttons, prefs active inset.
- No cyan/teal (`#66e7df` / `--studio-cyan`) in product chrome.
- No ambient radial/linear washes on shell surfaces.
- Map `--studio-cyan` → `--accent` (lavender) or delete alias; grep-clean remaining teal literals in theme CSS.

**Primary files:** `base.css`, `theme-command-studio.css`, `theme-aurora.css` (de-teal / retoken).

---

## §2 Brand mark

**Mark:** Abstract geometric monogram — two vertical bars + thin horizontal bridge (Linear-inspired, Calder-specific). Flat vector. Color: `#5e6ad2` on dark; dock icon: rounded square `#0f1011` with mark centered.

**Deliverables**

- `src/renderer/assets/brand/mark.svg` — in-app (empty state, About, optional sidebar brand).
- Regenerate `build/icon.png` + `build/icon.icns` from the same mark.
- Remove mascot from empty state and any remaining chrome references (`maskot-ui.png` unused or deleted).

**Empty state:** 48–64px mark + “Calder” wordmark (18px, `--text-primary`) + short copy. No pixel character.

**Sidebar brand row:** 16px mark + “Calder” text (replace text-only or keep status “Workspace”).

---

## §3 Preferences + density

**Left nav**

- Caption nodes not rendered (or CSS `display: none` only if markup must stay temporarily — prefer stop rendering).
- Icon 16px + single label row.
- `min-height: 32–36px`; `padding: 6px 10px 6px 12px`.
- Active: `box-shadow: inset 2px 0 0 var(--accent)` + `--accent-soft` fill.
- Delete `.preferences-menu-item::before` absolute bar (root cause of overlap).
- No card border/gradient on menu items.

**Content pane**

- Section title 13px/600; description 12px muted; gaps 8–12px.
- Toggle/field rows: hairline bottom border, ~40px height.
- Overview cards: `border-radius: 8px`, single hairline, padding 12px.

**Also fix:** broken/over-coupled CSS cascade in `theme-command-studio.css` / `preferences.css` where studio overrides shrink padding to `7px 10px` while base still paints `::before` at `left: 8px`.

---

## Success criteria

1. Dock icon and empty state show geometric mark; no mascot in UI.
2. No teal accent in shell; accent reads lavender.
3. Preferences left nav: no overlapping line on labels; captions gone; denser rows.
4. `npm test` + `npm run build` + visual check of prefs + empty state + dock icon.
5. Contract tests updated for brand/mark and prefs nav structure.

## Risks

- `icon.icns` regeneration needs macOS `iconutil` or existing project script — use repo’s established icon pipeline if present.
- Wide teal token usage may miss spots — require `rg` audit for `#66e7df` / `studio-cyan` / `102, 231, 223`.
- Removing captions changes a11y — ensure menu item `aria-label` still describes section.

## Out of scope follow-ups

- Activity bar / explorer archetype.
- Full preferences content IA rewrite.
- Marketing site / website brand.
