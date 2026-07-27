# Dead-code audit — Calder (2026-07-27)

Prompt: `dead-code-audit-prompt-v2.md`

## Codebase context

| Field          | Value                                                                                             |
| -------------- | ------------------------------------------------------------------------------------------------- |
| LANGUAGE(S)    | TypeScript (+ CSS, HTML)                                                                          |
| FRAMEWORK(S)   | Electron (main / preload / renderer)                                                              |
| BUILD SYSTEM   | `tsc` + esbuild + electron-builder                                                                |
| SCALE          | Large (~137k LOC in `src/` + CSS; ~926 TS files)                                                  |
| MONOREPO       | no (single Electron desktop app)                                                                  |
| PUBLIC LIBRARY | no (desktop app; npm `bin` is launcher only)                                                      |
| TEST RUNNER    | Vitest                                                                                            |
| SPECIAL NOTES  | Electron IPC string channels; preload `contextBridge`; Zod schemas; knip via `npm run audit:knip` |

**Assumptions:** Graph index may be stale after isolation deletes; findings verified against current filesystem + grep. Knip reported clean under `knip.jsonc` (many intentional `ignoreIssues`). Depcheck only flagged `@eslint/js` used by `eslint.config.mjs` (false positive).

---

### 1. Findings Table

Grouped by area (Large codebase).

#### Group: renderer styles / ops rail (isolation leftover)

| #   | File                                                    | Line(s)                              | Symbol                                         | Category         | Risk    | Confidence | Exemption checked      | Action           |
| --- | ------------------------------------------------------- | ------------------------------------ | ---------------------------------------------- | ---------------- | ------- | ---------- | ---------------------- | ---------------- |
| 1   | `src/renderer/styles/context-inspector.css`             | ~317–495, 1196+, 1420+, 1758+, 1913+ | `.toolchain-summary*` / `.toolchain-provider*` | UNREACHABLE_DECL | 🔴 HIGH | HIGH       | none (no TS/HTML refs) | DELETE           |
| 2   | `src/renderer/styles/theme-aurora.css`                  | ~649–660, 1078                       | `.toolchain-summary*`                          | UNREACHABLE_DECL | 🔴 HIGH | HIGH       | none                   | DELETE           |
| 3   | `src/renderer/styles/theme-command-studio.css`          | ~1113, 1638                          | `.toolchain-summary-chip` in selectors         | UNREACHABLE_DECL | 🔴 HIGH | HIGH       | none                   | DELETE           |
| 4   | `src/renderer/styles/modals.css`                        | 769–802                              | `.config-item-remove-btn`                      | UNREACHABLE_DECL | 🔴 HIGH | HIGH       | none                   | DELETE           |
| 5   | `src/renderer/styles/context-inspector.css`             | 1102–1130, 1781                      | `.config-item-remove-btn`                      | UNREACHABLE_DECL | 🔴 HIGH | HIGH       | none                   | DELETE           |
| 6   | `src/renderer/styles/utility-controls.contract.test.ts` | 13                                   | asserts `.config-item-remove-btn`              | UNREACHABLE_DECL | 🔴 HIGH | HIGH       | 5 (test of dead CSS)   | DELETE assertion |

**Subtotal:** 6 findings · ~120–180 CSS LOC

#### Group: shared types (post-getConfig)

| #   | File                           | Line(s)  | Symbol                                                                     | Category         | Risk    | Confidence | Exemption checked          | Action |
| --- | ------------------------------ | -------- | -------------------------------------------------------------------------- | ---------------- | ------- | ---------- | -------------------------- | ------ |
| 7   | `src/shared/types-provider.ts` | 101–135  | `McpServer`, `Agent`, `Skill`, `Command`, `ProviderConfig`, `ClaudeConfig` | UNREACHABLE_DECL | 🔴 HIGH | HIGH       | none (only re-exports)     | DELETE |
| 8   | `src/shared/types/provider.ts` | 2–10, 24 | re-exports of #7                                                           | UNREACHABLE_DECL | 🔴 HIGH | HIGH       | 9 (barrel; zero consumers) | DELETE |
| 9   | `src/renderer/types.ts`        | 74–86    | re-exports of #7                                                           | UNREACHABLE_DECL | 🔴 HIGH | HIGH       | 9                          | DELETE |

