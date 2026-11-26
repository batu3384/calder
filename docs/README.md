# Calder documentation

Canonical entry point for repository documentation. Keep living operational docs current; do not rewrite frozen historical archives except for clearly marked archival indexes.

## Start here

| Document                                                                               | Purpose                                                    |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| [development/workflow.md](development/workflow.md)                                     | Canonical setup, build, test, audit, and pre-push commands |
| [architecture/guardrails.md](architecture/guardrails.md)                               | File-size, modularization, and PR quality guardrails       |
| [architecture/calder-isolation-boundary.md](architecture/calder-isolation-boundary.md) | App/project data ownership and isolation boundary          |
| [architecture/session-evidence.md](architecture/session-evidence.md)                   | Session Evidence architecture and data model               |
| [architecture/hooks-session-state.md](architecture/hooks-session-state.md)             | Hook-event to session-state map                            |

## Current reports and audits

| Area                                   | Contents                                                                          |
| -------------------------------------- | --------------------------------------------------------------------------------- |
| [codebase-audit/](codebase-audit/)     | Dated codebase audit reports and machine-readable JSON companions                 |
| [reports/security/](reports/security/) | Security architecture, verified findings, isolation posture, and finding payloads |
| [reports/](reports/)                   | Dead-code and remediation reports that are not security-specific                  |

## Historical material

| Area                         | Status                                                             |
| ---------------------------- | ------------------------------------------------------------------ |
| [superpowers/](superpowers/) | Frozen architecture/debt sprint plans, specs, and progress reports |
| [archive/](archive/)         | Frozen UI snapshots; not part of the live app                      |

## Related documentation

- User-facing wiki source: [`../wiki/`](../wiki/)
- Contributor guide: [`../CONTRIBUTING.md`](../CONTRIBUTING.md)
- Security policy: [`../SECURITY.md`](../SECURITY.md)
- Release history: [`../CHANGELOG.md`](../CHANGELOG.md)

## Organization rules

- Keep canonical operational docs under `docs/development/` or `docs/architecture/`.
- Date point-in-time reports as `YYYY-MM-DD` and place them in the matching audit/report folder.
- Do not add loose root-level Markdown files for feature documentation; use this taxonomy instead.
- Root Markdown is reserved for GitHub/community conventions (`README`, `CHANGELOG`, `CONTRIBUTING`, `SECURITY`, `CODE_OF_CONDUCT`, license/notice files).
