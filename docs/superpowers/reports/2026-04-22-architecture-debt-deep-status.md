# Calder Architecture Debt Deep Status Report

Date: 2026-04-22 23:16 (+03)
Repo: `/Users/batuhanyuksel/Documents/browser`
Branch: `main`
Working tree basis: `b44ef62` + local uncommitted refactor slice

## 1) Executive Summary

- **Kritik borç kapandı:** aktif source-level circular dependency sayısı **0**.
- **Kalite kapıları tam yeşil:**
  - `rtk npm run build` PASS
  - `rtk npm test` PASS (`357/357`, `2531/2531`)
  - `rtk npm run audit:deep` PASS (`ALL CHECKS PASSED`)
- **Fonksiyon borcu dalga hedefi tamamlandı:** `>=220 LOC` fonksiyon sayısı **0**.
- **Kalan borç tipi:** P1/P2 seviyesinde büyük dosya ve coupling yoğunluğu.

## 2) Current Measurement Snapshot

### Graph status
- Nodes: `7549`
- Edges: `80870`
- Files: `822`
- Last graph update: `2026-04-22T23:13:07`

### Function-size debt
- `>=250` lines: **0**
- `>=220` lines: **0**
- `>=200` lines: **9**

Top `>=200` remaining:
1. `createTerminalPane` — 218 ([terminal-pane.ts](/Users/batuhanyuksel/Documents/browser/src/renderer/components/terminal-pane.ts))
2. `createShareDialogPhaseTwo` — 217 ([share-dialog-phase-two.ts](/Users/batuhanyuksel/Documents/browser/src/renderer/components/share-dialog/share-dialog-phase-two.ts))
3. `createBrowserTabPaneLayout` — 217 ([pane-layout.ts](/Users/batuhanyuksel/Documents/browser/src/renderer/components/browser-tab/pane-layout.ts))
4. `renderPreferencesModalContent` — 214 ([preferences-modal.ts](/Users/batuhanyuksel/Documents/browser/src/renderer/components/preferences/preferences-modal.ts))
5. `renderProjectPreviewCenterSection` — 207 ([preferences-preview-discovery.ts](/Users/batuhanyuksel/Documents/browser/src/renderer/components/preferences/preferences-preview-discovery.ts))
6. `renderGeneralPreferencesSection` — 203 ([preferences-modal-sections.ts](/Users/batuhanyuksel/Documents/browser/src/renderer/components/preferences/preferences-modal-sections.ts))
7. `registerCalderIpcHandlers` — 202 ([ipc-calder.ts](/Users/batuhanyuksel/Documents/browser/src/main/ipc-calder.ts))
8. `restoreProjectCheckpointState` — 201 ([state-checkpoint-restore.ts](/Users/batuhanyuksel/Documents/browser/src/renderer/state-checkpoint-restore.ts))
9. `initializeBrowserTabRuntimeBindings` — 200 ([pane-runtime-bindings.ts](/Users/batuhanyuksel/Documents/browser/src/renderer/components/browser-tab/pane-runtime-bindings.ts))

### Large-file debt (`>=800` LOC, non-test)
1. [state.ts](/Users/batuhanyuksel/Documents/browser/src/renderer/state.ts) — 1186
2. [mobile-dependency-doctor.ts](/Users/batuhanyuksel/Documents/browser/src/main/mobile-dependency-doctor.ts) — 1146
3. [i18n-translations.ts](/Users/batuhanyuksel/Documents/browser/src/renderer/i18n-translations.ts) — 1111
4. [types.ts](/Users/batuhanyuksel/Documents/browser/src/shared/types.ts) — 1073
5. [mobile-inspector.ts](/Users/batuhanyuksel/Documents/browser/src/main/mobile-inspector.ts) — 989
6. [split-layout.ts](/Users/batuhanyuksel/Documents/browser/src/renderer/components/split-layout.ts) — 965
7. [peer-host.ts](/Users/batuhanyuksel/Documents/browser/src/renderer/sharing/peer-host.ts) — 841
8. [provider-updater.ts](/Users/batuhanyuksel/Documents/browser/src/main/provider-updater.ts) — 827
9. [preferences-modal-sections.ts](/Users/batuhanyuksel/Documents/browser/src/renderer/components/preferences/preferences-modal-sections.ts) — 865

### Coupling signals (current warnings)
1. `renderer-session <-> components-surface` — `253` edge
2. `main-when <-> providers-when` — `49`
3. `main-when <-> hooks-it:` — `21`
4. `main-when <-> mobile-control-bridge-pairing` — `18`
5. `components-surface <-> shared-it:defines` — `16`
6. `main-when <-> calder-governance-policy` — `12`

### Shared types coupling (direct import footprint)
- `src/shared/types` import eden dosya sayısı (source grep): **9**

## 3) Circular Dependency Audit (Source-level)

Command:
- `rtk proxy npx madge --circular --extensions ts,tsx src/main src/renderer src/shared`

Result:
- `✔ No circular dependency found!`

Verdict:
- **Cycle debt: CLOSED (P0 tamam).**

## 4) This Wave: What Was Closed

Closed in this integration wave:
1. `createShareDialogFlowController` 237 -> 193
2. `renderAboutPreferencesSection` 236 -> 55
3. `createTabBarBranchMenuController` 234 -> orchestrator-level
4. `createCustomSelect` 229 -> 186
5. `createCliSurfaceLayout` 227 -> 51
6. `renderSwarmMode` 227 -> helper-orchestrated compact flow
7. `runProviderUpdate` 226 -> helper-orchestrated compact flow

## 5) Remaining Debt (Non-Critical)

- **P1:** büyük dosya parçalama (özellikle `state.ts`, `mobile-dependency-doctor.ts`, `types.ts`).
- **P1:** top cross-community coupling çiftlerinin düşürülmesi.
- **P2:** yeni hedef bandı `>=200 LOC` olan 9 fonksiyonun kademeli extraction ile 180-190 aralığına çekilmesi.

## 6) Final Status Verdict

- **Mimari borç bitti mi?** -> **Kritik mimari borç (cycle + kırmızı kalite kapısı + >=220 monolith) bitti.**
- **Hiç borç kalmadı mı?** -> **Hayır, P1/P2 seviyesinde borç var.**
- **Sistem şu an güvenli/çalışır mı?** -> **Evet.** Build/test/audit:deep aynı dalgada tam PASS.