**Subtotal:** 3 findings · ~40 LOC

#### Group: config-sections / i18n

| #   | File                                                              | Line(s)      | Symbol                                           | Category         | Risk      | Confidence | Exemption checked                              | Action        |
| --- | ----------------------------------------------------------------- | ------------ | ------------------------------------------------ | ---------------- | --------- | ---------- | ---------------------------------------------- | ------------- |
| 10  | `src/renderer/components/config-sections/config-sections.ts`      | 12–14        | `scopeBadge`                                     | UNREACHABLE_DECL | 🔴 HIGH   | HIGH       | none (auto-approval inlines class)             | DELETE        |
| 11  | `src/renderer/components/config-sections/config-sections.test.ts` | 56–60        | `scopeBadge` tests                               | UNREACHABLE_DECL | 🔴 HIGH   | HIGH       | 5                                              | DELETE        |
| 12  | `src/renderer/i18n-translations-core-part-2.ts`                   | 463–466      | `MCP Servers` / `Agents` / `Skills` / `Commands` | UNREACHABLE_DECL | 🔴 HIGH   | HIGH       | none                                           | DELETE        |
| 13  | `src/renderer/i18n-translations-core-part-1.ts`                   | 185          | `Integrations`                                   | UNREACHABLE_DECL | 🟡 MEDIUM | MEDIUM     | 8 (prefs copy?)                                | MANUAL_VERIFY |
| 14  | `src/renderer/i18n-translations-preferences.ts`                   | 24           | `Integrations`                                   | UNREACHABLE_DECL | 🟡 MEDIUM | MEDIUM     | 8                                              | MANUAL_VERIFY |
| 15  | `src/renderer/i18n-translations-core-part-3.ts`                   | 154, 160–161 | `Remove server` / empty MCP copy                 | UNREACHABLE_DECL | 🔴 HIGH   | HIGH       | none (mcp-add gone; inspector has own strings) | DELETE        |
| 16  | `src/renderer/i18n-pattern-translations.ts`                       | 424–436      | toolchain chip patterns                          | UNREACHABLE_DECL | 🔴 HIGH   | HIGH       | none                                           | DELETE        |
| 17  | `src/renderer/i18n.contract.test.ts`                              | ~187–190     | asserts #16 patterns                             | UNREACHABLE_DECL | 🔴 HIGH   | HIGH       | 5                                              | DELETE        |

**Subtotal:** 8 findings · ~30 LOC

#### Group: PTY silence flag (obsolete after process-identity guard)

| #   | File                                                   | Line(s)     | Symbol                                                       | Category                     | Risk    | Confidence | Exemption checked                             | Action           |
| --- | ------------------------------------------------------ | ----------- | ------------------------------------------------------------ | ---------------------------- | ------- | ---------- | --------------------------------------------- | ---------------- |
| 18  | `src/main/pty-manager.ts`                              | 29, 327–332 | `silencedExits`, `consumeSilencedExitFlag`, `isSilencedExit` | UNREACHABLE_DECL / DEAD_FLOW | 🔴 HIGH | HIGH       | none — **no `.add()` anywhere**; always false | DELETE           |
| 19  | `src/main/ipc-pty.ts`                                  | 9, 136–137  | `isSilencedExit` guard                                       | DEAD_FLOW                    | 🔴 HIGH | HIGH       | none                                          | DELETE           |
| 20  | `src/main/ipc-pty.test.ts` / `ipc-pty.runtime.test.ts` | mocks       | silenced exit mocks                                          | UNREACHABLE_DECL             | 🔴 HIGH | HIGH       | 5                                             | DELETE / rewrite |

**Subtotal:** 3 findings · ~25 LOC

#### Group: docs / reports (stale)

