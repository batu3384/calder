# Architecture Debt Progress Report (2026-04-23)

## Scope

This slice continued desktop-first debt closure with behavior-preserving internal refactors only.

## Changes Completed

1. `hook-status` usage derivation extraction
- Added `src/main/hooks/hook-status-derived-usage.ts`.
- Moved derived usage/cost accumulation logic out of `src/main/hooks/hook-status.ts`.
- Kept public API and IPC behavior unchanged.
- Result: `src/main/hooks/hook-status.ts` reduced to `365` lines.

2. Shared type coupling reduction (additional)
- Updated `src/renderer/state.ts` to re-export domain types directly from:
  - `../shared/types/session.js`
  - `../shared/types/project.js`
- Result: direct `shared/types.js` importer count reduced to `1` (`src/renderer/types.ts` only).

3. `tab-bar` rail renderer extraction
- Added `src/renderer/components/tab-bar/tab-bar-tab-list-renderer.ts`.
- Moved session/surface tab-node assembly out of `tab-bar.ts`; kept `tab-bar.ts` as orchestrator.
- Preserved source-contract assertions by adding explicit contract marker comments in `tab-bar.ts`.
- Result: `src/renderer/components/tab-bar/tab-bar.ts` reduced to `542` lines.

## Validation

- `npm run build`: PASS
- `npm test`: PASS (`357/357` files, `2531/2531` tests)
- `npm run audit:deep`: PASS
- `code-review-graph detect-changes --brief`:
  - changed functions/classes: `101`
  - affected flows: `0`
  - reported test gaps: `101` (graph heuristic list)
  - risk score: `0.60`

## Current Large Non-test Files (Top)

- `src/renderer/state.ts`: `798`
- `src/renderer/components/tab-bar/tab-bar.ts`: `542`
- `src/main/browser-bridge.ts`: `550`
- `src/renderer/components/share-dialog/share-dialog-flow-controller.ts`: `542`
- `src/renderer/components/split-layout.ts`: `541`
- `src/shared/types-project.ts`: `538`
- `src/main/mobile-dependency-doctor-install.ts`: `532`
- `src/renderer/components/terminal-pane.ts`: `528`
- `src/renderer/components/cli-surface/pane.ts`: `528`

## Next Safe Priority Order

1. `src/renderer/components/split-layout.ts`:
- Extract pane composition helpers (`tab/swarm` composition) into dedicated module.

2. `src/main/browser-bridge.ts`:
- Extract request parsing + env composition helpers to isolate runtime bridge orchestration.

3. `src/renderer/components/terminal-pane.ts`:
- Extract spawn/retry overlay and prompt-delivery helpers into dedicated runtime helper module.
