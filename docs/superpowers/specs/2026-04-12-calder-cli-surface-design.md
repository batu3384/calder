# Calder CLI Surface Design

**Date:** 2026-04-12

**Goal:** Add a new `CLI Surface` to Calder so terminal and TUI applications can be previewed, inspected, and routed into selected AI sessions using the same dual-focus workflow as the existing browser surface, without changing or degrading the current browser experience.

## Product Intent

Calder already has a strong live workflow for web applications:
- the left side hosts a live surface
- the right side hosts working AI sessions
- browser inspect can send targeted prompts into an existing selected session

That workflow should expand to terminal-native products.

The new model is:
- `Web Surface` for browser-based projects
- `CLI Surface` for terminal or TUI-based projects

Both surfaces should feel like first-class tools inside the same shell:
- preview on the left
- execution and iteration on the right
- explicit target session routing
- no hidden provider switching

The browser system is not being replaced. It stays intact and should continue to behave exactly as it does today.

## Problem Statement

Calder currently has no preview surface for CLI-first projects. Users can work in AI sessions, but they cannot:
- run a CLI or TUI app in a dedicated left-side preview surface
- inspect part of that live terminal UI
- select a region of the terminal preview and send targeted prompts into an existing working session

This leaves Calder strongest for web application flows and weaker for terminal-native products, even though the product itself is terminal-centric.

## Approved Direction

Add a new `CLI Surface` alongside the existing browser surface.

Behavior:
- the current browser-based `Live View` remains unchanged
- projects can expose a live left-side surface of type `web` or `cli`
- the `CLI Surface` runs a dedicated PTY-backed preview/runtime process
- the `CLI Surface` supports inspect and capture workflows
- inspect and capture route prompts into a selected open AI session using the same "send here" mental model as browser targeting
- browser and CLI surfaces share routing concepts but use different selection models

Selection model differences:
- browser surface selects DOM-backed page elements
- CLI surface selects terminal-backed lines, rectangular regions, or visible screen areas

## Product Model

The current browser implementation stores the browser tab in the session list. That was workable for browser-only support, but it becomes the wrong abstraction once a second live surface type is added.

Calder should distinguish between:
- **working sessions** on the right
- **live surfaces** on the left

New conceptual model:
- `sessions[]` remain AI and utility workspaces
- `surface` becomes the left-side preview/workspace surface

This keeps the shell clear:
- left side = thing being run, viewed, or inspected
- right side = AI sessions used to improve it

## State Model

### New Shared Types

Add new shared types in `src/shared/types.ts`:

- `SurfaceKind = 'web' | 'cli'`
- `CliSurfaceProfile`
- `ProjectSurfaceRecord`
- `CliSurfaceRuntimeState`
- `SurfaceInspectSelection`
- `SurfacePromptPayload`

Suggested shape:

```ts
export type SurfaceKind = 'web' | 'cli';

export interface CliSurfaceProfile {
  id: string;
  name: string;
  command: string;
  args?: string;
  cwd?: string;
  envPatch?: Record<string, string>;
  cols?: number;
  rows?: number;
  startupReadyPattern?: string;
  restartPolicy?: 'manual' | 'on-exit';
}

export interface ProjectSurfaceRecord {
  kind: SurfaceKind;
  active: boolean;
  targetSessionId?: string;
  web?: {
    url?: string;
    history?: string[];
  };
  cli?: {
    selectedProfileId?: string;
    profiles: CliSurfaceProfile[];
    runtime?: CliSurfaceRuntimeState;
  };
}
```

`ProjectRecord` should gain:
- `surface?: ProjectSurfaceRecord`

### Routing Ownership

The target session should move from browser-tab-specific state toward surface-level state:
- browser targeting becomes `surface.targetSessionId`
- CLI surface uses the same target field

Rules:
1. if `targetSessionId` points to a valid open local AI session, use it
2. else fall back to the current active AI session if it is targetable
3. else leave the surface target empty and require explicit selection

### Persistence Rules

Persist:
- active surface kind
- selected CLI profile
- surface target session id
- CLI profile list

Do not persist:
- in-flight runtime process ids
- transient inspect overlays
- temporary capture buffers

## Runtime Model

