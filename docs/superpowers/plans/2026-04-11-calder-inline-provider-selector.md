# Calder Inline Provider Selector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a visible provider selector beside `New Session` so Calder can launch new sessions from the current shell selection instead of forcing users to change JSON or open preferences.

**Architecture:** Reuse the existing provider availability cache and persisted `preferences.defaultProvider` field. Add one compact command-deck selector, wire quick session launch and custom-session defaults through the same effective provider helper, and keep unavailable providers visible but not selectable.

**Tech Stack:** Electron renderer, TypeScript, existing custom select component, Vitest contract and unit tests.

---

### Task 1: Lock The Launch Rules In Tests

**Files:**
- Modify: `src/renderer/state.test.ts`
- Modify: `src/renderer/components/tab-bar-command-deck.test.ts`
- Create: `src/renderer/components/tab-bar-provider-selector.test.ts`

- [ ] **Step 1: Write the failing state tests**

Add tests that prove:
- `addSession()` uses `preferences.defaultProvider` when no explicit provider is passed
- `addSession()` still respects an explicit provider when one is passed

- [ ] **Step 2: Run the state test slice to verify it fails if needed**

Run: `npm test -- src/renderer/state.test.ts`
Expected: existing suite passes or the new expectation exposes the missing provider-selection guarantee

- [ ] **Step 3: Write the failing command deck tests**

Add a command-deck contract asserting the source contains the inline provider selector anchor and provider-selector render path, plus a small unit test for the tab-bar provider resolution helper.

- [ ] **Step 4: Run the focused tab-bar tests to verify the new expectations fail**

Run: `npm test -- src/renderer/components/tab-bar-command-deck.test.ts src/renderer/components/tab-bar-provider-selector.test.ts`
Expected: FAIL because the selector and helper do not exist yet

### Task 2: Implement Shared Provider Resolution

**Files:**
- Modify: `src/renderer/components/tab-bar.ts`
- Modify: `src/renderer/components/custom-select.ts`

- [ ] **Step 1: Add a pure helper for effective command-deck provider selection**

Implement helper logic that:
- reads the preferred provider
- falls back to the first available installed provider when the preferred one is unavailable
- falls back to the preferred ID or `claude` only when no availability snapshot exists

- [ ] **Step 2: Extend the custom select so consumers can react to selection changes**

Emit change/input events from the hidden input when a new option is selected, without breaking existing modal and preferences usage.

- [ ] **Step 3: Re-run focused tests**

Run: `npm test -- src/renderer/components/tab-bar-provider-selector.test.ts src/renderer/state.test.ts`
Expected: PASS for the helper/state expectations

### Task 3: Render The Inline Command Deck Selector

**Files:**
- Modify: `src/renderer/index.html`
- Modify: `src/renderer/components/tab-bar.ts`
- Modify: `src/renderer/styles/tabs.css`

- [ ] **Step 1: Add the selector mount point to the command deck**

Place a provider slot immediately beside the primary `New Session` button, inside the existing `#tab-actions` area.

- [ ] **Step 2: Render the selector only when multiple providers are available**

Build the selector from the provider snapshot, disable unavailable providers, and persist user choice via `appState.setPreference('defaultProvider', ...)`.

- [ ] **Step 3: Route quick session creation through the effective provider**

Update `quickNewSession()` so the visible command-deck selection controls which provider a new one-click session uses.

- [ ] **Step 4: Keep `New Custom Session…` aligned**

Use the same effective provider helper so the modal opens with the current command-deck provider preselected.

- [ ] **Step 5: Add compact command-deck styling**

Style the selector to read as a command-deck control, not a generic form field, and avoid crowding the existing top bar.

- [ ] **Step 6: Re-run focused command-deck tests**

Run: `npm test -- src/renderer/components/tab-bar-command-deck.test.ts src/renderer/components/tab-bar-provider-selector.test.ts`
Expected: PASS

### Task 4: Full Verification And Commit

**Files:**
- Verify only

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all Vitest suites pass

- [ ] **Step 2: Run the production build**

Run: `npm run build`
Expected: exit code 0

- [ ] **Step 3: Commit the slice**

```bash
git add docs/superpowers/plans/2026-04-11-calder-inline-provider-selector.md \
  src/renderer/index.html \
  src/renderer/components/custom-select.ts \
  src/renderer/components/tab-bar.ts \
  src/renderer/components/tab-bar-command-deck.test.ts \
  src/renderer/components/tab-bar-provider-selector.test.ts \
  src/renderer/state.test.ts \
  src/renderer/styles/tabs.css
git commit -m "add calder inline provider selector"
```
