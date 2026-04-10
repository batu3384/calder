# Calder Precision Cockpit Redesign

**Date:** 2026-04-10

**Goal:** Rebuild Calder's interface into a clearly owned, modern, premium desktop product while preserving the application's current workflow model, information architecture, and productivity behavior.

## Product Intent

Calder is not a chat toy, a generic AI shell, or a note-taking app.

It is a desktop command surface for AI-assisted development work:
- multiple CLI providers
- projects and sessions
- split workspace behavior
- terminal and browser surfaces
- git, readiness, history, and config visibility

The UI should therefore feel like:
- a serious desktop tool
- a control surface
- dense but deliberate
- technical without being harsh
- modern without becoming trend-chasing

## Approved Direction

The chosen direction is **Precision Cockpit**.

This direction combines:
- Apple macOS productivity clarity
- Linear-style consistency and restraint
- Cursor/Raycast-style modern technical polish

It should create an interface that feels:
- sharper
- more structured
- more premium
- easier to scan
- more obviously "Calder"

without turning into:
- glossy AI slop
- neon dashboard UI
- oversized cards everywhere
- marketing-style drama inside the app

## Non-Negotiable Constraints

1. The existing workflow model must remain intact.
2. The existing information architecture must remain intact.
3. Fast session creation behavior must remain intact.
4. Split/session behavior must remain intact.
5. Provider concepts, project concepts, and side panels must remain intact.
6. The redesign must not make the app feel lighter, softer, or more consumer-like than it should.
7. The redesign must not mimic the previous product identity.

## Core Redesign Thesis

The current UI is strong structurally but under-authored visually.

The redesign should not change what the app *is*.
It should change how clearly and confidently the app *expresses itself*.

That means:
- stronger visual hierarchy
- more deliberate pane chrome
- better section rhythm
- clearer emphasis
- more refined use of contrast and elevation
- calmer but more expensive-looking surfaces

The app should feel less like "a dark Electron utility" and more like "a considered desktop product".

## Visual System

### Color

The new color system should be built around four layers:

1. **Foundation**
   - near-black graphite background
   - slightly warmer and deeper than pure black
   - enough tonal range to distinguish chrome, panels, and workspace

2. **Structure**
   - border, divider, and inactive chrome tones
   - subtle but consistent
   - used to define boundaries without clutter

3. **Accent**
   - Calder coral-red stays as the signature accent
   - used more intentionally
   - reserved for selected state, primary action, focused highlights, and critical attention

4. **Semantics**
   - success, warning, info, danger
   - consistent across readiness, git, alerts, and status surfaces
   - no scattered ad hoc colors

### Typography

Typography should remain tool-oriented, but more refined:
- stronger weight hierarchy
- better casing and letter-spacing for labels
- slightly more premium text rhythm
- monospace retained where it aids inspection or system state clarity

Typography should not become editorial or decorative.
Its job is precision, not personality theater.

### Shape and Surface Language

The new shell should use:
- small to medium radii
- more consistent corner treatment
- slightly more elevation in overlays
- clearer pane separation
- less harsh border treatment

This should feel engineered, not soft.

### Motion

Motion should remain subtle and sparse:
- hover and active transitions
- cleaner modal and dropdown appearance
- no ornamental or showy animations

The app should feel responsive, not animated for attention.

## Layout Strategy

The application should preserve its existing macro-layout:
- narrow control sidebar
- compact top tab/action strip
- large primary workspace

But the chrome should be redesigned to feel more intentional.

### Sidebar

The sidebar should evolve from "stack of dense sections" into a stronger control tower:
- tighter section rhythm
- clearer section headers
- stronger active row treatment
- better use of muted text vs primary text
- less accidental visual noise

The sidebar should feel closer to a premium operations rail than a plain file tree.

### Top Bar / Tabs

The tab bar should become cleaner and more authoritative:
- better tab spacing
- more intentional selected tab presence
- cleaner action-button grouping
- more legible git branch/status placement

The top chrome should visually anchor the app.

### Workspace