### Separate Runtime Process

The `CLI Surface` should not reuse the terminal instance of an AI session.

It needs its own PTY-backed process because its job is different:
- it previews or runs the product
- it is not an AI coding session

New main-process module:
- `src/main/cli-surface-runtime.ts`

Responsibilities:
- create PTY for a CLI surface
- stop and restart PTY
- resize PTY
- stream output to renderer
- optionally capture visible or recent buffer snapshots

### Renderer Runtime Boundary

New preload / IPC contract:
- `cliSurface.start(projectId, profileId | launchConfig)`
- `cliSurface.stop(projectId)`
- `cliSurface.restart(projectId)`
- `cliSurface.resize(projectId, cols, rows)`
- `cliSurface.capture(projectId)`
- `cliSurface.requestSnapshot(projectId)`

Events:
- `cli-surface:data`
- `cli-surface:exit`
- `cli-surface:status`
- `cli-surface:error`

### Runtime Identity

The `CLI Surface` runtime belongs to the project, not to a session.

That means:
- one active CLI surface runtime per project in V1
- profile switching replaces or restarts that runtime
- AI sessions remain independent

## UI Design

### Surface Switcher

The left-side workspace gets a surface switcher:
- `Live View`
- `CLI Surface`

If a project only has one configured surface type, Calder may default into it without forcing a switch UI.

### CLI Surface Shell

The CLI surface should feel parallel to browser live view, but not imitate it blindly.

Header structure:
- profile picker
- runtime status
- `Start`
- `Stop`
- `Restart`
- `Inspect`
- `Capture`
- target session picker

Body:
- dedicated xterm-backed preview surface
- optional empty-state guidance when not running

Footer / popover flow:
- inspect composer
- capture composer
- same target-session routing affordance as browser targeting

### Empty States

Not running:
- explain that this surface previews a CLI or TUI application
- show the selected command/profile
- give a clear start action

No profile configured:
- show a guided prompt to add a CLI profile for the project

No target session selected:
- show a routing warning similar to browser targeting
- do not silently create a new session from the primary action

## V1 Inspect Model

V1 must be strong enough to be useful for arbitrary CLI and TUI applications, even without framework-specific adapters.

Supported selection modes:
- `line`
- `region`
- `viewport`

Definitions:
- `line`: one or more full visible rows
- `region`: a rectangular cell range
- `viewport`: the entire visible terminal area

Payload fields:
- selected text
- selected coordinates
- nearby context lines
- visible buffer text
- ANSI snapshot
- project path
- runtime command
- runtime args
- cols / rows
- title if available

Prompt framing should say clearly that this is terminal output, not DOM:
- what part of the terminal was selected
- whether the selection is inferred or exact
- what command generated the preview

## V2 Heuristics Layer

V2 adds terminal-aware region understanding.

Goals:
- detect probable panels, sidebars, lists, forms, headers, footers, and dialogs
- group adjacent box-drawing or aligned text blocks into inspectable regions
- attach useful labels like `left panel`, `footer`, `task list`, or `command menu`

This layer remains heuristic:
- it should improve inspect quality
- it must never pretend certainty when only doing inference

UI should distinguish:
- `Selected region`
- `Inferred panel`

## V3 Framework Adapters

V3 introduces richer inspection for frameworks that expose structure.

First targets:
- `Textual`
- `Ink`
- `Blessed`

Second targets:
- `Bubble Tea`
- `Ratatui`

Adapter goals:
- better selection boundaries
- widget or component naming
- focus path
- active state hints
- richer inspect payloads

Adapter registry shape:
- renderer asks runtime which adapter, if any, is active
- runtime can attach metadata or structured snapshots
- renderer reflects adapter capability badges in the CLI surface UI

### Framework Rationale

`Textual` is the strongest early target because it exposes a real DOM/query/devtools model.

`Ink` is a strong candidate because it has React Devtools integration and a component tree.

`Blessed` is promising because it exposes an explicit widget tree and event system.

`Bubble Tea` and `Ratatui` are important terminal ecosystems, but their general inspection layer may require either app cooperation or stronger heuristics.

## V4 Calder Inspect Protocol

This is the highest-fidelity path for CLI projects we control.

