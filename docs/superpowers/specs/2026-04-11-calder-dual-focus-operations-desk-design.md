# Calder Dual-Focus Operations Desk

Date: 2026-04-11
Status: Approved for planning
Owner: Codex + Batuhan

## 1. Goal

Calder should stop feeling like a recolored derivative of the previous product and instead present a distinct, tool-grade identity. The redesign must preserve existing workflows and runtime behavior while replacing the visual hierarchy, naming system, and settings information architecture that still echo the older shell.

The new direction is:

- product posture: tool-grade studio
- shell identity: dual-focus
- browser role: permanent live surface on the left
- AI role: primary working partner on the right
- settings role: operational control center, not a generic preferences form

This is a UI and product-language transformation, not a behavioral rewrite.

## 2. Design Thesis

Calder should feel like a live operations desk for AI-assisted product work.

The app must communicate three things immediately:

1. there is a real, live product surface in play
2. there is a strong AI working surface beside it
3. project and system context support the work instead of visually dominating it

The current shell still carries too much of the old identity because it relies on:

- abstract terms like `Workspace`, `Control Surface`, and `Control Panel`
- a sidebar + settings layout that reads like a generic SaaS admin shell
- too much repeated panel styling across all surfaces
- decorative empty states and accent treatment that feel inherited

The redesign should replace those patterns with a more operational, more grounded, and more Calder-specific language.

## 3. Core Layout Direction

### 3.1 Primary shell

The application shell should be re-centered around a dual-focus workspace:

- far left: `Project Rail`
- center-left: `Live View`
- center-right: `Session Deck`
- far right: `Ops Rail`

### 3.2 Layout intent

#### Project Rail

The current project sidebar remains functionally important but should visually step back. It is a navigation rail, not the emotional center of the product.

It should:

- stay narrow and utility-first
- emphasize quick project switching
- reduce brand drama and avoid oversized shell identity language

#### Live View

The browser area becomes a permanent first-class surface. When browser is present, it should read as a real operating surface rather than a temporary attachment.

It should:

- always anchor the left side of the main stage
- feel visually cleaner and less boxed-in than surrounding support surfaces
- communicate “live product state” at a glance

#### Session Deck

The session area becomes the AI operating partner to Live View. It should feel like the main production area for agent work rather than just another tab stack embedded in a generic workspace.

It should:

- own the right side of the main stage
- support multiple session surfaces without looking like equal-weight dashboard tiles
- emphasize the currently active session as the working focus

#### Ops Rail

The current right-side control panel becomes a slimmer support rail. It exists to expose operational context, not to compete with Live View or Session Deck.

It should hold:

- providers / readiness state
- git state
- recent activity
- tools / environment context

It should read as a support rail, not a second workspace.

## 4. Product Language Reset

The current shell still feels inherited because its nouns are too close to the previous product’s mental model. Calder needs a new, simpler, more operational vocabulary.

### 4.1 Remove these legacy-feeling labels

- `Control Surface`
- repeated `Workspace` as the dominant noun
- `Control Panel`
- `Shell Layout`
- overly abstract “workspace defaults” style copy

### 4.2 Replacement naming

- `Control Panel` -> `Ops Rail`
- `Workspace Spend` -> `Spend`
- `AI Setup` -> `Providers`
- `Toolchain` -> `Tools`
- `Recent Sessions` -> `Activity`
- `Scratch Shell` -> `Quick Terminal`
- settings section `Shell` -> `Layout`
- product-level project sidebar title should move away from “big workspace shell” language and toward simpler project/navigation language

### 4.3 Copy rules

All new copy should be:

- short
- operational
- plain English
- provider-neutral where possible
- less slogan-like and less abstract

Avoid:

- long checkbox labels that try to explain layout internals
- marketing-like empty-state language
- repeated uppercase kickers as the main identity device

## 5. Settings Redesign: Control Center Model

### 5.1 Purpose

Settings should stop behaving like a standard left-nav preferences form. Instead, they should behave like a control center: state, configuration, and next actions presented together in a more operational format.

### 5.2 New structure

The modal remains a modal, but its internal information architecture changes:

