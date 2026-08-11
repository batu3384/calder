# Calder Pixel Office — Design

**Date:** 2026-07-31  
**Status:** Approved (brainstorming)  
**Replaces:** DOM Pixel Studio / Compact / Ecosystem rail and the obsolete Context Inspector Pixel tab

## Decisions

| Topic        | Choice                                                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Ambition     | Full office parity with [pixel-agents](https://github.com/pixel-agents-hq/pixel-agents) (Canvas 2D office, not CSS boxes) |
| Placement    | Right Context Inspector rail (`#pixel-office`), alongside Run / Project / Timeline context                                |
| Assets       | Metro City character pack + Calder-owned floor/wall/furniture                                                             |
| V1 scope     | Full parity target: core + editor + bubbles + gauge + sub-agents + sound                                                  |
| Data         | Evidence IPC + provider hook/transcript bridge (Claude first)                                                             |
| Architecture | Calder-native Canvas office (no embed/fork of pixel-agents SPA)                                                           |
| Old system   | Remove old DOM Pixel surfaces; retain sanitized Evidence resolver as the office data adapter                              |

## Product goal

Each open CLI session appears as an animated pixel character in a shared office. Characters walk to seats, type/read based on live agent activity, show speech bubbles when waiting/done, and can be selected to focus the matching terminal. Sub-agents appear near their parent. Layout is editable and persisted.

## Non-goals (this epic)

- Shipping pixel-agents as a dependency or iframe
- React / PixiJS / XState in Calder renderer
- Full Claude Agent Teams teammate seating (named teammates = follow-up after Claude hook bridge)
- SaaS / remote office sync

## Shell & layout

- `#pixel-office` pane inside the right Context Inspector rail, resize handle, height 140–480px.
- Toggle: menu + command palette `Toggle Pixel Office` (`Cmd+Shift+O`); persist open state.
- Context Inspector keeps Run / Project / Timeline. **Pixel tab removed**; deep-links open Pixel Office instead.
- Click character → `appState.setActiveSession` + terminal focus.
- Canvas companion DOM → provider, verified activity/status, context gauge, event age, and live connection state.
- Keyboard resize → Arrow keys adjust height; Home/End select limits. Reduced motion disables wandering and frame animation.
- Narrow rail: status summary stays readable; canvas uses contain zoom and never clips the map.

## Runtime (Canvas)

Vanilla TypeScript + Canvas 2D (`imageSmoothingEnabled = false`).

```
src/renderer/components/pixel-office/
  mount-pixel-office.ts
  game-loop.ts
  renderer.ts
  characters.ts          # IDLE | WALK | DESK (workPose: rest/type/read/browse/build/think)
  office-state.ts
  pathfinding.ts         # BFS
  layout.ts
  layout-editor.ts
  sprites.ts
  bubbles.ts
  sound.ts
  hit-test.ts
  agent-event.ts         # Evidence/hook → AgentEvent
```

Character contract (pixel-agents vocabulary):

| Agent status                   | Character behavior                            |
| ------------------------------ | --------------------------------------------- |
| Verified active work           | Seated DESK with task-specific workPose       |
| Standby / PTY-only             | DESK rest; no unsupported Thinking claim      |
| Done / failed / interrupted    | DESK rest or completion bubble; no stale work |
| Waiting for input / permission | Stay seated + speech bubble                   |
| Sub-agent (unnamed)            | Near parent, no seat                          |
| Teammate (named)               | Deferred after Claude team bridge             |

Default layout ships as JSON; editor supports floor/wall paint, furniture place/rotate, undo/redo, import/export. Persist under Calder data / preferences (`pixelOffice.layout`). Zoom integer + pan + follow selected.

## Data bridge

Canonical `AgentEvent.kind`:  
`sessionStart | sessionEnd | toolStart | toolEnd | turnEnd | permissionRequest | subagentStart | subagentEnd | progress`

- Map sanitized `EvidenceEvent` → `AgentEvent`.
- Provider `stop` normalizes to `session_ended` (completion intent; PTY still owns final sealing);
  `permission_approved` is derived from an allowed governance decision; `task_completed` and
  interruption clear active visual state.
- Initial event tails and live batches reconcile by run/event identity and monotonic `seq`;
  stale async snapshots cannot overwrite newer activity. Inspector and PTY work are serialized per
  session, and rejected events never notify renderer subscribers.
- Claude hooks/transcript → same model (main-process provider adapter).
- PTY-only providers (e.g. Antigravity): weak Bash-like signal + **PTY only** fidelity badge.
- Evidence Preferences capture remains; `pixelMode` becomes `off | office` (or boolean office enabled).
- Canvas palette reads shared Calder CSS tokens, so light and dark themes preserve semantic status
  contrast.
- Canvas remains decorative; `aria-live` status companion exposes session labels and activity to
  keyboard and screen-reader users.

## Assets

- Characters: Metro City pack (document itch license in `THIRD_PARTY_NOTICES`).
- Furniture/floor/wall: Calder PNG atlases under `src/renderer/assets/pixel-office/`, copied by `copy-assets`.
- Provider hue-shift for Claude / Codex / Cursor / Antigravity.

## Hard delete (old Pixel)

Remove:

- `src/renderer/components/pixel-agent/**`
- `context-pixel-panel.ts` and Context Inspector Pixel tab/host
- `studio-sheet.svg` and `inspector-pixel-*` / ecosystem roster UI driven by old studio
- Prefs copy for Compact/Studio modes

Keep: Evidence store/IPC/normalize, Safety capture toggle.

## Milestones

| ID  | Deliverable                                                      |
| --- | ---------------------------------------------------------------- |
| M1  | Shell pane + toggle + remove Pixel tab                           |
| M2  | Canvas core: tiles, seats, Metro City walk/type, Evidence bridge |
| M3  | Bubbles, gauge, sound, hover label, sub-agent characters         |
| M4  | Layout editor + persist                                          |
| M5  | Claude hook richer tool events                                   |
| M6  | Finish teardown of old pixel-agent; knip/structure green         |

## Risks

- Full parity in one PR will fail CI budgets — ship by milestone.
- Antigravity stays low-fidelity until provider hooks exist.
- Metro City license must be verified before bundling binaries.
- Structure audit line/file budgets: keep modules ≤500 lines.

## Success criteria

1. Open CLI → character seated in `#pixel-office` with visible Metro City sprite.
2. Claude tool activity → typing vs reading animation + activity label.
3. Permission wait → speech bubble; turn done → checkmark bubble.
4. Layout edit survives reload.
5. Old CSS station grid / Compact strip gone; Denetçi has no Pixel tab.
6. Tests + knip + structure audit pass.