Protocol goals:
- exact component selection
- stable component ids
- bounds
- semantic type
- optional source file hints
- lightweight state summary

Transport options:
- terminal escape-sequence side channel
- structured stdout/stderr metadata stream
- local socket or IPC sidecar

V4 should be implemented only after V1-V3 prove the generic model.

## Technical Touchpoints

Expected files to change or be added:

State and types:
- `src/shared/types.ts`
- `src/renderer/state.ts`

Renderer:
- `src/renderer/components/split-layout.ts`
- `src/renderer/components/terminal-pane.ts`
- `src/renderer/components/browser-tab/session-integration.ts`
- `src/renderer/components/surface-targeting.ts` (new shared routing helper)
- `src/renderer/components/cli-surface/pane.ts`
- `src/renderer/components/cli-surface/inspect-mode.ts`
- `src/renderer/components/cli-surface/selection.ts`
- `src/renderer/components/cli-surface/session-integration.ts`
- `src/renderer/styles/cli-surface.css`

Main / preload:
- `src/main/cli-surface-runtime.ts`
- `src/main/ipc-handlers.ts`
- `src/preload/preload.ts`

Tests:
- renderer surface tests
- runtime PTY tests
- state and routing regression tests

## Implementation Batches

### Batch 1 — Surface State Foundation

Scope:
- add new shared surface types
- add `project.surface`
- migrate browser target semantics to shared surface targeting helpers

Success:
- browser targeting still works
- no visible behavior regression
- project state persists cleanly

### Batch 2 — CLI Surface Runtime + Basic Pane

Scope:
- create PTY-backed runtime service
- add renderer pane and toolbar
- launch, stop, restart, resize

Success:
- a CLI app can run on the left side
- browser surface still works unchanged

### Batch 3 — V1 Inspect + Prompt Routing

Scope:
- line and region selection
- inspect composer
- send to selected session
- send to new session

Success:
- user can select part of a live CLI preview and route a prompt into an existing AI session

### Batch 4 — V2 Heuristics

Scope:
- inferred region grouping
- semantic labels
- better selection affordance

Success:
- TUI layouts feel easier to inspect than raw text-only selection

### Batch 5 — V3 Adapters

Scope:
- adapter registry
- Textual, Ink, Blessed initial support

Success:
- supported frameworks expose richer inspect payloads and more reliable region identity

### Batch 6 — V4 Protocol

Scope:
- Calder semantic inspect protocol
- exact node metadata
- source/state hints

Success:
- Calder-controlled CLI apps can provide browser-like inspect precision

## Non-Goals

This design does not:
- remove or redesign the existing browser surface
- merge AI sessions with preview/runtime surfaces
- force all projects into CLI mode
- ship semantic adapters in V1
- replace xterm
- redesign provider launch behavior

## Acceptance Criteria

This design is complete when:
- Calder can host either a browser or CLI live surface on the left
- the browser surface still works as it does now
- a CLI app can be launched and previewed in a dedicated left-side surface
- the CLI surface can route prompts into a selected existing AI session
- the target session model is shared across surfaces
- V1 works for arbitrary CLI/TUI projects without framework-specific adapters
- later adapter and protocol layers can be added without rewriting the V1 surface model

## Verification Plan

Minimum required verification per implementation phase:

Batch 1:
- state and routing tests
- browser routing regression tests

Batch 2:
- PTY runtime tests
- project-level launch/stop/restart tests

Batch 3:
- inspect selection payload tests
- prompt routing tests
- manual smoke test for `CLI Surface -> select -> send`

Batch 4:
- heuristics fixture tests against representative terminal screenshots or buffers

Batch 5:
- adapter-specific fixture tests for Textual, Ink, and Blessed

Batch 6:
- protocol integration tests for metadata parsing and exact node selection

Always:
- `npm test`
- `npm run build`
- browser surface regression smoke check

## Open Decisions Intentionally Deferred

These do not block the design but should be finalized during implementation planning:
- whether CLI profiles live inside project state only or also in a shared user library
- whether V1 inspect selection uses mouse-only interaction or also keyboard navigation
- whether capture should include raster screenshot in V1 or only text + ANSI snapshot
- whether surface switching UI is always visible or conditional on project capabilities
