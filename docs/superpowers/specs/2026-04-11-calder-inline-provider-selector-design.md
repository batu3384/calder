# Calder Inline Provider Selector Design

**Date:** 2026-04-11

**Goal:** Let users choose which CLI provider a new session should launch with directly from the app shell, without editing JSON, while preserving the current one-click session creation flow.

## Product Diagnosis

Calder already supports multiple providers at the session level, but the main creation flow still hides provider choice behind preferences or the custom session modal.

Current behavior:
- the primary `New Session` button creates a session with `preferences.defaultProvider`
- the custom session modal exposes provider choice only when multiple providers are available
- changing the default provider today is effectively a settings task, not a session-launch task

This creates friction for users who actively switch between Claude, Codex, Gemini, or Copilot during the day. The capability exists, but the shell does not surface it where the decision is actually made.

## Approved Direction

Add a **persistent inline provider selector** immediately next to the primary `New Session` action in the Command Deck.

Behavior:
- the provider selector is always visible when more than one provider is available
- the selected provider becomes the launch target for the one-click `New Session` button
- the selection is persisted through the existing `preferences.defaultProvider` field
- `New Custom Session…` inherits the currently selected provider as its default value
- unavailable providers remain visible but cannot be selected

This keeps Calder fast:
- one click still starts a session
- the provider decision becomes explicit and local to session creation
- no extra modal is forced into the primary flow

## Alternatives Considered

### Always open a provider picker before creating a session

This is the most explicit option, but it slows down the most common action and breaks the current fast-launch rhythm.

### Put provider choice only inside the add-session context menu

This is lower effort, but it keeps provider switching hidden and does not solve the main discoverability problem.

### Recommended: persistent inline selector beside `New Session`

This is the best balance of speed, visibility, and low implementation risk.

## UX Requirements

### Command Deck

Add a compact provider selector adjacent to `New Session`.

The selector should:
- feel like part of the Command Deck, not like a settings control
- show the active provider display name, not raw internal IDs
- support disabled entries for missing binaries
- be compact enough not to dominate the top bar

### One-Click Launch

Pressing `New Session` should:
- create `Session N` as today
- use the currently selected provider instead of silently reading an unseen JSON/default-only setting
- preserve existing args behavior

### Custom Session Modal

`New Custom Session…` should:
- open with the current inline provider preselected
- still allow choosing another provider inside the modal
- remain compatible with projects that only have one available provider

### Persistence

Changing the inline selector should:
- update `preferences.defaultProvider`
- survive reload/relaunch
- immediately affect the next quick session launch

## Non-Negotiable Constraints

1. Do not remove the existing quick one-click session creation behavior.
2. Do not require a modal for the primary `New Session` action.
3. Do not change how PTYs are spawned or how provider backends work.
4. Do not break projects with a single provider installed.
5. Do not expose provider internals or JSON paths in the UI.

## Technical Touchpoints

Primary files expected to change:
- `src/renderer/index.html`
- `src/renderer/components/tab-bar.ts`
- `src/renderer/state.ts`
- `src/renderer/styles/tabs.css`
- related contract tests for Command Deck behavior

Expected implementation shape:
- add a dedicated Command Deck provider control near `btn-add-session`
- reuse provider availability data already loaded in `tab-bar.ts`
- route quick session creation through the selected provider
- keep `appState.addSession()` compatible with explicit provider IDs

## Risk Management

Main risks:
- making the Command Deck too crowded
- creating disagreement between the inline selector and modal defaults
- allowing selection of unavailable providers

Mitigation:
- render the selector only when multiple providers exist
- derive both quick launch and modal defaults from the same persisted selection
- disable unavailable providers in both surfaces

## Acceptance Criteria

This design is complete when:
- the shell shows an inline provider selector next to `New Session` when applicable
- one-click session launch uses the visible selection
- `New Custom Session…` inherits the same selected provider
- the selected provider persists through app reload
- tests cover the new contract
- existing build and test suites still pass

## Verification Plan

Minimum verification after implementation:
- targeted contract test for the inline provider selector
- targeted interaction test for quick session provider selection
- `npm test`
- `npm run build`
- manual smoke check that:
  - switching the selector changes the provider used by `New Session`
  - custom session modal opens with the same provider selected
  - unavailable providers cannot be chosen
