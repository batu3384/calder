# Calder Architecture Debt Deep Status Report

Date: 2026-04-22 23:06 (+03)
Repo: `/Users/batuhanyuksel/Documents/browser`
Branch: `main`
Working tree basis: `20f07e3` + local uncommitted refactor slice

## 1) Executive Summary

- **Kritik borç kapandı:** aktif source-level circular dependency sayısı **6 -> 0**.
- **Kalite kapıları tam yeşil:**
  - `rtk npm run build` PASS
  - `rtk npm test` PASS (`357/357`, `2531/2531`)
  - `rtk npm run audit:deep` PASS (`ALL CHECKS PASSED`)
- **Monolith fonksiyon hedefi korunuyor:** `>=250 LOC` fonksiyon sayısı **0**.
- **Kalan borç tipi değişti:** artık ana borçlar P1/P2 seviyesinde (coupling yoğunluğu + büyük dosya kümeleri + orta-büyük fonksiyonlar).

## 2) Current Measurement Snapshot

### Graph status
- Nodes: `7523`
- Edges: `80820`
- Files: `822`
- Last graph update: `2026-04-22T23:04:27`

### Function-size debt
- `>=250` lines: **0**
- `>=220` lines: **7**
- `>=200` lines: **16**

Top `>=220` remaining:
1. `createShareDialogFlowController` — 237 ([share-dialog-flow-controller.ts](/Users/batuhanyuksel/Documents/browser/src/renderer/components/share-dialog/share-dialog-flow-controller.ts))
2. `renderAboutPreferencesSection` — 236 ([preferences-modal-sections.ts](/Users/batuhanyuksel/Documents/browser/src/renderer/components/preferences/preferences-modal-sections.ts))
3. `createTabBarBranchMenuController` — 234 ([tab-bar-branch-menu-controller.ts](/Users/batuhanyuksel/Documents/browser/src/renderer/components/tab-bar/tab-bar-branch-menu-controller.ts))
4. `createCustomSelect` — 229 ([custom-select.ts](/Users/batuhanyuksel/Documents/browser/src/renderer/components/custom-select.ts))
5. `createCliSurfaceLayout` — 227 ([pane-elements.ts](/Users/batuhanyuksel/Documents/browser/src/renderer/components/cli-surface/pane-elements.ts))
6. `renderSwarmMode` — 227 ([split-layout.ts](/Users/batuhanyuksel/Documents/browser/src/renderer/components/split-layout.ts))
7. `runProviderUpdate` — 226 ([provider-updater.ts](/Users/batuhanyuksel/Documents/browser/src/main/provider-updater.ts))

### Large-file debt (`>=800` LOC, non-test)
1. [state.ts](/Users/batuhanyuksel/Documents/browser/src/renderer/state.ts) — 1186
2. [mobile-dependency-doctor.ts](/Users/batuhanyuksel/Documents/browser/src/main/mobile-dependency-doctor.ts) — 1146
3. [i18n-translations.ts](/Users/batuhanyuksel/Documents/browser/src/renderer/i18n-translations.ts) — 1111
4. [types.ts](/Users/batuhanyuksel/Documents/browser/src/shared/types.ts) — 1073
5. [mobile-inspector.ts](/Users/batuhanyuksel/Documents/browser/src/main/mobile-inspector.ts) — 989
6. [split-layout.ts](/Users/batuhanyuksel/Documents/browser/src/renderer/components/split-layout.ts) — 965
7. [peer-host.ts](/Users/batuhanyuksel/Documents/browser/src/renderer/sharing/peer-host.ts) — 841
8. [provider-updater.ts](/Users/batuhanyuksel/Documents/browser/src/main/provider-updater.ts) — 827
9. [preferences-modal-sections.ts](/Users/batuhanyuksel/Documents/browser/src/renderer/components/preferences/preferences-modal-sections.ts) — 823

### Coupling signals (current warnings)
1. `renderer-session <-> components-surface` — `253` edge
2. `main-when <-> providers-when` — `49`
3. `main-when <-> hooks-it:` — `21`
4. `main-when <-> mobile-control-bridge-pairing` — `18`
5. `components-surface <-> shared-it:defines` — `16`
6. `main-when <-> calder-governance-policy` — `12`

### Shared types coupling (direct import footprint)
- `src/shared/types` import eden dosya sayısı (source grep): **9**
- Bu footprint artık eski yüksek-coupling dönemine göre ciddi şekilde daha düşük.

## 3) Circular Dependency Audit (Source-level)

Command:
- `rtk proxy npx madge --circular --extensions ts,tsx src/main src/renderer src/shared`

Result:
- `✔ No circular dependency found!`

Verdict:
- **Cycle debt: CLOSED (P0 tamam).**

## 4) This Wave: What Was Closed

Closed in this integration wave:
1. `share-manager <-> remote-terminal-pane` cycle kırıldı.
2. `session-inspector -> split-layout` direkt geri bağımlılığı callback köprüsüyle kaldırıldı.
3. `showSessionTabContextMenu` monolith küçültüldü (hedef altına indirildi).
4. `renderProjectCheckpointSection` monolith küçültüldü (hedef altına indirildi).
5. `createBrowserTabPaneLayout` **217 LOC** seviyesine çekildi.

## 5) Remaining Debt (Non-Critical)

- **P1:** büyük dosya parçalama (özellikle `state.ts`, `mobile-dependency-doctor.ts`, `types.ts`).
- **P1:** top cross-community coupling çiftlerinin düşürülmesi.
- **P2:** `>=220 LOC` kalan 7 fonksiyonun aşamalı extraction ile 180-200 bandına çekilmesi.

## 6) Final Status Verdict

- **Mimari borç bitti mi?** -> **Kritik mimari borç (cycle + kırmızı kalite kapısı) bitti.**
- **Hiç borç kalmadı mı?** -> **Hayır, P1/P2 seviyesinde borç var.**
- **Sistem şu an güvenli/çalışır mı?** -> **Evet.** Build/test/audit:deep aynı dalgada tam PASS.
