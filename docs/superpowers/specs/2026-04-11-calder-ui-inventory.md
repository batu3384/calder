# Calder UI Inventory

**Date:** 2026-04-11

**Purpose:** Track every visible Calder interface surface before the Native-first UI System redesign so changes stay surgical and behavior remains stable.

## Triage Legend

- `keep`: keep structure and behavior
- `rename`: copy or label should change
- `restyle`: visual system should change without behavior changes
- `merge`: combine with another nearby control or surface
- `remove`: delete because the control is no longer useful
- `behavior-fix`: behavior is confusing, fragile, or inconsistent

## Inventory

| Surface | Current Role | Decision | Required Change | Behavior Must Stay |
|---|---|---|---|---|
| Sidebar header | Brand, project navigation, preferences, new project | restyle | Tighten brand block, keep gear/new project obvious | Preferences and new project buttons still work |
| Project list | Switch active project | restyle | More legible active row, better density | Project selection and sidebar resize |
| Top tab strip | Session navigation and creation | restyle | Cleaner session strip, stronger active session state | Quick new session and tab reorder |
| Workspace spend | Cost signal | restyle | Keep visible but less dashboard-like | Cost data display |
| Git status | Repo branch/change signal | restyle | More compact status affordance | Existing git popover behavior |
| Terminal panes | CLI sessions | restyle | Better pane chrome, focus, provider badge, unread/working states | PTY lifecycle and keyboard behavior |
| Browser pane | Embedded browser workflow | restyle | Stronger toolbar hierarchy and local target clarity | Navigation, webview, inspect, draw, record |
| Browser inspect popover | Send selected element context to a session | behavior-fix | Anchored, movable, non-clipping, selected target clear | Send to selected, custom, or new session |
| Browser target menu | Select destination CLI session | behavior-fix | Use anchored menu and clearer session metadata | Existing target-session state |
| Control Panel | AI Setup, Changes, Recent Sessions, Toolchain | restyle | Operational inspector with less card stacking | Section order and non-blocking warnings |
| AI Setup | Readiness/tracking status | restyle | Plain-language utility copy and clearer scan state | Readiness scan behavior |
| Changes | Git changes list | restyle | Dense list rows and clearer empty state | Existing file/diff actions |
| Recent Sessions | Continue previous work | restyle | Better row hierarchy and destructive action clarity | Restore/archive/delete behavior |
| Toolchain | MCP servers, agents, skills, commands | rename | Keep `MCP Servers`, clarify counts and empty states | Existing config open/add/remove behavior |
| Shared modal | New project/session/branch/MCP inspector | behavior-fix | Shared accessible shell, focus restore, better field rows | Confirm/cancel callbacks |
| Preferences | App settings | restyle | Flagship settings surface with stronger sections | Preferences persistence |
| Usage Stats | Spend modal | restyle | Better table/chart density | Existing stats calculation |
| Agents/Skills/Commands docs | Markdown/document reader | restyle | Better doc header, typography, and actions | File-reader session model |
| Session Inspector | Timeline and session details | restyle | Token-aligned badges and readable dense lists | Inspector data flow |
| Scratch Shell | Project utility terminal | restyle | Match terminal pane chrome | Shell PTY behavior |
| Menus and dropdowns | Secondary actions | behavior-fix | Move fragile positioning to Floating UI | Existing menu actions |

## Non-Changes

- No renderer framework migration.
- No provider launch API changes.
- No PTY lifecycle changes.
- No `webview` replacement.
- No decorative dashboard or marketing surfaces.
