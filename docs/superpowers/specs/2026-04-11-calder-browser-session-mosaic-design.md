# Calder Browser Session Mosaic Design

**Date:** 2026-04-11

**Goal:** Replace the rigid browser-plus-4-panel behavior with a flexible session mosaic that keeps the browser docked on the left, preserves open sessions on the right, and lets users resize the working area without breaking existing session workflows.

## Product Diagnosis

Calder's current multi-pane behavior solves only one narrow layout case:
- browser can be shown beside a fixed 2x2 session grid
- turning the grid mode off collapses the session working surface back into the old tab model
- the browser/session relationship is not stable enough to feel like a professional workspace

This creates three product problems:
- users lose the right-side spatial workspace when they leave the 4-panel mode
- the shell treats "multi-session workspace" as a special toggle instead of a first-class layout mode
- users cannot tune the browser-to-session working ratio, so the workspace feels cramped or wasteful depending on the page

The result is a shell that technically supports multiple sessions, but still feels binary:
- either "tabs"
- or "the 4-box mode"

That model is too rigid for real work.

## Approved Direction

Replace the current browser-plus-swarm behavior with a **browser-left session mosaic** workspace.

Core behavior:
- when a browser tab exists in the active project, it remains docked on the left side of the workspace
- the right side becomes a persistent **session mosaic canvas**
- toggling the old 4-panel control no longer destroys the right-side workspace; it changes how the session mosaic is arranged
- the browser/session divider becomes draggable so users can resize left and right working areas
- session arrangement uses a small set of smart presets instead of a fully freeform layout editor

This keeps the shell fast and stable:
- users keep spatial continuity
- open sessions stay visible in the same workspace model
- layout remains flexible without turning into a bug-prone window manager

## Alternatives Considered

### Keep the current tabs vs 4-box toggle

This is the lowest-effort option, but it preserves the exact rigidity the user wants removed. It still makes the workspace feel like a temporary mode switch rather than a durable working surface.

### Build a fully freeform drag-and-drop pane graph

This is the most flexible option, but it is the wrong trade-off for this phase. It would add a much larger state model, more drag edge cases, more persistence complexity, and substantially more UI bugs.

### Recommended: preset-driven session mosaic with draggable dividers

This is the best balance of flexibility, clarity, and implementation safety. Users get meaningful control over layout and sizing, while Calder keeps a predictable rendering model and a smaller bug surface.

## UX Model

### Browser-Left Workspace

When the active project contains a browser tab, the shell should render a two-region workspace:
- **left region:** browser workspace
- **right region:** session mosaic

The left browser region:
- remains visible while using the mosaic workspace
- is not counted as one of the right-side session tiles
- uses a draggable vertical divider to control width

Default browser width should be visually balanced for real browsing and prompting, not maximized for either side. A reasonable default is roughly `35%` to `40%` of the available width.

### Persistent Session Mosaic

The right side is no longer a temporary "4-box mode." It becomes the persistent place where open CLI sessions are laid out.

Behavior:
- open CLI sessions remain on the right side when the mosaic layout changes
- switching layout presets reflows the same sessions instead of dropping back to single-tab mode
- session order still comes from the existing pane/session ordering model
- drag-reorder stays supported for the right-side sessions

### Smart Presets

Session layout should be chosen from a small set of deterministic presets.

Default mapping by visible session count:

#### 1 visible session
- one large session panel filling the right-side canvas

#### 2 visible sessions
- default preset: two equal columns
- alternate preset: two equal rows

#### 3 visible sessions
- default preset: one large left panel plus two stacked panels on the right
- alternate preset: one large top panel plus two side-by-side panels below

#### 4 visible sessions
- default preset: 2x2 grid

The shell should pick the default preset automatically when the session count changes, while still allowing the user to switch to another valid preset for that count.

### Divider Resizing

Two kinds of resizing should be supported:

1. **browser/session divider**
- adjusts the width split between the left browser region and the right session mosaic

2. **internal mosaic dividers**
- adjust ratios inside the active right-side preset
- for example:
  - in the 3-session default preset, users can widen the large left panel or make the two right panels taller/shorter
  - in the 2-session side-by-side preset, users can widen one session and shrink the other

All divider interactions should feel direct and reversible, without introducing floating windows or detached panes.

### Layout Control Surface

The existing 4-panel toggle should be repurposed into a **layout preset control** for the session mosaic.

Behavior:
- if the current session count has only one valid layout, the control can show the active preset without opening extra choices
- if multiple presets are valid for the current session count, the control should open a compact selector
- the control should communicate arrangement, not mode activation

Examples:
- 2 sessions: switch between columns and rows
- 3 sessions: switch between focus-left and focus-top
- 4 sessions: remain on grid

