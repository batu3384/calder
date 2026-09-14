# FAQ

## General

### What is Calder?

A desktop Electron app for running multiple AI coding CLI sessions in one workspace, with embedded browser, session telemetry, and governance.

### Which CLIs are supported?

| Provider ID   | CLI              |
| ------------- | ---------------- |
| `claude`      | Claude Code      |
| `codex`       | OpenAI Codex CLI |
| `cursor`      | Cursor CLI       |
| `antigravity` | Antigravity CLI  |

Capability depth (cost parsing, hooks, auto-approval) varies by adapter.

### Is Calder affiliated with Anthropic, OpenAI, Cursor, or Google?

No. Independent project; not endorsed by CLI vendors.

## Install & run

### Do I need Node to use a release build?

No. Releases are packaged Electron apps. Node 24 is only required to build from source.

### Why is there no hot reload in dev?

Documented limitation: `npm run dev` rebuilds and restarts Electron. Hot reload is on the [Roadmap](Roadmap) as a future improvement, not shipped yet.

### Where are my settings stored?

Under `~/.calder/` and per-project `<project>/.calder/`. Provider secrets stay in each CLI’s own config directories — see [Security](Security).

## Sessions & evidence

### What is Session Evidence?

Optional local JSONL capture of redacted tool/governance/git-window events per terminal session. Stored under `~/.calder/evidence/{runId}/`. Disable in **Preferences → Safety**.

### What is Pixel Office?

An optional inspector visualization driven by Evidence events. **Off** / **Office** in Preferences. Turn off if you want less CPU use.

### Can I share a Calder session with a teammate?

No peer-to-peer session sharing. Sessions are local to your Electron instance.

## Browser tools

### Inspect vs Draw vs Flow?

- **Inspect** — DOM selector + match verification → prompt to CLI
- **Draw** — screenshot annotation when selectors fail
- **Flow** — record/replay click steps with shadow-DOM-aware selectors

All route through the same governance-aware prompt delivery path.

## Contributing & security

### How do I contribute?

See [CONTRIBUTING.md](https://github.com/batu3384/calder/blob/main/CONTRIBUTING.md). PRs must pass structure audit, lint, format, build, and tests.

### How do I report a vulnerability?

Private advisory or maintainer email — [Security](Security). Do not file public issues for exploitable bugs.

## Wiki

### How is this wiki updated?

Maintainers edit `wiki/` in the repo and run `./scripts/sync-wiki.sh`. See `wiki/README.md` in the tree (not published here).
