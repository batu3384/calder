# Calder Single-Active CLI Launcher Design

**Date:** 2026-04-17  
**Project:** Calder (`/Users/batuhanyuksel/Documents/browser`)

## Goal

Make the top launcher show only the active CLI with its full real name, while keeping multi-provider switching fast, visually calm, and consistent across the shell.

## Problem Diagnosis

Calder already solved the basic discoverability problem for multi-provider session launch, but the current top-bar treatment is no longer the right product shape.

Current issues:

- the launcher shows multiple provider chips at once, which makes the shell feel busier than the rest of the UI
- the row can look like a model picker instead of a CLI/provider picker
- responsive breakpoints create visual pressure, clipping, and awkward partial labels
- short-name fallbacks reduce visual breakage but weaken clarity and product confidence
- some secondary surfaces still risk drifting into provider-specific hardcoded copy instead of reading from the same provider metadata source

The user-approved direction is to stop optimizing the crowded multi-chip row and instead move to a clearer “one active CLI, one switcher” model.

## Approved Direction

Replace the visible multi-chip provider strip with a **single active CLI capsule** in the top launcher.

Behavior:

- the launcher shows only the active CLI
- the label uses the provider’s full display name, for example `Claude Code`, `Codex CLI`, `GitHub Copilot`, `Gemini CLI`, `MiniMax CLI`
- the active CLI capsule opens a switcher popover listing all installed providers
- choosing a provider updates the next quick-launch target through the existing `preferences.defaultProvider`
- the update button and new-session button remain separate actions, not part of the provider label
- the shell language treats this surface as a **CLI selector**, not a model selector

This keeps the shell fast without looking overcrowded.

## Alternatives Considered

### Option A - Keep the multi-chip row and polish spacing

Pros:

- lowest code churn
- preserves the latest interaction work

Cons:

- still looks crowded as provider count grows
- still invites confusion between CLI and model identity
- still creates responsive breakage pressure

### Option B - Single active CLI capsule with popover switcher (Approved)

Pros:

- cleanest top-bar rhythm
- scales well as more providers are installed
- preserves full names without needing short labels
- matches premium shell behavior better than a chip rack

Cons:

- requires a small interaction redesign instead of a pure CSS pass

### Option C - Hide provider choice behind settings or add-session menu only

Pros:

- simplest visual shell

Cons:

- hurts discoverability
- slows down routine provider switching

## UX Contract

### 1. Launcher Surface

The provider area in `#session-launcher` becomes one deliberate control:

- one capsule only
- one provider only
- full provider name only
- one down-arrow affordance for switching

The control should read like part of the Calder command deck, not like a form field dropped into the top bar.

### 2. Switcher Popover

Clicking the active capsule opens a provider switcher that:

- lists all providers from provider metadata
- uses full display names
- shows unavailable providers as disabled
- clearly marks the active selection
- closes after selection and immediately affects quick session launch

The switcher is a provider-switching surface, not a settings surface.

### 3. Terminology Rules

This area must consistently talk about:

- `CLI`
- `provider`
- `session target`

It must not visually imply:

- model switching
- prompt profile switching
- per-session runtime status

Model names belong inside provider-specific sessions, not in the top launcher identity control.

### 4. Responsive Rules

The full active CLI name must be preserved as the priority label in normal desktop widths.

Responsive priority:

1. keep the active CLI capsule readable
2. keep action buttons usable
3. simplify surrounding spacing
4. only then allow truncation in extremely narrow states

The shell must never return to the previous “half-visible chip” failure mode.

### 5. Secondary Surface Consistency

The same provider metadata source should drive labels across:

- top launcher
- context inspector / right rail provider pill
- terminal pane provider badge
- CLI surface target labels
- session history labels where applicable

No surface should hardcode `Claude Code` as a generic fallback when another provider is actually active.

## Technical Touchpoints

Primary files expected to change:

- `src/renderer/components/tab-bar.ts`
- `src/renderer/provider-availability.ts`
- `src/renderer/index.html`
- `src/renderer/styles/tabs.css`
- `src/renderer/styles/theme-aurora.css`
- `src/renderer/components/context-inspector.ts`
- `src/renderer/components/terminal-pane.ts`
- `src/renderer/components/cli-surface/pane.ts`

Primary tests expected to change:

- `src/renderer/components/tab-bar-command-deck.test.ts`
- `src/renderer/components/tab-bar-provider-selector.test.ts`
- `src/renderer/styles/command-deck.contract.test.ts`
- `src/renderer/styles/theme-contract.test.ts`
- targeted provider-label contract coverage for secondary surfaces

## Risk Management

### Risk 1 - Full names still overflow in medium widths

Mitigation:

- remove the multi-chip row entirely
- widen the single provider control budget
- prioritize the active capsule before optional spacing polish

### Risk 2 - Shell copy drifts between surfaces

Mitigation:

- centralize on `getProviderDisplayName()` where possible
- remove local short-name maps from launcher code
- add contract tests against hardcoded stale provider labels

### Risk 3 - Provider switcher feels like a settings control

Mitigation:

- keep it inside the launcher shell
- style it like an operational command-deck control
- keep switching one-click and immediate

## Acceptance Criteria

This design is complete when:

- the top launcher shows only one active CLI capsule
- the active capsule uses the provider’s full display name
- multi-provider switching happens through a popover, not through multiple persistent chips
- the launcher no longer uses short display-name aliases
- the shell no longer shows stale provider identity in the right rail or other active-session surfaces
- focused tests and build pass
- manual smoke check confirms no clipped or half-visible provider controls in normal desktop widths

## Verification Plan

Minimum verification after implementation:

- focused provider-launcher contract tests
- focused command-deck stylesheet tests
- focused provider-label consistency tests for secondary surfaces
- `npm test -- <targeted files>`
- `npm run build`
- manual smoke check that:
  - only one active CLI is visible in the launcher
  - the popover lists all providers with full names
  - switching the active CLI changes the next quick session target
  - the right rail reflects the actual active session provider
