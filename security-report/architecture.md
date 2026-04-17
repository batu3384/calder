# Architecture Mapping

## Technology Detection

### Language and File Summary

- TypeScript: 314 files (~51,853 LOC)
- JavaScript: 2 files (~251 LOC)
- HTML: 1 file (108 LOC)
- CSS: 23 files (~8,314 LOC)
- Total scanned source/UI lines: ~60,582

### Frameworks and Core Libraries

- Electron desktop app
  - Evidence: `package.json` (`electron`, `electron-builder`, `main`, `build`, `mac.hardenedRuntime`) and `src/main/main.ts`
- Vanilla TypeScript renderer + preload bridge
  - Evidence: `src/renderer/index.ts`, `src/preload/preload.ts`, `src/renderer/index.html`
- Terminal/PTy stack
  - Evidence: `node-pty`, `@xterm/*`, `src/main/pty-manager.ts`, `src/renderer/components/terminal-pane.ts`
- MCP client integration
  - Evidence: `@modelcontextprotocol/sdk`, `src/main/mcp-client.ts`
- P2P sharing (WebRTC)
  - Evidence: `src/renderer/sharing/peer-host.ts`, `src/renderer/sharing/peer-guest.ts`, `src/renderer/sharing/share-crypto.ts`

### Data Storage

- No visible SQL/NoSQL database
- No ORM detected
- Persistent app state stored as JSON:
  - `~/.calder/state.json` (`src/main/store.ts`)
- Temporary screenshots in system temp:
  - `os.tmpdir()/calder-screenshots` (`src/main/ipc-handlers.ts`)

## Application Type

- Desktop app (Electron)
- Monolithic repository layout
- CLI orchestrator for local AI coding CLIs
- Embedded browser surface (`<webview>`)

## Entry Point Map

### Primary Startup Path

- App bootstrap: `src/main/main.ts`
- Main window security baseline:
  - `nodeIntegration: false`
  - `contextIsolation: true`
  - `sandbox: false`
  - `webviewTag: true`
- Renderer entry: `src/renderer/index.ts`
- Preload bridge: `src/preload/preload.ts`

### Renderer -> Main IPC Surface

This app relies on Electron IPC (not a traditional HTTP backend). Operational channels are available through preload and are treated as `[NO AUTH]` in this architecture inventory.

#### `[NO AUTH]` PTY / CLI Session Management

- `pty:create`, `pty:createShell`, `pty:write`, `pty:resize`, `pty:kill`, `pty:getCwd`
- `cli-surface:start`, `cli-surface:discover`, `cli-surface:stop`, `cli-surface:restart`, `cli-surface:write`, `cli-surface:resize`
- Main handlers: `src/main/ipc-handlers.ts`
- Primary sink: OS-level PTY and process execution (`src/main/pty-manager.ts`)

#### `[NO AUTH]` File System / Project Discovery

- `fs:isDirectory`, `fs:expandPath`, `fs:listDirs`, `fs:browseDirectory`, `fs:listFiles`, `fs:readFile`, `fs:watchFile`, `fs:unwatchFile`
- Guardrail: `isAllowedReadPath()` allowlist in `src/main/ipc-handlers.ts`

#### `[NO AUTH]` Git and IDE Helpers

- `git:getStatus`, `git:getRemoteUrl`, `git:getFiles`, `git:getDiff`, `git:getWorktrees`
- `git:stageFile`, `git:unstageFile`, `git:discardFile`, `git:watchProject`
- `git:listBranches`, `git:checkoutBranch`, `git:createBranch`, `git:openInEditor`

#### `[NO AUTH]` App / External URL / Browser Surface

- `app:getVersion`, `app:getBrowserPreloadPath`, `app:openExternal`, `app:focus`
- `browser:saveScreenshot`, `browser:listLocalTargets`
- Guardrail: `app:openExternal` enforces `http/https` only (`src/main/ipc-handlers.ts`)

#### `[NO AUTH]` Providers / Readiness / Stats / Settings

- `provider:getConfig`, `provider:getMeta`, `provider:listProviders`, `provider:checkBinary`
- `session:buildResumeWithPrompt`, `readiness:analyze`, `stats:getCache`
- `settings:reinstall`, `settings:validate`

#### `[NO AUTH]` MCP Client Surface

- `mcp:connect`, `mcp:disconnect`
- `mcp:listTools`, `mcp:listResources`, `mcp:listPrompts`
- `mcp:callTool`, `mcp:readResource`, `mcp:getPrompt`
- `mcp:addServer`, `mcp:removeServer`

