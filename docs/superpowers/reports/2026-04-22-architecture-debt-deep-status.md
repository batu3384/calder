# Calder Architecture Debt Deep Status Report

Date: 2026-04-22 23:24 (+03)
Repo: `/Users/batuhanyuksel/Documents/browser`
Branch: `main`
Working tree basis: `1b64325` + local uncommitted refactor slice

## 1) Executive Summary

- **Kritik mimari borç kapalı:** source-level cycle sayısı `0`.
- **Fonksiyon borcu bu dalgada sıfırlandı:** `>=200 LOC` fonksiyon sayısı `0`.
- **Kalite kapıları tam yeşil:**
  - `rtk npm run build` PASS
  - `rtk npm test` PASS (`357/357`, `2531/2531`)
  - `rtk npm run audit:deep` PASS (`ALL CHECKS PASSED`)

## 2) Current Measurement Snapshot

### Graph status

- Nodes: `7597`
- Edges: `80962`
- Files: `822`
- Last graph update: `2026-04-22T23:21:43`

### Function-size debt

- `>=250` lines: **0**
- `>=220` lines: **0**
- `>=200` lines: **0**

### Large-file debt (`>=800` LOC, non-test)

1. [state.ts](/Users/batuhanyuksel/Documents/browser/src/renderer/state.ts) — 1186
2. [mobile-dependency-doctor.ts](/Users/batuhanyuksel/Documents/browser/src/main/mobile-dependency-doctor.ts) — 1146
3. [i18n-translations.ts](/Users/batuhanyuksel/Documents/browser/src/renderer/i18n-translations.ts) — 1111
4. [types.ts](/Users/batuhanyuksel/Documents/browser/src/shared/types.ts) — 1073
5. [mobile-inspector.ts](/Users/batuhanyuksel/Documents/browser/src/main/mobile-inspector.ts) — 989
6. [split-layout.ts](/Users/batuhanyuksel/Documents/browser/src/renderer/components/split-layout.ts) — 965
7. [peer-host.ts](/Users/batuhanyuksel/Documents/browser/src/renderer/sharing/peer-host.ts) — 841
8. [provider-updater.ts](/Users/batuhanyuksel/Documents/browser/src/main/provider-updater.ts) — 827
9. [preferences-modal-sections.ts](/Users/batuhanyuksel/Documents/browser/src/renderer/components/preferences/preferences-modal-sections.ts) — 886

### Coupling signals (current warnings)

1. `renderer-session <-> components-surface` — `253` edge
2. `main-when <-> providers-when` — `49`
3. `main-when <-> hooks-it:` — `21`
4. `main-when <-> mobile-control-bridge-pairing` — `18`
5. `components-surface <-> shared-it:defines` — `16`
6. `main-when <-> calder-governance-policy` — `12`

## 3) Circular Dependency Audit (Source-level)

Command:

- `rtk proxy npx madge --circular --extensions ts,tsx src/main src/renderer src/shared`

Result:

- `✔ No circular dependency found!`

Verdict:

- **Cycle debt: CLOSED.**

## 4) This Wave: What Was Closed

Closed in this final parallel wave:

1. `createTerminalPane` -> 48 LOC
2. `createShareDialogPhaseTwo` -> 58 LOC
3. `registerCalderIpcHandlers` -> 155 LOC
4. `restoreProjectCheckpointState` -> 44 LOC
5. `initializeBrowserTabRuntimeBindings` -> 183 LOC
6. `createBrowserTabPaneLayout` -> <200 band
7. `renderProjectPreviewCenterSection` -> <200 band
8. `renderGeneralPreferencesSection` -> <200 band
9. `renderPreferencesModalContent` -> <200 band

## 5) Remaining Debt (Non-Critical)

- **P1:** büyük dosya parçalama (`state.ts`, `mobile-dependency-doctor.ts`, `types.ts`, `mobile-inspector.ts`).
- **P1:** cross-community coupling yoğunluğunun düşürülmesi.
- **P2:** kapsamlı branch/test-gap iyileştirmeleri.

## 6) Final Status Verdict

- **Kalanları bitirdik mi?** -> **Evet, bu dalga hedefi olan fonksiyon borçlarını bitirdik.**
- **Kritik kırmızı borç kaldı mı?** -> **Hayır.**
- **Sistem güvenli mi?** -> **Evet.** Build/test/audit:deep tam PASS ve cycle `0`.
