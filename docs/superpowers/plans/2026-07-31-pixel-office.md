# Pixel Office Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Calder’s DOM Pixel rail with a Canvas 2D Pixel Office pane beside the terminal, driven by Evidence + Claude hooks, with Metro City characters and hard-delete of the old pixel-agent UI.

**Architecture:** Calder-native Canvas office (`pixel-office/*`) beside `#terminal-container`; AgentEvent bridge from Evidence/hooks; Context Inspector Pixel tab removed.

**Tech Stack:** Electron renderer TypeScript, Canvas 2D, existing Evidence IPC, Vitest contracts.

**Spec:** `docs/superpowers/specs/2026-07-31-pixel-office-design.md`

## Global Constraints

- No React/Pixi/XState; no embedding pixel-agents SPA.
- Modules ≤500 lines; hard-delete old `pixel-agent` (no deprecate).
- Shell commands via `rtk`; user-facing docs Turkish when needed; code English.
- Metro City assets only after license note in `THIRD_PARTY_NOTICES`.

---

## File map

| Path | Role |
| --- | --- |
| `src/renderer/index.html` | `#pixel-office` host + resize handle; remove Pixel tab |
| `src/renderer/styles/pixel-office.css` | Pane chrome, canvas sizing |
| `src/renderer/styles.css` | Import pixel-office.css |
| `src/renderer/components/pixel-office/*` | Runtime + mount |
| `src/renderer/components/split-layout*.ts` / chrome CSS | Column for office pane |
| `src/main/menu.ts`, `command-palette.ts` | Toggle Pixel Office |
| `src/shared/types-evidence.ts` | `pixelMode: off \| office` |
| Delete `pixel-agent/**`, `context-pixel-panel.ts`, old assets/CSS |

---

### Task M1: Shell pane + remove Pixel tab

**Goal:** Empty `#pixel-office` pane toggleable beside terminal; Denetçi Pixel tab gone.

- [ ] **Step 1: Contract test** — assert `index.html` has `id="pixel-office"` and lacks `context-inspector-tab-pixel`.
- [ ] **Step 2: HTML** — add office host + resize handle inside workspace shell; remove Pixel tab/panel/host.
- [ ] **Step 3: CSS** — `pixel-office.css` + workspace grid column when open.
- [ ] **Step 4: Mount stub** — `mount-pixel-office.ts` creates canvas, clear fill, pause when hidden.
- [ ] **Step 5: Wire toggle** — menu `Cmd+Shift+O`, palette, persist preference; remap old Pixel Inspector entries.
- [ ] **Step 6: Context inspector** — drop pixel tab logic; default tab = capabilities/run.
- [ ] **Step 7: Verify** — contracts + `npm test` subset; commit.

### Task M2: Canvas core + Evidence bridge

- [ ] Default layout JSON + seats + pathfinding + character FSM.
- [ ] Load Metro City sprites (after license note).
- [ ] Map open CLI sessions → characters; Evidence events → TYPE/IDLE.
- [ ] Click character focuses session.
- [ ] Tests for AgentEvent mapper + pathfinding.

### Task M3: Polish

- [ ] Speech bubbles, context gauge, sound toggle, hover activity label, sub-agent near parent.

### Task M4: Layout editor

- [ ] Paint/place/undo + persist + import/export.

### Task M5: Claude hook bridge

- [ ] Main provider adapter richer toolStart/End into AgentEvent.

### Task M6: Teardown

- [ ] Delete `pixel-agent/**`, `context-pixel-panel.ts`, old CSS/tests; knip/structure green; update `session-evidence.md`.