- top-level segmented navigation instead of a dominant left menu
- sections:
  - `General`
  - `Layout`
  - `Providers`
  - `Shortcuts`
  - `About`

### 5.3 Content model

Each section should be composed of operational blocks rather than long vertical form rows.

Each block should answer:

1. what this area controls
2. what its current state is
3. what the user can change or fix

### 5.4 Section intent

#### General

Cluster settings into small operational groups instead of standalone toggles:

- session behavior
- alerts
- history
- naming

#### Layout

Replace long labels like `Context inspector: Toolchain` with grouped layout blocks:

- `Ops Rail modules`
- `Live View behavior`
- `Session Deck defaults`

This section should describe layout in terms of user-facing surfaces, not renderer implementation details.

#### Providers

This replaces the old `AI Setup` feeling with a live operational surface.

It should show:

- available provider
- health / availability
- tracking status
- active issues
- quick corrective actions where relevant

#### Shortcuts

This remains utility-focused, but visually aligned with the new control-center structure.

#### About

This becomes a clean product-status surface:

- app version
- update status
- release notes / what’s new entry point
- external links

## 6. Visual System Direction

### 6.1 Mood

The current dark + accent-glow + glass treatment still feels too close to the old product. Calder should move toward a more controlled operations-desk aesthetic.

Desired feeling:

- focused
- crisp
- professional
- confident
- less decorative

### 6.2 Surface hierarchy

Not all regions should use the same panel recipe.

The shell should differentiate:

- `Project Rail`: subdued, matte, background utility surface
- `Live View`: cleanest and most open surface
- `Session Deck`: primary focused work surface with controlled emphasis
- `Ops Rail`: denser support surface with tighter spacing

This hierarchy is important because visual sameness is one of the reasons the product still feels generic.

### 6.3 Color direction

The app should move away from the current pink-forward accent identity.

Preferred accent direction:

- a controlled amber, brass, or warm industrial accent
- or a restrained steel/blue accent if needed for clarity

Regardless of final hue, the system should:

- reduce decorative glow
- use accent for signal and focus, not constant atmosphere
- keep success / warning / error states cleaner and easier to scan

### 6.4 Typography

Typography should remain native-feeling and readable, but with a stronger product-tool rhythm.

Changes:

- shorter section headings
- less dependence on tiny uppercase kickers
- stronger hierarchy in functional headings
- more restraint in supporting text

### 6.5 Shape and depth

The new shell should use:

- slightly tighter radii where appropriate
- more controlled borders
- less softness and less ornamental glow
- hover and active states that feel structural, not flashy

## 7. Empty States and Secondary Surfaces

Current empty states still feel too decorative and too close to onboarding-card UI patterns. They should become simpler, more direct, and more tool-like.

Rules:

- fewer “poster” empty-state treatments in routine product views
- more direct next-step language
- fewer decorative gradients
- more utility-first action framing

Browser new-tab and related empty/default states should also align with the new dual-focus identity and stop leaning on inherited “workspace” language.

## 8. What Must Not Change

This redesign must preserve:

- existing session behavior
- current browser/session operational flow
- provider launch behavior
- PTY/session APIs
- current functional layout logic where it already matches user expectations

This is a shell and UX rewrite around an already working system. Behavior should stay stable unless a UI inconsistency requires a targeted fix.

## 9. Implementation Scope

This design implies changes across:

- renderer shell structure and naming
- settings modal information architecture
- section copy and labels
- global theme variables
- major surface styling
- browser new-tab presentation
- empty states
- contract tests and copy assertions tied to old terminology

It does not require:

- backend/provider architecture changes
- session runtime changes
- PTY contract changes
- browser message routing changes

## 10. Sequencing

Recommended implementation order:

1. replace product language and shell labels
2. reframe the main shell into dual-focus naming and hierarchy
3. redesign settings into the control-center model
4. rework theme tokens and surface differentiation
5. update browser default/empty states
6. refresh tests and contract assertions
7. run full build + test + visual smoke checks

## 11. Success Criteria

The redesign is successful if:

- Calder no longer reads as a recolored derivative of the previous product
- browser + AI together feel like the product core
- settings feel like Calder’s own operational control center
- the app looks more professional, more intentional, and more tool-grade
- functionality remains stable through the redesign
