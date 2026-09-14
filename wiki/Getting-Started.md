# Getting Started

## Requirements

- Node.js **v24** (see `.nvmrc` in the repo)
- npm
- macOS, Linux, or Windows
- At least one supported AI coding CLI installed and authenticated:
  - Claude Code (`claude`)
  - OpenAI Codex CLI (`codex`)
  - Cursor CLI (`cursor`)
  - Antigravity CLI (`antigravity`)

## Install

### Prebuilt (recommended for users)

Download from [GitHub Releases](https://github.com/batu3384/calder/releases):

| Platform | Formats                         |
| -------- | ------------------------------- |
| macOS    | `.dmg`, `.zip`                  |
| Linux    | `.deb`, `.AppImage`             |
| Windows  | NSIS installer, portable `.exe` |

### From source (developers)

```bash
git clone https://github.com/batu3384/calder.git
cd calder
nvm use          # Node 24
npm install
npm run hooks:install
npm run dev
```

`npm start` is equivalent to `npm run dev` (build + launch Electron).

## First launch

1. Open Calder and add or select a project folder.
2. Create a session (`CmdOrCtrl+T` or tab bar **+**).
3. If multiple CLIs are installed, use the inline provider selector on the tab bar; otherwise Calder uses your per-project default (often `claude`).
4. Optional: open **Preferences → Safety** to configure Session Evidence and Pixel Office.

## Provider setup

Calder does **not** store provider API keys in the repo. Credentials live in each CLI’s normal config (`~/.claude`, Cursor login, etc.).

Use **Workspace Center → Provider health** (or Preferences) to verify binaries with `provider:checkBinary`. After an external CLI reinstall, use **Refresh** — Calder re-probes the filesystem without a full app restart.

## Validation (developers)

```bash
npm test                 # Vitest suite
npm run lint
npm run format:check
npm run audit:structure
```

Full gate (also runs on pre-push after `hooks:install`): see [docs/development-workflow.md](https://github.com/batu3384/calder/blob/main/docs/development-workflow.md).

## Next steps

- [Architecture](Architecture) — process boundaries and data paths
- [Troubleshooting](Troubleshooting) — blank UI, missing CLIs, i18n
- [FAQ](FAQ)
