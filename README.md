<p align="center">
  <img src="build/calder-black.png" alt="Calder" width="128" />
</p>

<h1 align="center">Calder</h1>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="License" /></a>
  <a href="https://github.com/batu3384/calder"><img src="https://img.shields.io/badge/GitHub-calder-181717?logo=github" alt="GitHub Repository" /></a>
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Linux%20%7C%20Windows-0A7" alt="Platforms" />
</p>

<p align="center">
  <strong>Desktop workspace for AI coding CLIs.</strong><br/>
  Run multiple agent sessions in parallel, inspect costs/context, route browser + terminal signals to the right session, and keep project workflows organized.
</p>

---

## Overview

Calder is an Electron-based, terminal-centric IDE designed for teams and solo developers who work heavily with AI coding CLIs.

Instead of juggling many terminal tabs and losing thread context, Calder gives you:

- Multi-session orchestration per project
- Provider-aware launch and resume flows
- Real-time session telemetry (status, usage, inspector events)
- Browser + terminal surfaces that can hand off focused prompts to active sessions
- Collaboration features such as encrypted P2P session sharing

## Supported AI Coding CLIs

Calder currently supports these provider IDs in the codebase:

- `claude` (Claude Code)
- `codex` (OpenAI Codex CLI)
- `copilot` (GitHub Copilot CLI)
- `gemini` (Gemini CLI)
- `qwen` (Qwen Code)
- `minimax` (MiniMax CLI)
- `blackbox` (Blackbox CLI)

You can set defaults per project and run mixed-provider sessions side-by-side.

## Core Capabilities

### 1) Multi-Session Workspace

- Multiple sessions per project, each backed by its own PTY
- Fast tab switching and session history navigation
- Mosaic and tab-focused layouts
- Session labels, indicators, unread states, and resume support

### 2) Session Telemetry & Cost Insight

- Hook-based session status (`working`, `waiting`, `input`, `completed`)
- Usage/cost context pipeline with provider-aware parsing
- Session Inspector timeline and tool event visibility
- Smart warnings when tracking is unavailable or context pressure is high

### 3) Live View + CLI Surface

- Open local or remote URLs inside Calder
- Inspect page context and route targeted instructions to a chosen session
- Attach local dev commands, inspect terminal output, and forward compact summaries
- Keep browser findings, CLI output, and coding actions inside one flow

### 4) Context & Governance Layer

- Project-level context discovery and scaffold support
- Shared/team context integration paths
- Auto-approval governance with global, project, and session-level precedence
- Provider-aware approval dispatch where supported

### 5) Collaboration

- Encrypted WebRTC-based P2P session sharing
- Read-only / read-write collaboration modes
- Session catalog + active-session synchronization over data channels

## System Requirements

- Node.js `v24` (see `.nvmrc`)
- npm (bundled with Node)
- One or more supported AI coding CLIs installed and authenticated
- macOS, Linux, or Windows

## Installation

### Option A: Prebuilt Releases

Use assets published in GitHub Releases when available.

- macOS: `.dmg` / `.zip`
- Linux: `.deb` / `.AppImage`
- Windows: NSIS installer / portable `.exe`

### Option B: Build From Source

```bash
git clone https://github.com/batu3384/calder.git
cd calder
npm install
npm start
```

## Development

### Common Commands

```bash
npm run dev                # Build and run Electron
npm run build              # Compile main/preload + bundle renderer
npm test                   # Run full test suite (Vitest)
npm run test:coverage      # Run tests with coverage
npm run test:critical-stability
npm run audit:deep         # Deep project audit script
```

### Packaging Commands

```bash
npm run pack               # Build unpacked app
npm run dist               # Build distributables via electron-builder
```

Electron Builder targets are configured in `package.json` (`mac`, `linux`, `win`).

## Architecture Snapshot

```text
src/
  main/         Electron main process, providers, PTY/session orchestration,
                governance, hooks, IPC handlers
  preload/      Secure bridge APIs exposed to renderer
  renderer/     UI, panels, browser/live-view, session components
  shared/       Shared runtime types and contracts
apps/
  calder-mobile/  Companion mobile workspace (React Native)
```

## Keyboard-First Workflow

Calder is designed around shortcuts and fast panel/session switching. A dedicated shortcuts system supports defaults plus per-user overrides.

Common examples:

- New session: `CmdOrCtrl+T`
- Alternate new session: `CmdOrCtrl+Shift+N`
- New project: `CmdOrCtrl+Shift+P`
- Toggle sidebar: `CmdOrCtrl+B`
- Session inspector: `CmdOrCtrl+Shift+I`

## Security Notes

- Renderer-to-main communication is explicit through preload IPC surfaces.
- Session sharing uses encrypted peer-to-peer transport (WebRTC data channels).
- Security policy and reporting instructions are available in [SECURITY.md](SECURITY.md).

## Contributing

Contributions are welcome.

- Start with [CONTRIBUTING.md](CONTRIBUTING.md)
- Follow [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
- For security-sensitive findings, use [SECURITY.md](SECURITY.md)

## License

[MIT](LICENSE)

---

<p align="center">
  <sub>Calder is an independent project and is not affiliated with or endorsed by Anthropic, OpenAI, Google, GitHub, Alibaba, MiniMax, or Blackbox.</sub>
</p>
