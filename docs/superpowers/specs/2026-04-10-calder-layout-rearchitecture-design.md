# Calder Layout Rearchitecture Design

**Date:** 2026-04-10

**Goal:** Make Calder materially different from the inherited interface by changing the shell information architecture, while preserving the existing session model, providers, terminal/browser behavior, git workflows, readiness checks, history, and utility surfaces.

## Product Diagnosis

Calder no longer has a major naming or color problem. The remaining resemblance is structural.

The current shell still reads like an inherited app because it uses the same dominant pattern:
- a dense left rail that mixes projects, setup controls, project health, git, history, and usage
- a compact top tab bar with many equal-weight utility buttons
- a central terminal/browser workspace framed as the only primary surface

This makes the product feel like a reskin even when colors, labels, and copy are Calder-specific. The fix is not to remove working features. The fix is to move features into a clearer Calder-owned hierarchy.

## Approved Direction

Use a **Project Rail + Command Deck + Context Inspector** shell.

This direction keeps Calder dense, technical, and fast, but changes the mental model:
- **Project Rail:** the left side becomes a narrow workspace switcher, not the home for every utility.
- **Command Deck:** the top bar becomes the primary command surface for session creation, session navigation, layout mode, search, and overflow tools.
- **Context Inspector:** git, readiness, history, capabilities, setup status, and related signals move into a contextual right drawer or inspector surface.
- **Workspace Canvas:** terminal, browser, diff, file reader, MCP inspector, and remote terminal sessions continue to render through the existing tab/split/swarm canvas.
- **Scratch Shell:** the project terminal remains a bottom drawer, but it should read as a project scratch shell rather than a second primary workspace.

This is the recommended middle path: materially different from the old shell, but low-risk compared with a fully freeform canvas redesign.

## Alternatives Considered

### Minimal Shell Polish

Keep the current left sidebar and top bar, only improving spacing, color, and labels.

This is too weak for the current goal. It preserves the old mental model and would continue to feel inherited.

### Radical Canvas-First Workspace

Remove the sidebar concept entirely and place projects, sessions, browser capture, git, and history into a canvas/dashboard-like command environment.

This could be distinctive, but it has high risk. It would touch too many interaction paths at once and could break the workflow that already works.

### Recommended: Project Rail + Command Deck + Context Inspector

Move secondary utilities away from the permanent left rail, keep the session canvas, and introduce a right-side context surface.

This gives Calder a new product silhouette without rewriting the core application model.

## Non-Negotiable Constraints

1. Do not break quick session creation.
2. Do not break tab, split, or swarm behavior.
3. Do not remove provider support or provider-specific capabilities.
4. Do not remove git, readiness, history, usage, browser capture, MCP inspector, file reader, diff viewer, project terminal, sharing, or session inspector functionality.
5. Do not turn the app into a generic AI dashboard, landing page, or oversized card layout.
6. Preserve existing IDs and state flows where practical during the first implementation pass.
7. Make moved features discoverable through the command deck or inspector.

## Surface Inventory And Treatment

| Surface | Current Role | Decision | Target Placement |
| --- | --- | --- | --- |
| Project list | Switches active project and shows path/session count | Keep, simplify | Left project rail |
| Add project | Creates a workspace/project | Keep | Left rail header or command deck |
| Preferences | Global settings modal | Keep | Command deck overflow and app menu |
| Workspace Controls | MCP servers, agents, skills, commands | Keep, move | Context inspector: Capabilities |
| AI Readiness | Project readiness scan and score | Keep, move | Context inspector: Health, plus compact top status badge |
| Git Changes | File status, staging, diff opening, worktree selector | Keep, move details | Compact top git chip plus Context inspector: Git |
| Session History | Resume, bookmark, filter, clear history | Keep, move | Context inspector: Activity or command palette |
| Cost footer | Aggregate cost | Keep, demote | Command deck status or usage modal |
| Tab list | Active session navigation | Keep | Command deck main row |
| New Session action | Primary creation path | Keep, emphasize | Command deck primary action |
| Help | Explains indicators and shortcuts | Keep, demote | Command deck overflow |
| Usage Stats | Usage analytics modal | Keep, demote and clean provider-specific copy | Command deck overflow or status area |
| Project terminal toggle | Opens bottom shell | Keep | Command deck secondary action |
| MCP Inspector action | Creates MCP inspector session | Keep, demote | Command deck overflow or Capabilities inspector |
| Swarm toggle | Switches layout mode | Keep | Command deck layout control |
| Terminal session pane | Primary CLI session | Keep | Workspace canvas |
| Browser session pane | Embedded browser, inspect, draw, record flow | Keep, refine later | Workspace canvas |
| Diff viewer | Shows git diff | Keep | Workspace canvas |
| File reader | Read-only file and markdown viewer | Keep | Workspace canvas |
| MCP inspector pane | Inspect MCP tools/resources/prompts | Keep | Workspace canvas |
| Remote terminal pane | P2P shared terminal | Keep | Workspace canvas |
| Session inspector | Timeline/cost/tools/context drawer | Keep, align | Right inspector family |
| Search bar | In-session search | Keep | Local overlay inside active pane |
| Quick open | File search overlay | Keep | Command palette / command deck |
| Alerts | Missing tools, large files, settings warnings | Keep | Local contextual banners |
| Debug panel | Developer event log | Keep, hidden by debug mode | Developer-only bottom panel |
| Update banner | App update state | Keep | Main area banner |

