# Calder Right Rail Tools Focus Design

Date: 2026-04-12
Status: Approved for planning
Scope: Renderer right rail only (`Overview`, `Readiness`, `Git`, `Config / integrations` surfaces)

## Summary

Calder's right rail should stop behaving like a stack of equal-weight settings cards and start behaving like an adaptive support rail for the current work. The default emphasis will move to a `Tools Focus` model: the rail primarily explains the active tool environment and only expands `Git` or `Health` when the user actually needs attention there.

The rail will still keep project status visible, but it should no longer feel like a mini dashboard that repeats information with the same visual weight. The guiding product rule is:

- `Tools` is the default focus
- `Git` is the default operational secondary block
- `Health` stays compact until something needs attention
- `Overview` remains a small, stable anchor at the top

## Goals

- Make the right rail feel purpose-built for Calder rather than like a generic sidebar dashboard.
- Reduce repeated card weight and visual sameness.
- Keep the most useful information visible without forcing the user to scan four equally loud sections.
- Make the rail adapt to real project state in a predictable way.
- Preserve existing functionality and data sources while improving hierarchy, copy, and reveal logic.

## Non-Goals

- No redesign of the left live surface or center session layout in this spec.
- No change to session launch APIs, provider runtime contracts, or readiness analysis logic.
- No replacement of the existing Git or readiness data providers.
- No new persistent preferences for right-rail mode in v1.

## Current Problems

### 1. Equal-weight sections create weak hierarchy

`Overview`, `Readiness`, `Git`, and `Config` currently read like parallel cards even though they serve different jobs. This forces the user to re-decide what matters every time they glance at the rail.

### 2. The rail does not reflect the current mode of work

When the user is selecting providers, checking MCP, or understanding the current tool environment, the rail does not lean into that context. Conversely, when Git is noisy or tracking is broken, the rail does not assertively reorganize to reflect that.

### 3. Product language is still too generic

The right rail has become clearer than before, but it still reads like a collection of administrative panels instead of a focused companion to the active workspace.

## Proposed Information Architecture

The right rail will be composed of four layers:

1. `Project Snapshot`
2. `Tools Focus`
3. `Git`
4. `Health`

The order can visually adapt, but the semantic responsibilities stay fixed.

### Project Snapshot

This is always visible and always compact. It is the orientation anchor, not the main work area.

It contains:

- current project name
- active provider badge
- project path
- compact metrics:
  - open sessions
  - run log count
  - change count or clean state
  - readiness summary

This card should become visually quieter and denser than the current implementation. Its job is to answer "where am I and what state is this project in?" in one glance.

### Tools Focus

This becomes the main primary section in the default state.

It contains:

- active coding tool / provider
- tracking status for the active tool
- relevant integrations summary:
  - MCP servers
  - skills
  - commands
  - agents if applicable
- fast understanding copy such as:
  - `Claude Code is active`
  - `Tracking is on`
  - `3 MCP servers connected`
  - `6 custom commands available`

It may also expose a very small set of contextually appropriate actions such as:

- `Enable tracking`
- `Open integrations`
- `Review commands`

The section should feel like a focused control surface, not a settings dump.

### Git

Git becomes the operational secondary block.

Default compact state:

- branch name
- total change count or `Clean`
- one-line summary

Expanded state:

- file groups
- worktree selector
- stage / unstage / discard actions

Git should auto-expand when:

- there are changes
- there are conflicts
- the repo is dirty enough that action is likely needed

Git should stay compact when the worktree is clean or nearly idle.

### Health

`Health` is the user-facing label for readiness and tracking issues, not just the readiness score.

Default compact state:

- short summary like `Tracking on`, `All good`, or `1 issue`

Expanded warning state:

- tracking off
- hooks missing
- readiness low
- other actionable tool health issues

`Health` is not the default primary section. It becomes primary only when something meaningfully blocks visibility, tracking, or confidence.

## Adaptive Behavior Rules

The rail will support three presentation states:

### State 1: Normal

Default order and emphasis:

1. `Project Snapshot`
2. `Tools Focus` expanded
3. `Git` compact or expanded depending on change count
4. `Health` compact

This should be the most common state.

### State 2: Warning Override

If the system detects a real attention condition, `Health` temporarily becomes the dominant section below `Project Snapshot`.

Trigger examples:

- tracking disabled for active provider
- status-line conflict preventing tracking
- hooks missing in a way that removes cost / context visibility
- readiness state below a chosen threshold

Adjusted order:

1. `Project Snapshot`
2. `Health` expanded
3. `Tools Focus`
4. `Git`

The rail should still feel calm. This is an override, not an alarm wall.

### State 3: Tools Focus

When the user is clearly working in the tool environment rather than reviewing repo state, the `Tools Focus` section stays dominant and the other sections compress.

Trigger examples:

- provider changed
- integrations panel opened recently
- config content is more relevant than repo state

Adjusted order:

1. `Project Snapshot`
2. `Tools Focus` expanded
3. `Git` compact
4. `Health` compact

This is the intended baseline experience.

## Copy and Naming

### Section labels

- `Overview` stays as the small top card label, but the card content should read more like `Project Snapshot`
- `Readiness` should evolve toward `Health`
- `Config` should evolve toward `Tools` or `Integrations` depending on section boundary

### Tone

Copy should be plain English, short, and operational:

- `Tracking is on`
- `Tracking is off`
- `3 MCP servers connected`
- `Git is clean`
- `6 files need review`

Avoid abstract product-language phrases such as:

- `integration incomplete`
- `operations`
- `toolchain extras`

unless the label is already well understood in-product.

## Visual Design Direction

The rail should become less "stack of identical cards" and more "single composed system".

### Principles

- `Project Snapshot` is compact and quiet
- `Tools Focus` has the richest visual treatment
- `Git` is utilitarian and sharper
- `Health` only gets stronger chroma when warning state is real

### Styling approach

- reduce repeated card shadow weight
- use different density levels for primary vs secondary sections
- strengthen section headings and internal hierarchy
- keep the rail visually related to the workspace, but distinct enough to read as a support column

### Motion

Use subtle transitions when sections change emphasis:

- small height transitions
- soft opacity / translate on section promotion
- no flashy animated resorting

The rail should feel stable even when it adapts.

## Implementation Shape

This redesign should stay mostly within the renderer layer.

Likely touch points:

- `src/renderer/components/context-inspector.ts`
- `src/renderer/components/readiness-section.ts`
- `src/renderer/components/git-panel.ts`
- `src/renderer/components/config-sections.ts`
- `src/renderer/styles/context-inspector.css`

### Preferred structural change

Move from independent equal-weight renderers toward a coordinated right-rail state model in `context-inspector.ts`, with each downstream section receiving either:

- a mode
- a priority
- a compact / expanded presentation flag

This keeps adaptation logic centralized instead of scattering heuristics across each panel.

### Suggested rail state contract

Introduce a renderer-only derived mode such as:

- `normal`
- `warning`
- `tools-focus`

And per-section presentation hints such as:

- `compact`
- `expanded`
- `promoted`

The first implementation should not change stored app state. This can remain derived from current project/session/provider/git/readiness conditions.

## Error Handling and Edge Cases

- If there is no active project, the rail should render a clean empty state instead of partial cards.
- If the repo is not Git-backed, `Git` should remain available but compact with a clear `No Git repository` message.
- If no integrations exist, `Tools Focus` should still explain the active provider and available next steps instead of feeling empty.
- If readiness data is missing, `Health` should display a neutral summary rather than an alarming placeholder.

## Testing Strategy

Add or update renderer contract tests for:

- right-rail derived state selection
- compact vs promoted rendering states
- warning override promotion
- tools-focus default ordering
- copy contract for renamed labels and summaries

Add CSS / structure contract tests where appropriate for:

- distinct primary vs compact section classes
- promoted health state styling hooks
- tools-focus primary section markers

## Rollout Plan

### Phase 1

- Introduce derived rail mode
- Keep current sections, but change ordering and compact / expanded behavior

### Phase 2

- Refine copy and naming
- Restyle card hierarchy

### Phase 3

- Add subtle adaptive motion
- Tune thresholds and promotion rules after real usage

## Acceptance Criteria

- The right rail defaults to a `Tools Focus` feel rather than a generic dashboard feel.
- The user can understand the active provider / integrations state without opening settings.
- Git becomes more visible when repo state needs action.
- Health becomes primary only when there is a real problem.
- The rail feels calmer, clearer, and more product-specific than the current equal-weight layout.
