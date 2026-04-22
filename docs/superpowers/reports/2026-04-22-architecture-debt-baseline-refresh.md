# Architecture Debt Baseline Refresh (2026-04-22)

## Scope

Phase-0 refresh snapshot for the 2026-04-22 architecture debt closure execution.

## Repository and Graph Snapshot

- Branch: `main`
- HEAD: `b309151`
- Working tree at snapshot: clean before Phase-0 mutation
- `code-review-graph status --repo /Users/batuhanyuksel/Documents/browser`
  - Nodes: `6603`
  - Edges: `74772`
  - Files: `597`
  - Last updated: `2026-04-22T00:18:00`

## Phase-0 Gate Unblock

### Root cause

`npm run audit:deep` failed on dead-code scan with one unused declaration file:

- `src/renderer/qrcode.d.ts`

### Fix applied

- Removed `src/renderer/qrcode.d.ts`.
- `qrcode` usage remains provided by package typings (`src/renderer/components/share-dialog.ts` imports `qrcode`).

## Validation Matrix (Maximum Safety)

Executed in order after the fix:

1. Targeted:
   - `npm test -- src/renderer/components/share-dialog.test.ts` PASS
2. Build:
   - `npm run build` PASS
3. Full test:
   - `npm test` PASS (`334` files / `2447` tests)
4. Graph diff signal:
   - `code-review-graph detect-changes --base HEAD~1 --brief`
   - Risk score: `0.40`
   - Changed files: `3`
   - Test gaps: `8` (existing known cluster in `cli-surface` semantic helpers)
5. Phase exit deep gate:
   - `npm run audit:deep` PASS
   - Includes shuffle seeds, coverage lane, full-boundary coverage lane, build, production audit, pinned knip lane

## Refreshed Hotspot Snapshot

- `src/renderer/state.ts`: `1536` lines
- `src/main/mobile-inspector.ts`: `1490` lines
- `src/renderer/components/cli-surface/pane.ts`: `1422` lines
- `src/main/mobile-dependency-doctor.ts`: `1408` lines
- `src/renderer/components/browser-tab/pane.ts`: `1382` lines
- `src/renderer/components/preferences-modal.ts`: `1288` lines
- `src/renderer/components/share-dialog.ts`: `1278` lines
- `src/renderer/components/mobile-surface/pane.ts`: `1173` lines
- `src/shared/types.ts`: `1072` lines

## Monolith Function Snapshot

- `createBrowserTabPane` (`src/renderer/components/browser-tab/pane.ts`): `1268` lines
- `showPreferencesModal` (`src/renderer/components/preferences-modal.ts`): `1205` lines
- `showShareDialog` (`src/renderer/components/share-dialog.ts`): `754` lines
- `ensureInstance` (`src/renderer/components/cli-surface/pane.ts`): `526` lines
- `renderInspectWorkbench` (`src/renderer/components/mobile-surface/pane.ts`): `410` lines
- `buildStatusLinePython` (`src/main/statusline-template.ts`): `777` lines

## Coupling and Cycle Signal

- `src/shared/types.ts` remains top local coupling hub (`52` importers, local-import graph).
- No local import SCC cycle detected (`SCC count > 1 = 0`).

## Next Action

Proceed to Phase-1 decomposition (`browser-tab/pane.ts` and `preferences-modal.ts`) while preserving source contracts and API behavior.
