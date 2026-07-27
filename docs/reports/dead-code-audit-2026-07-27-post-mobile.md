# Dead-code audit — 2026-07-27 (post mobile/remote removal)

## Codebase context

| Field          | Value                                                                               |
| -------------- | ----------------------------------------------------------------------------------- |
| LANGUAGE(S)    | TypeScript                                                                          |
| FRAMEWORK(S)   | Electron (main / preload / renderer)                                                |
| BUILD SYSTEM   | `tsc` + esbuild + electron-builder                                                  |
| SCALE          | Large (~src/ Electron app; ~926 TS files before removal wave)                       |
| MONOREPO       | no (empty `apps/` removed this pass)                                                |
| PUBLIC LIBRARY | no                                                                                  |
| TEST RUNNER    | Vitest                                                                              |
| SPECIAL NOTES  | Persist migrate paths may compare legacy string kinds (`mobile`, `remote-terminal`) |

Tooling: `npm run audit:knip` (knip@6) + disk residual greps. Legacy session/surface cleanup lives only in `src/main/store.ts` persist **v2** migration (`CURRENT_PERSISTED_STATE_VERSION`).

---

### 1. Findings Table

#### `src/renderer/`

| #   | File                                         | Line(s)            | Symbol                                    | Category         | Risk    | Confidence | Exemption checked        | Action        |
| --- | -------------------------------------------- | ------------------ | ----------------------------------------- | ---------------- | ------- | ---------- | ------------------------ | ------------- |
| 1   | `styles/tabs.css`                            | ~1201–1279 + media | `.tab-action-handoff*`, `.tab-action-mcp` | UNREACHABLE_DECL | 🔴 HIGH | HIGH       | none — no HTML/TS setter | DELETE (done) |
| 2   | `i18n-translations-core-part-1.ts`           | 69                 | `Open secure handoff panel`               | UNREACHABLE_DECL | 🔴 HIGH | HIGH       | none — key unused        | DELETE (done) |
| 12  | `dom-utils.ts` (+ surface re-export + tests) | 20–41              | `createPassphraseInput`                   | UNREACHABLE_DECL | 🔴 HIGH | HIGH       | none — share UI gone     | DELETE (done) |

#### `apps/`

| #   | File    | Line(s) | Symbol                       | Category         | Risk    | Confidence | Exemption checked | Action        |
| --- | ------- | ------- | ---------------------------- | ---------------- | ------- | ---------- | ----------------- | ------------- |
| 3   | `apps/` | —       | empty dir (`.DS_Store` only) | UNREACHABLE_DECL | 🔴 HIGH | HIGH       | none              | DELETE (done) |

#### `docs/reports/security/` (stale live pointers)

| #   | File                                                          | Line(s)       | Symbol                  | Category         | Risk      | Confidence | Exemption checked       | Action                                     |
| --- | ------------------------------------------------------------- | ------------- | ----------------------- | ---------------- | --------- | ---------- | ----------------------- | ------------------------------------------ |
| 4   | `SECURITY-REPORT.md` / `verified-findings.md` / `AUTH-1.json` | VULN-003      | P2P PIN finding as open | DEAD_FLOW (doc)  | 🟡 MEDIUM | HIGH       | historical audit record | UPDATE status REMEDIATED_BY_REMOVAL (done) |
| 5   | `FIX-IMPACT-ANALYSIS.md`                                      | baseline cmds | share-dialog tests      | UNREACHABLE_DECL | 🟡 MEDIUM | HIGH       | none                    | UPDATE (done)                              |
| 6   | `iyilestirme-raporu-2026-04-24.md`                            | 537           | share-dialog path       | UNREACHABLE_DECL | 🟢 LOW    | HIGH       | historical report       | UPDATE path list (done)                    |

#### Keep (false positives / migrate)

| #   | File                                                                  | Symbol                        | Category                            | Risk      | Confidence                              | Exemption                                        | Action                                                       |
| --- | --------------------------------------------------------------------- | ----------------------------- | ----------------------------------- | --------- | --------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------ | ---------------------------- |
| 7   | `main/store.ts`                                                       | migrate v1→v2                 | legacy `mobile` / `remote-terminal` | DEAD_FLOW | 🟢 LOW                                  | HIGH                                             | persist migrate only                                         | KEEP (single load-time path) |
| 8   | knip unused exported types (`SessionRecord`, provider route types, …) | CROSS_PKG_EXPORT lookalike    | 🟢 LOW                              | LOW       | re-export / public shared types (#6/#9) | SUPPRESS / ignoreIssues                          |
| 9   | `docs/superpowers/**`, `docs/archive/**`                              | historical share/mobile paths | —                                   | 🟢 LOW    | HIGH                                    | archive history                                  | KEEP (do not rewrite archaeology)                            |
| 10  | `security-report/` (repo root)                                        | isolation WIP summary         | —                                   | 🟡 MEDIUM | MEDIUM                                  | parallel short report vs `docs/reports/security` | CONSOLIDATED → `docs/reports/security/isolation-*.md` (done) |
| 11  | knip `pgrep` unlisted binary                                          | PHANTOM_DEP lookalike         | 🟢 LOW                              | HIGH      | OS binary via shell, not npm            | none                                             |

Subtotals: HIGH actionable 3 (all deleted) · MEDIUM doc 3 (updated) · KEEP/LOW 5

---

### 2. Cleanup Roadmap

**Batch 1 — HIGH (done this session)**  
Findings #1–#3 · ~80 LOC CSS + 1 i18n row + empty `apps/`  
Touch order: CSS → i18n → `rm -rf apps`  
Gotcha: CSS `@container` block must stay after primary styles (already repaired).

**Batch 2 — MEDIUM docs (done)**  
Findings #4–#6 · mark VULN-003 remediated; stop pointing CI/test lists at deleted share suites.

**Batch 3 — LOW / human**  
#10 root `security-report/` consolidated under `docs/reports/security/` (see README).  
#9 `docs/superpowers/**` + `docs/archive/**` — README + frozen banner on stale reports (done).
#7 migrate string guards removed — consolidated in `store.ts` persist v2 migration (`CURRENT_PERSISTED_STATE_VERSION`).

Suggested tooling (already used): `npm run audit:knip`, residual `rg` for product strings.

---

### 3. Executive Summary

| Metric                            | Count                     |
| --------------------------------- | ------------------------- |
| Total findings                    | 12                        |
| 🔴 HIGH risk (safe to delete)     | 4                         |
| 🟡 MEDIUM risk (verify first)     | 4                         |
| 🟢 LOW risk (human review)        | 4                         |
| HIGH-confidence deletes           | 4 (applied)               |
| Estimated LOC removed (this pass) | ~120                      |
| Dead imports (PHANTOM_DEP)        | 0 npm packages            |
| Cross-package dead exports        | 0 (knip type noise only)  |
| Files safe to delete entirely     | 0 remaining runtime files |
| Manifest packages to remove       | 0 (`qrcode` already gone) |

Health: mobile/remote removal left little runtime waste; knip clean on files/deps. Leftover was CSS/i18n for deleted handoff button, empty `apps/`, and security docs still speaking as if P2P lived. Top-3 done: kill handoff/MCP CSS, kill orphan i18n + empty apps, close VULN-003 as removal.