## Target Information Architecture

### Left Project Rail

The left side should stop being a mixed utility sidebar. It should contain:
- Calder brand/project label
- project switcher list
- add project
- optional compact aggregate state only if it does not compete with project navigation

It should not contain:
- full git file lists
- full readiness categories
- full history search
- provider capabilities lists
- five unrelated collapsible sections

### Command Deck

The top chrome should become Calder's command surface.

It should contain:
- session tabs
- primary `New Session` action
- layout mode control
- compact git/health status chips
- search or command palette entry point
- overflow for usage, help, MCP inspector, terminal, and other utilities

The command deck should reduce equal-weight icon clutter. The current row has too many buttons that look equally important.

### Context Inspector

The right-side inspector should be the home for secondary project intelligence.

Initial inspector sections:
- **Health:** AI Readiness score, categories, rescan, fix actions
- **Git:** file changes, worktree selector, stage/unstage/discard/open diff
- **Activity:** session history, bookmarks, resume actions
- **Capabilities:** MCP servers, agents, skills, commands, setup status

The existing Session Inspector can remain a session-specific inspector, but the visual system should eventually align both inspectors so Calder has one coherent right-panel language.

### Workspace Canvas

Keep the existing workspace rendering strategy:
- tab mode
- split mode
- swarm mode
- terminal panes
- browser panes
- file reader and diff panes
- MCP inspector pane
- remote terminal pane

The first rearchitecture pass should avoid changing how panes are created, focused, resized, or destroyed.

### Scratch Shell

Keep the project terminal as a bottom drawer.

It should be visually labeled as a scratch/project shell so it does not feel like a duplicate of the main terminal sessions.

## Visual Direction

The new layout should feel:
- compact
- engineered
- serious
- distinctive
- desktop-native
- more like a professional command surface than a sidebar-heavy clone

Avoid:
- generic AI cards
- purple gradient styling
- oversized hero empty states
- dashboard bloat
- soft consumer-app chrome
- decorative glass that reduces readability

The visual change should come from layout silhouette, hierarchy, and rhythm, not gimmicks.

## Implementation Boundaries

### In Scope For The First Implementation Plan

- Move persistent left-sidebar utility sections into a right context inspector/drawer.
- Keep project list on the left.
- Reduce top action clutter into grouped controls and overflow.
- Keep existing session pane implementation intact.
- Rename/reframe settings that currently assume a permanent sidebar.
- Clean provider-specific copy in usage/help where it is misleading.
- Add tests or update existing shell tests for the new layout contract.

### Out Of Scope For The First Implementation Plan

- Rewriting terminal rendering.
- Rewriting browser webview behavior.
- Replacing session state shape.
- Removing git/readiness/history/config functionality.
- Rebuilding all modals from scratch.
- Creating a full dashboard or onboarding surface.
- Changing package/distribution behavior.

## Risk Management

The highest risk is breaking mature interaction paths while moving containers.

Mitigation:
- Preserve existing renderer component modules where possible.
- Move container placement before changing component internals.
- Keep event wiring and state events stable.
- Update CSS progressively rather than rewriting all surfaces.
- Verify fast session creation, tab switching, split/swarm behavior, git file opening, readiness modal, history resume, browser capture, project terminal, and preferences.

## Verification Plan

Minimum verification after implementation:
- `npm run build`
- full Vitest suite
- shell contract tests updated for the new Project Rail / Command Deck / Context Inspector structure
- visual smoke test of the running Electron app
- manual check of:
  - new session
  - project switching
  - right inspector open/close
  - git change list
  - readiness scan/modal
  - history resume
  - browser tab empty state and toolbar
  - project terminal drawer
  - preferences modal

## Success Criteria

This work succeeds when:
- Calder no longer looks like a left-sidebar clone of the old product.
- The app keeps the same core behavior.
- The left side reads as a project rail, not a catch-all utility panel.
- Project signals are available but no longer permanently stacked in the sidebar.
- Top chrome has clearer command hierarchy.
- The interface feels more Calder-owned without becoming generic AI UI.
