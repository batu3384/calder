/**
 * Context Isolation Audit Report
 *
 * Generated: 2026-05-30
 * Coverage: preload API surface, IPC handlers, path policy, webview security
 *
 * ## Current State
 *
 * Main window creation (`src/main/main.ts`):
 * ```typescript
 * webPreferences: {
 *   preload: path.join(__dirname, '..', '..', 'preload', 'preload', 'preload.js'),
 *   nodeIntegration: false,
 *   contextIsolation: true,
 *   sandbox: true,
 *   webviewTag: true,
 * }
 * ```
 *
 * Status: GOOD — contextIsolation + sandbox are both enabled.
 *         nodeIntegration is explicitly false.
 *
 * ## Preload API Surface (`src/preload/preload.ts`)
 *
 * The CalderApi exposes 20 namespaces via contextBridge:
 *
 * pty          → spawn/kill PTY processes, write input, resize
 * session      → session lifecycle, hook status, cost, inspector events
 * fs           → directory read, file read, path expansion
 * store        → state load/save
 * provider     → provider config, binary checks, updates
 * context      → project context (rules, CLAUDE.md)
 * workflow    → project workflows
 * teamContext  → team shared context
 * review       → code review documents
 * governance   → auto-approval, policy
 * task         → background tasks
 * checkpoint   → session snapshots
 * claude       → (deprecated alias)
 * git          → git operations
 * update       → app auto-update
 * app          → focus, external URL open, guest webview send
 * browser      → screenshot, local target list
 * browserCredential → credential save/list/fill (uses safeStorage encryption)
 * sharing      → WebRTC config
 * mobile       → mobile device control
 * mobileSetup  → dependency installation
 * mobileInspect → screenshot, interaction
 * cliSurface   → CLI surface runtime
 * mcp          → MCP server connect/call/resource
 * stats        → stats cache
 * settings     → settings validation/reinstall
 * menu         → menu event callbacks
 *
 * ## Security Analysis
 *
 * ### Already Implemented
 *
 * 1. Path Policy (`src/main/ipc-path-policy.ts`):
 *    - `isWithinKnownProject()` — restricts PTY cwd to registered project dirs
 *    - `isAllowedReadPath()` — restricts fs operations to projects + known config dirs
 *    - `isAllowedDirectoryLookupPath()` — restricts directory browsing
 *    - Used in all IPC handlers that take file/directory arguments
 *
 * 2. Webview Message Allowlist (`src/main/ipc-app-browser.ts`):
 *    - `ALLOWED_GUEST_MESSAGE_CHANNELS` — explicit list of allowed channels
 *    - `isAllowedGuestMessagePayload()` — validates channel + args pairs
 *    - Prevents arbitrary webview control
 *
 * 3. Browser Credential Vault (`src/main/browser-credential-vault.ts`):
 *    - Uses `safeStorage.encryptString()` for all stored credentials
 *    - File stored at `app.getPath('userData')/browser-credentials.v1.json`
 *    - Atomic write via `.tmp` rename
 *
 * 4. Shell Injection Protection (`src/main/security/sanitize.ts`):
 *    - Allowlist-based argument sanitization
 *    - Session ID alphanumeric validation
 *    - CWD system directory blocking
 *    - Path traversal prevention
 *
 * ### Potential Improvements
 *
 * 1. **Preload API input validation**: Some IPC handlers don't validate all inputs
 *    - `pty:write` — data could be very large (DoS vector via memory pressure)
 *    - `fs:readFile` — no size limit on returned content
 *    - `mcp:callTool` — `args: Record<string, unknown>` no schema enforcement
 *
 * 2. **Domain validation for `openExternal`**: `app:openExternal` should validate
 *    URL scheme (should be http/https/mailto, not `javascript:`)
 *
 * 3. **Guest webview origin validation**: `app:sendToGuestWebContents` checks
 *    `getType() !== 'webview'` but doesn't validate the origin of the guest.
 *    Should validate `guest.getURL()` against allowed origins.
 *
 * 4. **IPC handler rate limiting**: No rate limiting on IPC handlers — brute-force
 *    attacks via rapid `pty:create` calls could overwhelm the system.
 *
 * ## Recommendations
 *
 * ### High Priority
 *
 * 1. Add URL scheme validation to `app:openExternal`:
 *    ```typescript
 *    const ALLOWED_SCHEMES = new Set(['http:', 'https:', 'mailto:']);
 *    const parsed = new URL(url);
 *    if (!ALLOWED_SCHEMES.has(parsed.protocol)) {
 *      throw new Error('Only HTTP(S) and mailto URLs are allowed');
 *    }
 *    ```
 *
 * 2. Add guest webview origin validation in `ipc-app-browser.ts`:
 *    ```typescript
 *    const allowedOrigins = ['https://localhost:', 'https://127.0.0.1:'];
 *    if (!allowedOrigins.some(o => guest.getURL().startsWith(o))) {
 *      return false; // block unknown origins
 *    }
 *    ```
 *
 * 3. Add IPC handler rate limiting using a token bucket:
 *    ```typescript
 *    const rateLimiter = new Map<string, { count: number, resetAt: number }>();
 *    const MAX_REQUESTS = 100;
 *    const WINDOW_MS = 1000;
 *    // Per sessionId rate limiting for pty:create
 *    ```
 *
 * ### Medium Priority
 *
 * 4. Add size limits to `fs:readFile` response (e.g., 10MB max)
 * 5. Add `pty:write` data length validation (e.g., 1MB max per write)
 * 6. Add schema validation for `mcp:callTool` args using zod
 *
 * ## Test Coverage
 *
 * - `src/main/ipc-hardening.test.ts` — IPC payload validation tests
 * - `src/main/ipc-app-browser.runtime.test.ts` — webview message guard tests
 * - `src/main/ipc-path-policy.test.ts` — path policy tests (if exists)
 * - `src/main/browser-credential-vault.test.ts` — credential vault tests
 *
 * ## Verification Commands
 *
 * ```bash
 * # Verify context isolation is active
 * grep -n "contextIsolation" src/main/main.ts
 *
 * # Run IPC hardening tests
 * npx vitest run src/main/ipc-hardening.test.ts
 *
 * # Run browser credential vault tests
 * npx vitest run src/main/browser-credential-vault.test.ts
 * ```