# Calder security reports

Canonical location for security architecture, audits, and post-change verification.

| Document                                                                     | Purpose                                                   |
| ---------------------------------------------------------------------------- | --------------------------------------------------------- |
| [SECURITY-REPORT.md](./SECURITY-REPORT.md)                                   | Full assessment (2026-04-12 baseline)                     |
| [verified-findings.md](./verified-findings.md)                               | Confirmed vuln list from baseline scan                    |
| [architecture.md](./architecture.md)                                         | English architecture / trust-boundary map                 |
| [FIX-IMPACT-ANALYSIS.md](./FIX-IMPACT-ANALYSIS.md)                           | Pre-fix breakage analysis for baseline findings           |
| [dependency-audit.md](./dependency-audit.md)                                 | npm dependency audit notes                                |
| [findings/](./findings/)                                                     | Machine-oriented finding payloads (AUTH-\*, etc.)         |
| [isolation-status.md](./isolation-status.md)                                 | **Current** post-isolation executive summary (2026-07-27) |
| [isolation-architecture.md](./isolation-architecture.md)                     | Turkish isolation boundary + write-path map               |
| [isolation-verified-findings.md](./isolation-verified-findings.md)           | Isolation refactor verified fixes (VF-\*)                 |
| [diff-report-2026-07-27-isolation.md](./diff-report-2026-07-27-isolation.md) | Diff-scoped scan for isolation WIP                        |
| [diff-report-2026-07-30-element-cli.md](./diff-report-2026-07-30-element-cli.md) | Diff-scoped scan for Element→CLI capture hardening        |

**Start here for current posture:** [isolation-status.md](./isolation-status.md)

Local `security-report/` at repo root is gitignored; commit curated summaries here instead.

Historical note: P2P share / mobile remote removed 2026-07-27 — VULN-003 marked `REMEDIATED_BY_REMOVAL`.
