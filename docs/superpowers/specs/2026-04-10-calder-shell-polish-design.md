# Calder Shell Polish Design

**Goal:** Make the app fully feel like Calder through a hard ownership transfer and subtle shell polish, while preserving the current workflow, information architecture, and session behavior.

## Product Read

The app already has a strong operational shape:
- a dense left sidebar for projects, config, readiness, git, and history
- a compact tab bar and action strip across the top
- a large session workspace that changes by session type
- fast session creation behavior where the default `New Session` action opens a new split/session directly rather than a form-first flow
- overlay-heavy secondary surfaces such as `New Project`, `Preferences`, `Usage Stats`, and `Help`

The current UI works, but it feels rough rather than authored:
- pure black backgrounds flatten the hierarchy
- the hot pink-red accent is overused and feels louder than the product needs
- spacing is tight in ways that read more accidental than intentional
- panels and modals are functionally solid but visually generic
- some critical surfaces still rely on hardcoded colors instead of a coherent shell system

## Non-Negotiable Constraints

1. The existing workflow must remain intact.
2. The existing information architecture must remain intact.
3. The current fast-path behaviors must remain intact, especially split/session creation behavior.
4. The UI must not drift into generic “AI app” styling.
5. The product should feel more premium and more owned, not more experimental.
6. Old product identity should be removed completely, including hidden compatibility aliases and legacy runtime/storage markers.

## Design Direction

This pass is a surgical polish, not a redesign.

The target feeling is:
- terminal-native
- technical
- calm
- premium
- dense but legible

This is explicitly **not**:
- glassmorphism
- oversized gradients
- dashboard-card bloat
- futuristic neon gimmicks
- overly rounded consumer UI
- a “landing page inside the app”

## Visual Strategy

### Color System

- Replace pure black with deep graphite and near-black blue-gray surfaces so hierarchy is visible without making the app feel lighter.
- Keep a Calder accent, but narrow its use to:
  - primary actions
  - selected/focused states
  - critical/high-attention states
- Reduce accidental red repetition in surrounding chrome so the accent feels intentional.
- Normalize success/warning/error colors through shared tokens rather than scattered hardcoded values.

### Typography

- Keep the UI compact and tool-like.
- Improve hierarchy through weight, casing, and spacing rather than larger text blocks.
- Preserve monospace where it aids operational clarity, especially terminals, metrics, and inspection surfaces.
- Avoid trendy display typography or editorial gestures that would clash with the product’s working-tool identity.

### Spacing and Shape

- Keep density, but remove cramped feeling.
- Standardize small-radius corners, panel padding, button proportions, and modal spacing.
- Improve separation between sidebar sections, tab clusters, and modal regions through spacing and tone instead of extra decoration.

### Surface Behavior

- Sidebar remains the control tower.
- Tab bar remains compact and utilitarian.
- Session panes remain sharp and work-first.
- Modals become cleaner and more deliberate, but not larger or more consumer-like.

## Ownership Transfer Rules

This pass removes the remaining soft and hidden traces of the previous product identity.

### Must Remove

- deprecated renderer aliases for the previous product name
- compatibility-only API type aliases
- legacy state fallbacks outside the Calder namespace
- legacy root ignore artifacts carrying the previous product name
- acceptance logic for hook markers belonging to the previous product name
- old launcher compatibility shims if they exist only for the previous name
- old maintainer naming, links, and ownership references that remain anywhere user-visible or runtime-relevant

### Allowed Historical Mentions

- historical notes in changelog entries may remain only where they are clearly archival and not runtime-relevant

## UI Scope

This pass should touch the shell and common surfaces only.

### In Scope

- base theme tokens
- sidebar shell styling
- tab bar and top action styling
- common modal styling
- terminal container chrome and status bar styling
- shared badges, indicators, and compact controls
- cleanup of hardcoded colors where they materially affect the shell

### Out of Scope

- changing navigation structure
- changing panel order
- changing session concepts or provider concepts
- redesigning feature flows
- inventing new dashboard surfaces
- changing how quick session creation works
- adding marketing-style empty states

## Implementation Shape

### Theme Foundation

Centralize the shell look around shared tokens in the renderer base styles, then push repeated hardcoded values in major shell surfaces toward those tokens.

### Shell Polish

Apply the new tone system to:
- sidebar
- tab bar
- session pane chrome
- modal framework
- common buttons and context menus

### Ownership Cleanup

Do a hard break from the old identity in runtime/storage/bridge code rather than preserving migration aliases.

## Risk Management

The main risk is accidentally changing how the app behaves while cleaning and polishing it.

To avoid that:
- preserve DOM structure where possible
- preserve IDs and event wiring
- prefer tokenization and style refinement over structural rewrites
- treat quick session creation and split behavior as protected behavior
- verify both build health and full test health after cleanup

## Verification

Verification should prove two things:

1. The product still behaves the same.
2. The old identity is gone from runtime behavior.

Minimum verification:
- full build
- full test suite
- repo-wide search for old ownership/runtime identifiers after implementation
- visual spot-check of the current shell surfaces:
  - main shell
  - new project modal
  - preferences
  - help
  - usage
  - split session behavior

## Success Criteria

This work is successful when:
- the app still works the same way
- the shell feels more deliberate and more premium
- nothing reads like a generic AI app reskin
- the product feels clearly owned as Calder
- old identity references are no longer part of runtime or visible product behavior