The workspace should feel more framed and less empty:
- stronger pane edges
- more deliberate browser/terminal shell
- cleaner empty-state presentation
- tighter relationship between workspace chrome and global chrome

The workspace must remain the dominant visual mass.

## Key Surface Redesigns

### Main Shell

Main shell changes should include:
- fully revised dark theme system
- stronger contrast layering
- refined sidebar and tab chrome
- improved borders, shadows, and pane edges
- cleaner icon/button treatment

### Browser Session Surface

The browser session surface should be redesigned because it is currently one of the most visible product faces.

Improvements should include:
- more refined control row
- better spacing between address bar and tools
- more premium empty-state composition
- less generic button/input feel

### Terminal Surface

Terminal panes should look more productized:
- cleaner pane outlines
- better focused vs unfocused state
- stronger session status bar styling
- better integration between pane and shell

### Preferences

Preferences should become a clear flagship modal:
- stronger left menu hierarchy
- more polished section spacing
- better field density
- more deliberate about/setup presentation

This is one of the best places to visibly communicate product quality.

### New Project / Utility Modals

Shared modals should all inherit a cleaner system:
- stronger header-body-footer structure
- better input styling
- improved select/dropdown styling
- more consistent button hierarchy

### Readiness / Git / History / Alerts

These secondary utility surfaces should become more legible and more coherent:
- compact but cleaner badges
- improved progress and semantic color use
- less ad hoc styling between components
- better informational hierarchy

## Brand Expression

The redesign should make Calder feel like its own product through:
- a more distinctive shell tone
- stronger signature accent discipline
- a more deliberate empty-state and top-level chrome identity
- no residue from the previous product's visual habits

The brand should be visible in:
- the tone of the shell
- the confidence of the layout
- the consistency of the interaction surfaces

not through logos or gimmicks.

## What Should Change Significantly

The following areas should feel materially different after this redesign:
- sidebar identity and readability
- tab/header chrome quality
- overall color balance
- browser surface quality
- modal quality
- preferences polish
- pane framing and workspace cohesion

## What Should Not Change

The following must remain conceptually the same:
- project/session mental model
- side-panel ordering
- quick new-session behavior
- split behavior
- provider workflow
- readiness/git/history feature shape
- terminal/browser capability set

## Implementation Shape

This redesign should be executed in layers.

### Layer 1: Theme Foundation

Create a stronger shared design token system:
- shell palette
- elevation tokens
- border strengths
- radii
- semantic colors
- control heights
- typography helpers

### Layer 2: Shared Controls

Standardize:
- buttons
- icon buttons
- inputs
- selects
- dropdowns
- badges
- section headers

### Layer 3: Shell Chrome

Rework:
- sidebar
- tab bar
- global action strip
- pane framing

### Layer 4: High-Visibility Surfaces

Redesign:
- browser session UI
- preferences
- new project modal
- help / usage / readiness modals

### Layer 5: Detail Pass

Refine:
- alerts
- progress bars
- secondary lists
- hover and focus states
- semantic status elements

## Risks

The main risks are:
- making the UI too soft
- accidentally creating a generic AI app look
- breaking compact density
- changing behavior while restyling
- introducing visual inconsistency between shell and feature surfaces

## Risk Controls

To avoid those risks:
- preserve DOM structure where possible
- prefer systemic restyling over component-by-component improvisation
- keep density high
- keep the workspace dominant
- test quick-session and split behavior after major passes
- visually compare the shell, browser, preferences, and modals together before finishing

## Verification

Verification should include:
- full build
- full test suite
- repo search to ensure old-brand runtime residue stays removed
- visual review of:
  - main shell
  - browser session surface
  - new project modal
  - preferences
  - usage/help surfaces
  - split workspace behavior

## Success Criteria

This redesign is successful when:
- the product immediately looks like a new owner took control
- the app feels more premium and more modern
- the workflow still feels identical
- the UI is easier to scan and nicer to stay inside for long sessions
- nothing about it reads as generic AI app styling
- Calder looks like a real product, not a fork with recolored CSS
