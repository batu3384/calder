# Terminal Link -> Calder Browser Stabilization Design

Date: 2026-04-14  
Project: Calder (`/Users/batuhanyuksel/Documents/browser`)

## 1. Problem Statement

User intent is simple and strict:

- When clicking a link-looking text in terminal/CLI surface, that URL must open in Calder's embedded browser.
- The click must not cause "mouse stuck / text selection drag" behavior.
- Navigation must not flash target URL and immediately revert to previous page.

Current behavior intermittently fails in two places:

- Interaction layer: link click and text selection can conflict.
- Navigation layer: rapid event chains can cause stale URL rollback.

## 2. Goals and Non-Goals

### Goals

- Single click on terminal-visible HTTP(S)/localhost link opens inside Calder browser surface.
- Link click does not trigger accidental selection-drag side effects.
- Same click producing multiple link events resolves to one navigation.
- Browser route remains on clicked URL (no immediate revert).

### Non-Goals

- No redesign of terminal renderer, capture tools, or viewport system.
- No change to user requirement of single-click behavior (no modifier-key requirement).
- No change to external-link policy outside this link pipeline.

## 3. User Contract (Approved)

- When the text that appears as a link in the terminal is clicked, the link opens in the Calder browser.
- The external browser tab does not open (unless policy explicitly requires external non-http schemes).
- Post-click terminal selection behavior is not broken.
- The address appears for a short time and does not return; The clicked URL is committed permanently.

## 4. Design Options Considered

### Option A - Intent Gate + Navigation Transaction (Recommended)

- Add a dedicated click-intent gate before link dispatch.
- Add navigation transaction guard in browser route handling.
- Keep both OSC8 and WebLinks support, but unify them under one decision path.

Pros:

- Fixes both classes of bug (interaction + revert).
- Preserves compatibility with both explicit OSC8 links and plain URL text.

Cons:

- Requires moderate refactor and additional tests.

### Option B - OSC8-only activation

- Open links only from OSC8 handler; keep WebLinks visual only.

Pros:

- Reduces double-dispatch complexity.

Cons:

- Plain non-OSC URLs may stop opening on click; unacceptable for user expectation.

### Option C - Navigation-only hardening

- Keep terminal click path mostly unchanged; only harden browser route commit logic.

Pros:

- Smaller change scope.

Cons:

- Does not reliably solve mouse selection side effect.

## 5. Recommended Architecture

### 5.1 Link Intent Gate (Renderer: terminal + CLI surface)

Create a shared decision path:

- Collect pointer down/up metadata.
- Treat event as click only if:
  - same pointer sequence,
  - movement below threshold (e.g. 4-6 px),
  - no active text selection.
- If drag/selection is detected, do not dispatch link open.

This isolates link opening from selection gestures and prevents accidental open/select conflicts.

### 5.2 Unified Link Dispatch

For each accepted click:

- Normalize URL (`http(s)` + localhost normalization).
- Generate click-scoped dispatch token.
- Deduplicate OSC8 + WebLinks events to one winner per click token.
- Keep source priority only as tie-breaker (OSC8 preferred when same specificity).

### 5.3 Browser Navigation Transaction Guard

When dispatching to embedded browser:

- Track requested URL transaction (`requestedUrl`, `previousUrl`, `timestamp`).
- Accept committed navigation only for matching/current transaction.
- Ignore stale rollback candidates arriving within short window (revert signature).
- Never override committed URL with stale event from previous transaction.

This prevents flash-then-revert behavior.

## 6. Error Handling and Fallback

- If intent metadata is unavailable, fail-safe to strict no-open on ambiguous drag events.
- If URL normalization fails, no navigation is attempted.
- If transaction state is missing, fall back to existing safe navigation path (no crash).
- Keep existing offline handling for unreachable localhost target.

## 7. Testing Strategy (No-Regression First)

### 7.1 Unit/contract coverage

- Terminal pane:
  - click opens link,
  - drag does not open,
  - selected text + click does not open.
- CLI surface pane:
  - same cases as terminal.
- Link routing:
  - one click -> one dispatch across OSC8/WebLinks.
- Browser pane/index route:
  - stale revert event ignored,
  - valid new transaction committed.

### 7.2 Integration behavior checks

- User flow list:
  - Click `http://localhost:3000/ -> /dashboard`
  - Click `/dashboard`, `/tickets`, `/admin/dashboard`, `/admin/tickets`
  - Verify each click transitions and stays on target URL.

### 7.3 Build and stability

- Run targeted vitest suite for link/navigation surfaces.
- Run full `npm run build`.

Success criteria:

- No selection-stuck behavior during link click.
- URL stays on clicked destination.
- Existing related tests stay green.

## 8. Implementation Boundaries

- Touch only:
  - `src/renderer/components/terminal-pane.ts`
  - `src/renderer/components/cli-surface/pane.ts`
  - `src/renderer/link-routing.ts`
  - browser route guard files (`src/renderer/index.ts`, browser tab route handlers) as needed.
- Do not modify unrelated UI systems.

## 9. External References Used

- xterm.js Link Handling guide: https://xtermjs.org/docs/guides/link-handling/
- xterm.js terminal options / linkHandler docs: https://xtermjs.org/docs/api/terminal/interfaces/iterminaloptions/
- Electron webContents navigation events: https://www.electronjs.org/docs/latest/api/web-contents
- Electron shell API: https://www.electronjs.org/docs/latest/api/shell