## State Model

The current layout model is too coarse because it mainly distinguishes tabs vs swarm.

Introduce a more explicit browser-aware mosaic model on the project layout state:

- keep a project-level layout mode representing whether the project is in classic tab view or mosaic workspace
- persist the ordered list of visible right-side session ids as today
- persist the selected mosaic preset for the current session count
- persist divider ratios

Expected persisted fields:
- `layout.mode`: `tabs | mosaic`
- `layout.splitPanes`: ordered visible CLI session ids
- `layout.browserWidthRatio`: normalized left/right width ratio
- `layout.mosaicPreset`: current preset id
- `layout.mosaicRatios`: preset-specific divider ratios

Rules:
- browser tabs are not stored inside `splitPanes`
- `splitPanes` remains the source of session ordering for the right canvas
- browser presence is resolved from project sessions, just as today
- resizing updates persisted ratios so the workspace restores on relaunch

## Layout Logic

### Browser Present

When at least one browser tab exists in the project:
- render browser-left workspace in mosaic mode
- resolve the browser tab to display using the existing remembered-browser behavior
- render the right-side session mosaic using the active preset and divider ratios

### Browser Absent

When no browser tab exists:
- the session mosaic should expand to full width
- the same preset logic still works, but without the left browser column

This keeps the session mosaic generally useful instead of tying it too tightly to browser availability.

### Session Count Changes

When session count changes:
- keep existing order from `splitPanes`
- clamp invalid preset choices to the nearest valid default
- clamp persisted ratios into safe ranges

Examples:
- if the user was on a 3-session focus-left preset and closes one session, switch to the 2-session default preset
- if the user reopens a third session, restore the 3-session default unless a valid explicit preference exists

## Interaction Rules

### Session Reordering

Right-side sessions remain reorderable by dragging their pane headers.

Rules:
- reorder affects right-side session order only
- browser pane is excluded from session reorder targets
- dropping onto another session reorders `splitPanes`
- changing order does not mutate the current preset type

### Focus Behavior

Focus should remain predictable:
- clicking a visible session makes it active
- clicking the browser pane makes the browser session active without collapsing the mosaic
- active session highlighting remains local to the right-side session canvas

### Toggle Behavior

The old 4-box button should no longer mean:
- "enter multi-pane"
- "leave multi-pane"

Instead it should mean:
- "change the current session arrangement"

If the user explicitly leaves mosaic mode and returns to classic tabs in a future control path, that should be a separate decision from choosing a session arrangement.

## Technical Touchpoints

Primary files expected to change:
- `src/shared/types.ts`
- `src/renderer/state.ts`
- `src/renderer/components/split-layout.ts`
- `src/renderer/components/tab-bar.ts`
- `src/renderer/styles/terminal.css`
- related renderer contract tests for layout rendering and divider behavior

Expected implementation shape:
- extend project layout state with mosaic preset and ratio fields
- migrate the current swarm renderer into a more general browser-aware mosaic renderer
- replace the fixed browser-plus-grid branch with preset-specific render paths
- add one reusable divider interaction layer for browser/session and internal mosaic splits
- repurpose the top-bar layout control from a binary toggle into a preset selector

## Non-Goals

This design does not:
- build a fully freeform nested pane editor
- add detachable floating panels
- allow browser panes to be reordered into the right-side session canvas
- redesign session creation, providers, or browser targeting in this pass

## Acceptance Criteria

This design is complete when:
- browser stays docked on the left in mosaic mode
- open CLI sessions remain visible on the right when arrangement changes
- the old 4-box control now changes arrangement instead of collapsing the workspace
- two visible sessions can be shown together on the right without forcing classic tabs
- three visible sessions can use a focus-left layout with one large session and two stacked sessions
- users can resize the browser/session split
- users can resize the active preset's internal dividers
- session reorder still works on the right-side session canvas
- browser is excluded from right-side reorder logic
- layout restores correctly after relaunch

## Verification Plan

Minimum verification after implementation:
- targeted layout-state tests for preset persistence and ratio persistence
- targeted renderer tests for:
  - browser-left + one-session mosaic
  - browser-left + two-session mosaic
  - browser-left + three-session focus-left mosaic
  - browser-left + four-session grid
  - fallback behavior when browser is absent
- targeted interaction tests for:
  - preset switching
  - browser/session divider resize
  - internal preset divider resize
  - session reorder on the right-side canvas
- `npm test`
- `npm run build`
- manual smoke check confirming:
  - browser remains on the left while session arrangement changes
  - two sessions stay visible together when leaving the old 4-box behavior
  - three sessions can render as one large left pane plus two stacked right panes
  - resizing the browser/session split feels stable and persists
  - resizing internal mosaic dividers feels stable and persists
