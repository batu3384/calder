# Calder Session Targeting Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make visible provider selection authoritative for quick plan-session launches and make browser handoff target a selected open CLI session instead of always creating a new one.

**Architecture:** First, narrow the provider-selection bug by teaching quick plan-session creation to accept an explicit provider override so browser and fix flows stop reading stale active-session state. Then add browser-local session targeting with a persisted target ID, a visible target rail, and a live prompt-delivery path for already-open sessions.

**Tech Stack:** Electron, TypeScript, Vitest, node-pty, DOM-rendered renderer UI

---

### Task 1: Make Plan Session Launch Respect Explicit Provider Choice

**Files:**
- Modify: `src/renderer/state.ts`
- Modify: `src/renderer/components/browser-tab/session-integration.ts`
- Modify: `src/renderer/components/browser-tab/draw-mode.ts`
- Test: `src/renderer/state.test.ts`

- [ ] **Step 1: Write the failing tests**

Add tests covering:
- `addPlanSession(projectId, name, providerOverride)` uses the override instead of `activeSession.providerId`
- browser new-session handoff passes the visible provider through instead of relying on project active session state

- [ ] **Step 2: Run focused tests to verify failure**

Run: `npm test -- src/renderer/state.test.ts`
Expected: FAIL in the new explicit-provider plan-session test until the state helper accepts an override.

- [ ] **Step 3: Implement the minimal state/API fix**

Update `addPlanSession()` to accept an optional `providerId?: ProviderId` override. When present, use it for both provider resolution and plan-mode args. Update browser new-session entry points to pass the persisted visible default provider explicitly.

- [ ] **Step 4: Re-run focused tests**

Run: `npm test -- src/renderer/state.test.ts`
Expected: PASS for the new override coverage.

- [ ] **Step 5: Commit**

`git add src/renderer/state.ts src/renderer/components/browser-tab/session-integration.ts src/renderer/components/browser-tab/draw-mode.ts src/renderer/state.test.ts && git commit -m "respect explicit provider in plan sessions"`

### Task 2: Add Browser-Local Open Session Targeting

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/renderer/state.ts`
- Modify: `src/renderer/components/browser-tab/types.ts`
- Modify: `src/renderer/components/browser-tab/pane.ts`
- Modify: `src/renderer/components/browser-tab/session-integration.ts`
- Modify: `src/renderer/components/browser-tab/draw-mode.ts`
- Modify: `src/renderer/components/terminal-pane.ts`
- Modify: `src/renderer/styles/browser-tab.css`
- Test: `src/renderer/state.test.ts`
- Test: `src/renderer/components/browser-tab/*.test.ts` or new focused browser handoff test file

- [ ] **Step 1: Write the failing tests**

Add tests covering:
- browser-tab session records can store `browserTargetSessionId`
- target resolution prefers stored open CLI session, falls back to active CLI session, then empty
- browser handoff to selected existing session writes into that session instead of creating a new one
- browser handoff leaves explicit `Send to New Session` working with the visible provider choice

- [ ] **Step 2: Run focused tests to verify failure**

Run the smallest new browser/state scopes with `npm test -- <focused test files>`
Expected: FAIL because browser sessions cannot yet persist or resolve a target and there is no live-send helper.

- [ ] **Step 3: Implement minimal persistent browser target state**

Add `browserTargetSessionId` to browser-tab sessions, plus helper methods in `state.ts` to:
- list open local CLI sessions for a project
- resolve a valid browser target session
- set/clear browser target session
- repair invalid targets on session removal

- [ ] **Step 4: Implement live prompt delivery**

Add a terminal helper that can:
- detect whether a target session already has a spawned PTY
- send prompt text plus submission newline into that live PTY
- fall back to pending-startup prompt when the session exists but has not spawned yet

- [ ] **Step 5: Implement browser UI targeting**

Update browser pane rendering to add:
- `Open Sessions` side rail
- selected target summary in browser chrome/toolbar
- primary send actions that target the selected session
- secondary new-session action that still creates a new session explicitly

- [ ] **Step 6: Re-run focused tests**

Run the focused browser/state tests again.
Expected: PASS for target resolution and live handoff behavior.

- [ ] **Step 7: Run full verification**

Run:
- `npm test`
- `npm run build`

Expected:
- all tests pass
- build succeeds

- [ ] **Step 8: Commit**

`git add src/shared/types.ts src/renderer/state.ts src/renderer/components/browser-tab/types.ts src/renderer/components/browser-tab/pane.ts src/renderer/components/browser-tab/session-integration.ts src/renderer/components/browser-tab/draw-mode.ts src/renderer/components/terminal-pane.ts src/renderer/styles/browser-tab.css <focused test files> && git commit -m "add browser session targeting"`