| #   | File                                                        | Line(s) | Symbol                   | Category         | Risk   | Confidence | Exemption checked | Action                                    |
| --- | ----------------------------------------------------------- | ------- | ------------------------ | ---------------- | ------ | ---------- | ----------------- | ----------------------------------------- |
| 21  | `docs/reports/security/diff-report-2026-07-27-isolation.md` | —       | `config-watcher.ts` refs | UNREACHABLE_DECL | 🟢 LOW | HIGH       | docs historical   | DONE — moved from root `security-report/` |
| 22  | `docs/reports/security/architecture.md`                     | ~85     | `provider:getConfig`     | UNREACHABLE_DECL | 🟢 LOW | HIGH       | docs              | MANUAL_VERIFY / edit                      |

**Subtotal:** 2 findings

#### Group: tooling / deps

| #   | File                                 | Line(s) | Symbol                            | Category    | Risk   | Confidence | Exemption checked                           | Action                    |
| --- | ------------------------------------ | ------- | --------------------------------- | ----------- | ------ | ---------- | ------------------------------------------- | ------------------------- |
| 23  | `package.json` / `eslint.config.mjs` | —       | `@eslint/js` (depcheck “missing”) | PHANTOM_DEP | 🟢 LOW | LOW        | 8 — used by eslint config                   | SUPPRESS (false positive) |
| 24  | Knip full audit                      | —       | —                                 | —           | —      | —          | knip.jsonc ignores many intentional exports | no action                 |

**Cross-package dead exports:** 0 (not a true npm workspace monorepo for shared packages).

**Files safe to delete entirely:** 0 (all findings are partial file cleanup).

---

### 2. Cleanup Roadmap

**Batch 1 — 🔴 HIGH (safe deletes)**  
Findings: #1–#12, #15–#20  
Est. LOC removed: ~220–280  
Files first (dependency order):

1. `types-provider.ts` type block → barrels (`types/provider.ts`, `renderer/types.ts`)
2. `scopeBadge` + test
3. i18n keys + pattern translations + contract asserts
4. toolchain + remove-btn CSS + utility-controls contract
5. `silencedExits` stack + ipc-pty + tests

Notes: Re-run `npm run lint` + `vitest` after each sub-step. Tooling: knip already green; CSS needs manual strip.

**Batch 2 — 🟡 MEDIUM**  
Findings: #13–#14 (`Integrations` i18n)  
Est. LOC: ~4  
Notes: Grep preferences UI for “Integrations” before delete.

**Batch 3 — 🟢 LOW**  
Findings: #21–#23  
Est. LOC: docs only  
Notes: Security docs live under `docs/reports/security/` (see README); keep `@eslint/js` resolve path.

---

### 3. Executive Summary

| Metric                        |    Count |
| ----------------------------- | -------: |
| Total findings                |       24 |
| 🔴 HIGH risk (safe to delete) |       19 |
| 🟡 MEDIUM risk (verify first) |        2 |
| 🟢 LOW risk (human review)    |        3 |
| HIGH-confidence deletes       |       19 |
| Estimated LOC removed         | ~220–280 |
| Dead imports (PHANTOM_DEP)    |   0 real |
| Cross-package dead exports    |        0 |
| Files safe to delete entirely |        0 |
| Manifest packages to remove   |        0 |

Overall health is good for a Large Electron codebase: knip is clean, isolation removed the main config-read surface, and remaining waste is concentrated leftover UI/CSS/types from that cut plus an obsolete PTY silence flag superseded by process-identity guards. Top-3 actions: (1) strip toolchain/remove-btn CSS, (2) delete ProviderConfig type family + orphan i18n, (3) remove `silencedExits` path now that no writer remains.

---

## Applied cleanup (same day)

**Batch 1 (HIGH):** applied — types, `scopeBadge`, orphan MCP/toolchain i18n + patterns, toolchain/remove-btn CSS, `silencedExits` + ipc-pty path, related tests/contracts.

**Batch 2 (MEDIUM):** applied after verify — `Integrations` only in i18n tables (zero prefs UI refs) → deleted.

**Batch 3 (LOW):** applied — stale `config-watcher` / `provider:getConfig` doc refs cleaned; `@eslint/js` false positive kept.

Verify: `npm run lint` clean; `vitest` re-run after Batch 1–2.
