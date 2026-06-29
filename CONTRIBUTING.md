# Calder Development Guide

## Setup

```bash
npm install
npm run build
npm start
```

## Scripts

| Script                  | Description                                 |
| ----------------------- | ------------------------------------------- |
| `npm run build`         | Build all targets (main, preload, renderer) |
| `npm run build:main`    | Build main process only (fast)              |
| `npm run build:preload` | Build preload scripts                       |
| `npm start`             | Build and run Electron app                  |
| `npm test`              | Run all tests                               |
| `npm run lint`          | Run ESLint                                  |
| `npm run format`        | Format code with Prettier                   |

### Verifying Installed CLI provider version(s)

After setup, verify providers are installed:

```bash
claude --version   # Claude Code
codex --version    # Codex CLI
copilot --version   # GitHub Copilot
agy --version      # Antigravity CLI
qwen --version     # Qwen Code
```

## Debugging

### VSCode Debug Configs

1. **Electron: Main Process** — Launch main process with debugger attached
2. **Run Tests** — Run vitest in debug mode
3. **Lint** — Run ESLint

Keybindings:

- `F5` — Start debugging
- `Cmd+Shift+P` → "Tasks: Run Task" → `build:main` for fast rebuilds

### Heap Snapshot (Memory Leak Detection)

```bash
# In the Electron DevTools console:
const v8 = require('v8');
const snapshot = v8.writeHeapSnapshot('/tmp/calder-heap.heapsnapshot');
console.log('Snapshot written to:', snapshot);
```

Then open the `.heapsnapshot` file in Chrome DevTools > Memory tab.

## Architecture

### Process Architecture

```
┌─────────────────────────────────────────────────────────┐
│ Main Process (Node.js / Electron)                       │
│  ├── PTY Manager — native terminal sessions              │
│  ├── Provider Registry — 5 CLI providers                │
│  ├── IPC Handlers — 15+ namespaces                      │
│  ├── Calder Features — context, governance, workflow, etc. │
│  └── Hook System — event file monitoring                 │
├─────────────────────────────────────────────────────────┤
│ Preload (contextBridge)                                 │
│  └── CalderApi — 20 namespaces exposed to renderer         │
├─────────────────────────────────────────────────────────┤
│ Renderer (Vanilla TypeScript SPA)                       │
│  ├── AppState — singleton state with event system        │
│  ├── Components — sidebar, tabbar, terminal panes        │
│  └── Services — git polling, update center, etc.          │
└─────────────────────────────────────────────────────────┘
```

### Key Directories

- `src/main/` — Electron main process
- `src/preload/` — Context bridge API
- `src/renderer/` — UI components and state
- `src/shared/` — Shared types
- `src/main/security/` — Security utilities (sanitizers, audit)
- `src/main/validation/` — Zod schemas for runtime validation
- `src/main/calder-governance/` — Governance engine and enforcement
- `src/main/providers/` — CLI provider implementations

### Security Model

- `contextIsolation: true` + `sandbox: true` enforced
- Shell injection protection via `src/main/security/sanitize.ts`
- IPC input validation via `src/main/validation/schemas.ts`
- Preload API surface audited in `src/main/security/context-isolation-audit.md`
- Secrets audit tool: `src/main/security/secrets-audit.ts`

### State Management

- Renderer state: `src/renderer/state.ts` (AppState singleton)
- Main state: `src/main/store.ts` → `~/.calder/state.json`
- State hydration happens after component init (intentional order)

## Testing

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test file
npx vitest run src/main/security/sanitize.test.ts

# Run in watch mode
npx vitest
```

### Adding Tests

1. Unit tests: alongside source files as `*.test.ts`
2. Contract tests: `src/shared/*.contract.test.ts`
3. Mock utilities: `tests/mocks/` (create as needed)

## TypeScript

Strict mode enabled. No `any` in production code.

Runtime validation via Zod schemas in `src/main/validation/schemas.ts`.

## Adding a New Provider

1. Create `src/main/providers/{provider}-provider.ts`
2. Implement `CliProvider` interface (or extend `BaseCliProvider`)
3. Register in `src/main/providers/registry.ts`
4. Add config watcher paths in `src/main/config-watcher.ts`

## Adding a New IPC Handler

1. Create `src/main/ipc-{domain}.ts`
2. Export `register{Domain}IpcHandlers` function
3. Import and call in `src/main/ipc-handlers.ts`
4. Add tests in `src/main/ipc-{domain}.test.ts`