Approximate visible IPC handler count: ~65

### Local HTTP Entry Point

- `POST /open` in `src/main/browser-bridge.ts`
  - Purpose: route external open requests to Calder embedded browser
  - Auth: token header (`X-Calder-Token`)
  - Bind: random port on `127.0.0.1`

### Webview / DOM Event Entry Points

- `element-selected`
- `flow-element-picked`
- `draw-stroke-end`
- Source: `src/preload/browser-tab-preload.ts`

### P2P / WebRTC Entry Surface

- Host path: `src/renderer/sharing/peer-host.ts`
- Guest path: `src/renderer/sharing/peer-guest.ts`
- Channel message types: `init`, `data`, `resize`, `input`, `ping`, `pong`, `auth-challenge`, `auth-response`, `auth-result`, `end`

### Scheduled / Watcher Surfaces

- Auto-updater periodic checks: `src/main/auto-updater.ts`
- Resume-on-power events: `src/main/main.ts`
- Git watcher: `src/main/git-watcher.ts`
- File watcher: `src/main/file-watcher.ts`
- Session watchers: `src/main/codex-session-watcher.ts`, `src/main/blackbox-session-watcher.ts`

## Data Flow (Source -> Process -> Sink)

### Sources

- Renderer user input (paths, URLs, MCP endpoints, share codes, PINs, project roots, profile configuration)
- Webview DOM event payloads (selectors, text snippets, page URLs)
- Local bridge requests (`POST /open` with `url`, `cwd`, `preferEmbedded`)
- Remote network endpoints (MCP servers, updater endpoints, localhost probing)
- CLI output and session watcher files

### Processing

- Path resolution and allowlist checks (`isWithinKnownProject()`, `isAllowedReadPath()`)
- URL normalization and protocol checks (`openUrlWithBrowserPolicy()`, `app:openExternal`)
- Browser inspection metadata generation (`browser-tab-preload.ts`)
- P2P crypto (PBKDF2 + AES-GCM + HMAC challenge-response in `share-crypto.ts`)
- Markdown/rich content sanitization (DOMPurify in `src/renderer/components/file-reader.ts`)
- Provider health/readiness processing (`src/main/ipc-handlers.ts`, `src/shared/tracking-health.ts`)

### Sinks

- OS process and PTY execution (`node-pty`, provider binary launches)
- File reads/writes (`fs:readFile`, `store.save`, screenshot temp writes)
- External URL opens (`shell.openExternal`)
- Outbound HTTP connections (MCP connect, updater traffic, localhost probe)
- WebRTC data channels
- Renderer DOM updates (`innerHTML`/manual node creation in several components)

## Trust Boundaries

### 1. Renderer <-> Main

- Bridge: `contextBridge.exposeInMainWorld('calder', api)`
- Risk: broad operational IPC exposure without app-level authz controls
- Existing controls: `nodeIntegration: false`, `contextIsolation: true`

### 2. Main <-> OS / Filesystem / Subprocesses

- PTY/process launches, git commands, file IO, shell execution
- Risk: renderer-influenced inputs can reach privileged OS operations

### 3. Embedded Web Content <-> Host Renderer

- Webview preload sends selected DOM context back to host
- Risk: untrusted page content may influence handoff flows and UI behavior

### 4. Local Loopback Bridge <-> Other Local Processes

- `127.0.0.1` bridge endpoint with token-based access
- Risk: local process abuse if token handling is weak

### 5. Remote Peer <-> P2P Share Session

- Offer/answer + passphrase flows for shared terminal session state
- Risk: unauthorized access and session data leakage under weak secrets

## Authentication and Authorization Notes

- No traditional account/session auth model in application runtime
- Security model primarily assumes trusted local desktop context
- P2P sharing has dedicated auth flow (passphrase + challenge-response)
- Sensitive app configuration/state lives under `~/.calder/`

## Existing Security Controls

- Electron hardening baseline (`nodeIntegration: false`, `contextIsolation: true`)
- Path allowlist checks for file reads
- Protocol restrictions for external opens (`http/https`)
- DOMPurify usage on markdown rendering paths
- Token-protected localhost browser bridge
- Screenshot size/age pruning in temporary storage paths

## Phase-2 Priority Review Notes

- IPC surface breadth (`[NO AUTH]` channels) remains a primary review target
- `webviewTag: true` with `sandbox: false` requires ongoing scrutiny
- Terminal/PTY command execution flows need strict input review
- Embedded browser routing and external-open policy should be regression-tested
- P2P sharing and MCP connectivity remain high-impact data and trust boundaries
