# Calder Wiki

**Calder** is a terminal-centric Electron workspace for parallel AI coding CLI sessions — Claude Code, Codex, Cursor CLI, and Antigravity in one shell with embedded browser, session telemetry, and project governance.

Repository: [github.com/batu3384/calder](https://github.com/batu3384/calder)

## Quick links

| Topic                            | Page                               |
| -------------------------------- | ---------------------------------- |
| Install & first run              | [Getting Started](Getting-Started) |
| Main / preload / renderer layout | [Architecture](Architecture)       |
| Common problems                  | [Troubleshooting](Troubleshooting) |
| Short answers                    | [FAQ](FAQ)                         |
| Threat model & reporting         | [Security](Security)               |
| Now / Next / Later plan          | [Roadmap](Roadmap)                 |

## What Calder does

- **Multi-session workspace** — one PTY-backed terminal per CLI session, per project
- **Provider-aware launch** — defaults, resume, mixed-provider layouts
- **Session telemetry** — hook-driven status, cost signals, Context Inspector timeline
- **Browser + terminal** — inspect elements, draw annotations, route prompts to the active session
- **Governance** — auto-approval with global, project, and session precedence
- **Session Evidence** — local redacted JSONL runs; optional Pixel Office visualization

Supported provider IDs: `claude`, `codex`, `cursor`, `antigravity`.

## Canonical repo docs

These live in the main tree (not duplicated here in full):

- [README](https://github.com/batu3384/calder/blob/main/README.md) — product overview
- [docs/development-workflow.md](https://github.com/batu3384/calder/blob/main/docs/development-workflow.md) — setup, test, CI commands
- [SECURITY.md](https://github.com/batu3384/calder/blob/main/SECURITY.md) — vulnerability reporting
- [CONTRIBUTING.md](https://github.com/batu3384/calder/blob/main/CONTRIBUTING.md) — contribution guide

## Status

- **CI:** [![CI](https://github.com/batu3384/calder/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/batu3384/calder/actions/workflows/ci.yml)
- **Latest codebase audit:** [docs/codebase-audit/2026-08-16.md](https://github.com/batu3384/calder/blob/main/docs/codebase-audit/2026-08-16.md)
- **Roadmap:** [Roadmap](Roadmap)
