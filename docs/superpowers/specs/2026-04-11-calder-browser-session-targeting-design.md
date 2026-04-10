# Calder Browser Session Targeting Design

**Date:** 2026-04-11

**Goal:** Let the browser workspace send inspect, draw, and flow prompts to a user-selected open CLI session by default, while keeping explicit new-session handoff available and fixing provider mismatch bugs.

## Product Diagnosis

Calder's browser workspace currently supports sending page context into AI sessions, but the handoff model is incomplete.

Current problems:
- browser handoff defaults to creating a new session instead of targeting an already open working session
- the browser surface does not show a persistent target session, so users cannot build a stable "inspect here, send there" workflow
- "new session" handoff can inherit the active CLI session provider instead of the visible Command Deck provider selection
- this creates a misleading state where the shell shows one provider, but browser handoff opens or targets another

This is not just a UI gap. It is a product-model mismatch:
- the Command Deck provider selector represents **which provider a new session should launch with**
- the browser workspace needs its own explicit concept of **which existing session should receive browser prompts**

Those are different decisions and must be modeled separately.

## Approved Direction

Add a **browser-local target rail** to the browser workspace that lists open CLI sessions and lets the user select one persistent target session per browser tab.

Behavior:
- inspect, draw, and flow handoff sends to the selected open CLI session by default
- browser/file/diff/remote inspector tabs are excluded from the target list
- the selected target is visibly shown in the browser UI at all times
- `Send to New Session` remains available as an explicit secondary action
- `Send to New Session` always uses the visible Command Deck provider selector, never the active CLI session provider

This separates the two mental models cleanly:
- **Command Deck provider selector** answers: "If I open a new session, which CLI should it use?"
- **Browser target rail** answers: "Which existing session should receive this browser context?"

## Alternatives Considered

### Reuse the active project session as the browser target

This is lower effort, but it keeps the most important choice implicit and fragile. The user can switch tabs for unrelated reasons and silently change browser handoff behavior.

### Force a session picker on every browser handoff

This is explicit, but too slow for a workflow that should feel like a live companion while inspecting a page.

### Recommended: persistent browser-local target rail

This is the best balance of speed, clarity, and low mistake rate. It gives the browser workspace an always-visible destination without polluting the rest of the shell with hidden global state.

## UX Design

### Browser Target Rail

Add a compact side surface inside the browser workspace labeled `Open Sessions`.

The rail should:
- show only open local CLI sessions for the active project
- display session name and provider badge together
- clearly mark the currently selected target
- stay visible while inspecting, drawing, and recording flows
- feel like part of the browser workspace, not a settings sidebar

### Target Summary

The browser toolbar should show a small summary such as:
- `Sending to Codex CLI · Session 3`
- `Sending to Gemini CLI · Fix auth modal`

If no target is selected, the toolbar should show an empty-state warning such as:
- `No target session selected`

### Default Browser Handoff

Primary send actions in inspect, draw, and flow should:
- send the generated prompt into the selected browser target session
- activate that target session after handoff so the user can immediately continue there
- avoid opening a new session unless the user explicitly chooses the new-session path

### Secondary New-Session Handoff

Inspect, draw, and flow should retain a secondary action for creating a new session.

This path should:
- create a new session using the Command Deck provider selector
- no longer derive provider choice from the currently active CLI tab
- continue to use the existing custom/new-session naming patterns

## State Model

The target session choice belongs to the browser tab, not to the whole project and not to the global shell.

Add a persisted browser-target field on browser-tab session records:
- `browserTargetSessionId?: string`

Rules:
- this field is only meaningful for `type: 'browser-tab'`
- each browser tab can remember its own target session
- when the target session still exists, reopening that browser tab restores the target
- when the target session is removed, the browser tab must re-resolve its target instead of silently drifting to another provider

Fallback rules:
1. if `browserTargetSessionId` points to a valid open CLI session, use it
2. else if the active project has an active open CLI session, adopt it as the new browser target
3. else leave the target empty and require explicit selection before default handoff

## Handoff Execution Model

### Send To Existing Open Session

Browser handoff to an existing session needs a real live-send path rather than the current pending-startup prompt flow.

Execution:
1. build the inspect/draw/flow prompt
2. resolve the selected browser target session
3. ensure the target session terminal exists and is spawned
4. write the prompt into that session's PTY as a real message submission
5. switch focus to that session

If the target session exists but is not yet spawned, Calder may still use the startup prompt path for that first open, but the user-facing behavior should remain "send to selected session" rather than "create another session."

### Send To New Session

Browser handoff to a new session should:
1. read the visible Command Deck provider selection
2. create a new session with that explicit provider
3. inject the prompt through the existing startup-prompt mechanism
4. make the new session active

This removes the current bug where browser handoff can follow the active CLI session provider instead of the shell's visible provider choice.

## Error Handling

The browser workspace must fail clearly, not silently.

Rules:
- if no browser target is selected and no valid fallback exists, primary send actions should stop and show a clear inline error
- if the selected target session was closed, the UI should clear or re-resolve the target before the next send attempt
- if PTY delivery to an existing session fails, surface an inline browser error and do not create a surprise replacement session
- if a new-session provider is unavailable, the existing disabled-provider behavior should still block that path

## Technical Touchpoints

Primary files expected to change:
- `src/shared/types.ts`
- `src/renderer/state.ts`
- `src/renderer/components/browser-tab/types.ts`
- `src/renderer/components/browser-tab/pane.ts`
- `src/renderer/components/browser-tab/session-integration.ts`
- `src/renderer/components/browser-tab/draw-mode.ts`
- `src/renderer/components/terminal-pane.ts`
- browser-related styles and contract tests

Expected implementation shape:
- extend browser-tab session state with a persisted target session id
- add state helpers to resolve valid browser target sessions
- add a browser-side target rail renderer and target summary UI
- add a terminal helper for delivering prompts into existing sessions
- make browser new-session paths pass an explicit provider instead of relying on `addPlanSession()` defaults
- keep the rest of the shell's session creation model unchanged

## Non-Goals

This design does not:
- convert readiness/tool/insight alerts to the same targeting model in this pass
- redesign the Command Deck provider selector again
- add cross-project session targeting
- change provider backend argument formats

## Acceptance Criteria

This design is complete when:
- the browser workspace shows a persistent `Open Sessions` target rail
- only open local CLI sessions appear in that target list
- inspect, draw, and flow primary send actions target the selected open session
- browser handoff no longer always opens a new session
- `Send to New Session` remains available as an explicit secondary action
- browser-created new sessions use the visible Command Deck provider selection
- selecting `Gemini` in the shell no longer results in browser handoff unexpectedly opening `Codex`
- closing a target session does not silently send to the wrong remaining session
- tests cover both target-session delivery and explicit new-session provider selection

## Verification Plan

Minimum verification after implementation:
- targeted state tests for browser target persistence and fallback
- targeted browser-session handoff tests for:
  - send to selected existing session
  - empty target behavior
  - target-session removal fallback
  - explicit new-session provider selection
- `npm test`
- `npm run build`
- manual smoke check confirming:
  - a browser tab shows open CLI sessions in the side rail
  - choosing `Codex Session 2` sends inspect/draw/flow prompts into that session
  - `Send to New Session` follows the currently selected Command Deck provider
  - selecting `Gemini` no longer causes browser handoff to open or display `Codex` unless the user explicitly targeted a Codex session
