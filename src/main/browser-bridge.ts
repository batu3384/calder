import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import { randomBytes } from 'crypto';
import type { AddressInfo } from 'net';
import type { EmbeddedBrowserOpenPayload } from '../shared/types';
import { isMac, isWin, pathSep } from './platform';
import { isAllowedExternalUrl } from './browser-open-policy';

interface BrowserBridgeState {
  launcherPath: string;
  shimDir: string;
  nodeHookPath: string;
  token: string;
  url: string;
  server: http.Server;
  realOpenPath?: string;
  realXdgOpenPath?: string;
}

let bridgeState: BrowserBridgeState | null = null;

function createLauncherScript(): string {
  return `#!/bin/sh
TARGET="$1"
if [ -z "$TARGET" ]; then
  exit 1
fi

BRIDGE_URL="\${CALDER_BROWSER_BRIDGE_URL:-}"
BRIDGE_TOKEN="\${CALDER_BROWSER_BRIDGE_TOKEN:-}"
CURRENT_CWD="\${CALDER_BROWSER_BRIDGE_CWD:-\${PWD:-$(pwd)}}"
ALLOW_EXTERNAL_FALLBACK="\${CALDER_BROWSER_BRIDGE_ALLOW_EXTERNAL_FALLBACK:-}"

if [ -n "$BRIDGE_URL" ] && [ -n "$BRIDGE_TOKEN" ]; then
  if curl -fsS -X POST \\
    -H "X-Calder-Token: $BRIDGE_TOKEN" \\
    --data-urlencode "url=$TARGET" \\
    --data-urlencode "cwd=$CURRENT_CWD" \\
    --data-urlencode "preferEmbedded=1" \\
    "$BRIDGE_URL" >/dev/null 2>&1; then
    exit 0
  fi
fi

if [ "$ALLOW_EXTERNAL_FALLBACK" != "1" ]; then
  exit 1
fi

if [ -n "$CALDER_BROWSER_BRIDGE_REAL_OPEN" ]; then
  exec "$CALDER_BROWSER_BRIDGE_REAL_OPEN" "$TARGET"
fi

if [ -n "$CALDER_BROWSER_BRIDGE_REAL_XDG_OPEN" ]; then
  exec "$CALDER_BROWSER_BRIDGE_REAL_XDG_OPEN" "$TARGET"
fi

exit 1
`;
}

function createUrlShim(realCommandEnvName: string): string {
  return `#!/bin/sh
REAL_CMD="\${${realCommandEnvName}:-}"
TARGET=""
ALLOW_EXTERNAL_FALLBACK="\${CALDER_BROWSER_BRIDGE_ALLOW_EXTERNAL_FALLBACK:-}"

for arg in "$@"; do
  case "$arg" in
    http://*|https://*) TARGET="$arg" ;;
  esac
done

if [ -n "$TARGET" ] && [ -n "$CALDER_BROWSER_BRIDGE_LAUNCHER" ]; then
  "$CALDER_BROWSER_BRIDGE_LAUNCHER" "$TARGET"
  STATUS=$?
  if [ "$STATUS" -eq 0 ]; then
    exit 0
  fi
fi

if [ -n "$TARGET" ] && [ "$ALLOW_EXTERNAL_FALLBACK" != "1" ]; then
  exit 1
fi

if [ -n "$REAL_CMD" ]; then
  exec "$REAL_CMD" "$@"
fi

exit 1
`;
}

function createNodeOpenHookScript(): string {
  return `'use strict';

const childProcess = require('node:child_process');
const Module = require('node:module');
const path = require('node:path');

const launcher = process.env.CALDER_BROWSER_BRIDGE_LAUNCHER;
if (launcher) {
  const OPEN_COMMANDS = new Set(['open', 'xdg-open', 'start']);
  const FORCE_PLAYWRIGHT_HEADLESS = process.env.CALDER_PLAYWRIGHT_FORCE_HEADLESS !== '0';
  const PLAYWRIGHT_MODULES = new Set(['playwright', 'playwright-core', '@playwright/test']);
  const WRAPPED_PAGE = Symbol.for('calder.playwright.page');
  const WRAPPED_CONTEXT = Symbol.for('calder.playwright.context');
  const WRAPPED_BROWSER = Symbol.for('calder.playwright.browser');
  const WRAPPED_BROWSER_TYPE = Symbol.for('calder.playwright.browserType');
  const WRAPPED_EXPORTS = Symbol.for('calder.playwright.exports');

  function normalizeCommandName(command) {
    if (typeof command !== 'string' || command.length === 0) return '';
    const base = path.basename(command).toLowerCase();
    return base.endsWith('.exe') ? base.slice(0, -4) : base;
  }

  function looksLikePlaywrightBrowserCommand(command, args) {
    if (!FORCE_PLAYWRIGHT_HEADLESS) return false;
    if (typeof command !== 'string' || command.length === 0) return false;
    if (!Array.isArray(args)) return false;
    const normalizedPath = command.toLowerCase();
    const commandName = normalizeCommandName(command);
    const looksLikeBrowserName = /(?:chrome|chromium|msedge|edge|firefox|webkit)/.test(commandName);
    if (!looksLikeBrowserName) return false;
    const fromPlaywrightCache = normalizedPath.includes('ms-playwright') || normalizedPath.includes('playwright');
    const fromPlaywrightFlags = args.some((arg) =>
      typeof arg === 'string' && (
        arg.includes('--remote-debugging-pipe')
        || arg.startsWith('--user-data-dir=')
      )
    );
    return fromPlaywrightCache || fromPlaywrightFlags;
  }

  function ensureHeadlessFlag(args) {
    const nextArgs = [...args];
    const hasHeadless = nextArgs.some((arg) => typeof arg === 'string' && arg.startsWith('--headless'));
    if (!hasHeadless) {
      nextArgs.push('--headless=new');
    }
    return nextArgs;
  }

  function forceHeadlessLaunchOptions(options) {
    if (!FORCE_PLAYWRIGHT_HEADLESS) return options;
    if (!options || typeof options !== 'object') {
      return { headless: true };
    }
    const nextOptions = { ...options };
    if (nextOptions.headless !== true) {
      nextOptions.headless = true;
    }
    return nextOptions;
  }

  function markWrapped(target, marker) {
    if (!target || (typeof target !== 'object' && typeof target !== 'function')) return;
    try {
      Object.defineProperty(target, marker, { value: true, configurable: false });
    } catch {
      try { target[marker] = true; } catch {}
    }
  }

  function isWrapped(target, marker) {
    return Boolean(target && target[marker]);
  }

  const originalSpawn = childProcess.spawn;

  function mirrorUrlToCalder(url) {
    if (typeof url !== 'string' || !/^https?:\\/\\//i.test(url)) return;
    try {
      const child = originalSpawn.call(childProcess, launcher, [url], {
        stdio: 'ignore',
        detached: true,
      });
      if (child && typeof child.unref === 'function') {
        child.unref();
      }
    } catch {}
  }

  function wrapPage(page) {
    if (!page || typeof page !== 'object') return page;
    if (isWrapped(page, WRAPPED_PAGE)) return page;
    markWrapped(page, WRAPPED_PAGE);

    if (typeof page.goto === 'function') {
      const originalGoto = page.goto.bind(page);
      page.goto = async function patchedGoto(url, ...rest) {
        if (typeof url === 'string') {
          mirrorUrlToCalder(url);
        }
        return originalGoto(url, ...rest);
      };
    }
    return page;
  }

  function wrapContext(context) {
    if (!context || typeof context !== 'object') return context;
    if (isWrapped(context, WRAPPED_CONTEXT)) return context;
    markWrapped(context, WRAPPED_CONTEXT);

    if (typeof context.newPage === 'function') {
      const originalNewPage = context.newPage.bind(context);
      context.newPage = async function patchedNewPage(...args) {
        const page = await originalNewPage(...args);
        return wrapPage(page);
      };
    }
    if (typeof context.pages === 'function') {
      const originalPages = context.pages.bind(context);
      context.pages = function patchedPages(...args) {
        const pages = originalPages(...args);
        return Array.isArray(pages) ? pages.map((page) => wrapPage(page)) : pages;
      };
    }
    return context;
  }

  function wrapBrowser(browser) {
    if (!browser || typeof browser !== 'object') return browser;
    if (isWrapped(browser, WRAPPED_BROWSER)) return browser;
    markWrapped(browser, WRAPPED_BROWSER);

    if (typeof browser.newPage === 'function') {
      const originalNewPage = browser.newPage.bind(browser);
      browser.newPage = async function patchedBrowserNewPage(...args) {
        const page = await originalNewPage(...args);
        return wrapPage(page);
      };
    }
    if (typeof browser.newContext === 'function') {
      const originalNewContext = browser.newContext.bind(browser);
      browser.newContext = async function patchedBrowserNewContext(...args) {
        const context = await originalNewContext(...args);
        return wrapContext(context);
      };
    }
    if (typeof browser.contexts === 'function') {
      const originalContexts = browser.contexts.bind(browser);
      browser.contexts = function patchedContexts(...args) {
        const contexts = originalContexts(...args);
        return Array.isArray(contexts) ? contexts.map((ctx) => wrapContext(ctx)) : contexts;
      };
    }
    return browser;
  }

  function wrapBrowserType(browserType) {
    if (!browserType || typeof browserType !== 'object') return browserType;
    if (isWrapped(browserType, WRAPPED_BROWSER_TYPE)) return browserType;
    markWrapped(browserType, WRAPPED_BROWSER_TYPE);

    if (typeof browserType.launch === 'function') {
      const originalLaunch = browserType.launch.bind(browserType);
      browserType.launch = async function patchedLaunch(options) {
        const browser = await originalLaunch(forceHeadlessLaunchOptions(options));
        return wrapBrowser(browser);
      };
    }
    if (typeof browserType.launchPersistentContext === 'function') {
      const originalLaunchPersistent = browserType.launchPersistentContext.bind(browserType);
      browserType.launchPersistentContext = async function patchedLaunchPersistent(userDataDir, options) {
        const context = await originalLaunchPersistent(userDataDir, forceHeadlessLaunchOptions(options));
        return wrapContext(context);
      };
    }
    if (typeof browserType.connect === 'function') {
      const originalConnect = browserType.connect.bind(browserType);
      browserType.connect = async function patchedConnect(...args) {
        const browser = await originalConnect(...args);
        return wrapBrowser(browser);
      };
    }
    if (typeof browserType.connectOverCDP === 'function') {
      const originalConnectOverCDP = browserType.connectOverCDP.bind(browserType);
      browserType.connectOverCDP = async function patchedConnectOverCDP(...args) {
        const browser = await originalConnectOverCDP(...args);
        return wrapBrowser(browser);
      };
    }

    return browserType;
  }

  function patchPlaywrightExports(loaded) {
    if (!loaded || typeof loaded !== 'object') return loaded;
    if (isWrapped(loaded, WRAPPED_EXPORTS)) return loaded;
    markWrapped(loaded, WRAPPED_EXPORTS);
    wrapBrowserType(loaded.chromium);
    wrapBrowserType(loaded.firefox);
    wrapBrowserType(loaded.webkit);
    return loaded;
  }

  function extractHttpUrl(args) {
    if (!Array.isArray(args)) return null;
    for (const arg of args) {
      if (typeof arg !== 'string') continue;
      const lowered = arg.toLowerCase();
      if (lowered.startsWith('http://') || lowered.startsWith('https://')) {
        return arg;
      }
    }
    return null;
  }

  function resolveEmbeddedTarget(command, args) {
    if (!OPEN_COMMANDS.has(normalizeCommandName(command))) return null;
    return extractHttpUrl(args);
  }

  childProcess.spawn = function patchedSpawn(command, args, options) {
    const parsedArgs = Array.isArray(args) ? args : [];
    const target = resolveEmbeddedTarget(command, parsedArgs);
    if (!target) {
      if (looksLikePlaywrightBrowserCommand(command, parsedArgs)) {
        return originalSpawn.call(this, command, ensureHeadlessFlag(parsedArgs), options);
      }
      return originalSpawn.call(this, command, args, options);
    }
    return originalSpawn.call(this, launcher, [target], options);
  };

  const originalSpawnSync = childProcess.spawnSync;
  childProcess.spawnSync = function patchedSpawnSync(command, args, options) {
    const parsedArgs = Array.isArray(args) ? args : [];
    const target = resolveEmbeddedTarget(command, parsedArgs);
    if (!target) {
      if (looksLikePlaywrightBrowserCommand(command, parsedArgs)) {
        return originalSpawnSync.call(this, command, ensureHeadlessFlag(parsedArgs), options);
      }
      return originalSpawnSync.call(this, command, args, options);
    }
    return originalSpawnSync.call(this, launcher, [target], options);
  };

  const originalExecFile = childProcess.execFile;
  childProcess.execFile = function patchedExecFile(file, args, options, callback) {
    let nextArgs = args;
    let nextOptions = options;
    let nextCallback = callback;

    if (typeof nextArgs === 'function') {
      nextCallback = nextArgs;
      nextArgs = undefined;
      nextOptions = undefined;
    } else if (typeof nextOptions === 'function') {
      nextCallback = nextOptions;
      nextOptions = undefined;
    }

    const parsedArgs = Array.isArray(nextArgs) ? nextArgs : [];
    const target = resolveEmbeddedTarget(file, parsedArgs);
    if (!target) {
      if (looksLikePlaywrightBrowserCommand(file, parsedArgs)) {
        return originalExecFile.call(this, file, ensureHeadlessFlag(parsedArgs), nextOptions, nextCallback);
      }
      return originalExecFile.call(this, file, nextArgs, nextOptions, nextCallback);
    }
    return originalExecFile.call(this, launcher, [target], nextOptions, nextCallback);
  };

  const originalExecFileSync = childProcess.execFileSync;
  childProcess.execFileSync = function patchedExecFileSync(file, args, options) {
    const parsedArgs = Array.isArray(args) ? args : [];
    const target = resolveEmbeddedTarget(file, parsedArgs);
    if (!target) {
      if (looksLikePlaywrightBrowserCommand(file, parsedArgs)) {
        return originalExecFileSync.call(this, file, ensureHeadlessFlag(parsedArgs), options);
      }
      return originalExecFileSync.call(this, file, args, options);
    }
    return originalExecFileSync.call(this, launcher, [target], options);
  };

  const ModuleClass = Module.Module || Module;
  if (ModuleClass && typeof ModuleClass._load === 'function') {
    const originalLoad = ModuleClass._load;
    ModuleClass._load = function patchedLoad(request, parent, isMain) {
      const loaded = originalLoad.call(this, request, parent, isMain);
      if (!PLAYWRIGHT_MODULES.has(request)) {
        return loaded;
      }
      return patchPlaywrightExports(loaded);
    };
  }
}
`;
}

function appendNodeRequire(existingNodeOptions: string | undefined, hookPath: string): string {
  const requireFlag = `--require=${hookPath}`;
  if (!existingNodeOptions || existingNodeOptions.trim().length === 0) {
    return requireFlag;
  }
  if (existingNodeOptions.includes(requireFlag) || existingNodeOptions.includes(hookPath)) {
    return existingNodeOptions;
  }
  return `${existingNodeOptions} ${requireFlag}`;
}

function writeExecutable(filePath: string, contents: string): void {
  fs.writeFileSync(filePath, contents, { mode: 0o755 });
}

function prependPath(originalPath: string | undefined, entry: string): string {
  if (!originalPath) return entry;
  const segments = originalPath.split(pathSep).filter(Boolean);
  if (segments.includes(entry)) {
    return [entry, ...segments.filter((segment) => segment !== entry)].join(pathSep);
  }
  return [entry, ...segments].join(pathSep);
}

function parseRequestBody(raw: string): EmbeddedBrowserOpenPayload | null {
  const params = new URLSearchParams(raw);
  const url = params.get('url')?.trim();
  const cwd = params.get('cwd')?.trim();
  const preferEmbedded = params.get('preferEmbedded') === '1';
  if (!url || !isAllowedExternalUrl(url)) return null;
  return {
    url,
    ...(cwd ? { cwd } : {}),
    ...(preferEmbedded ? { preferEmbedded: true } : {}),
  };
}

export async function startBrowserBridge(
  onOpenRequest: (payload: EmbeddedBrowserOpenPayload) => Promise<void> | void,
): Promise<void> {
  if (bridgeState) return;

  const shimDir = path.join(os.tmpdir(), `calder-browser-bridge-${process.pid}`);
  fs.mkdirSync(shimDir, { recursive: true });

  const launcherPath = path.join(shimDir, 'calder-open-url');
  const nodeHookPath = path.join(shimDir, 'calder-node-open-hook.cjs');
  writeExecutable(launcherPath, createLauncherScript());
  writeExecutable(path.join(shimDir, 'open'), createUrlShim('CALDER_BROWSER_BRIDGE_REAL_OPEN'));
  writeExecutable(path.join(shimDir, 'xdg-open'), createUrlShim('CALDER_BROWSER_BRIDGE_REAL_XDG_OPEN'));
  fs.writeFileSync(nodeHookPath, createNodeOpenHookScript(), { mode: 0o644 });

  const token = randomBytes(16).toString('hex');
  const server = http.createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/open') {
      res.writeHead(404).end();
      return;
    }
    if (req.headers['x-calder-token'] !== token) {
      res.writeHead(403).end();
      return;
    }

    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 16_384) {
        req.destroy(new Error('request too large'));
      }
    });
    req.on('end', async () => {
      const payload = parseRequestBody(body);
      if (!payload) {
        res.writeHead(400).end();
        return;
      }
      try {
        await onOpenRequest(payload);
        res.writeHead(204).end();
      } catch (error) {
        console.error('Calder browser bridge failed to handle open request', error);
        res.writeHead(500).end();
      }
    });
    req.on('error', () => {
      if (!res.writableEnded) res.writeHead(400).end();
    });
  });

  const address = await new Promise<AddressInfo>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const value = server.address();
      if (!value || typeof value === 'string') {
        reject(new Error('Browser bridge did not bind to a TCP port'));
        return;
      }
      resolve(value);
    });
  });

  bridgeState = {
    launcherPath,
    shimDir,
    nodeHookPath,
    token,
    url: `http://127.0.0.1:${address.port}/open`,
    server,
    ...(isMac ? { realOpenPath: '/usr/bin/open' } : {}),
    ...(!isMac && !isWin ? { realXdgOpenPath: '/usr/bin/xdg-open' } : {}),
  };
}

export function buildBrowserBridgeEnv(cwd: string, env: Record<string, string>): Record<string, string> {
  if (!bridgeState) return { ...env };

  const nextEnv: Record<string, string> = {
    ...env,
    BROWSER: bridgeState.launcherPath,
    PATH: prependPath(env.PATH, bridgeState.shimDir),
    CALDER_BROWSER_BRIDGE_URL: bridgeState.url,
    CALDER_BROWSER_BRIDGE_TOKEN: bridgeState.token,
    CALDER_BROWSER_BRIDGE_LAUNCHER: bridgeState.launcherPath,
    CALDER_BROWSER_BRIDGE_CWD: cwd,
    NODE_OPTIONS: appendNodeRequire(env.NODE_OPTIONS, bridgeState.nodeHookPath),
  };

  if (bridgeState.realOpenPath) {
    nextEnv.CALDER_BROWSER_BRIDGE_REAL_OPEN = bridgeState.realOpenPath;
  }
  if (bridgeState.realXdgOpenPath) {
    nextEnv.CALDER_BROWSER_BRIDGE_REAL_XDG_OPEN = bridgeState.realXdgOpenPath;
  }

  return nextEnv;
}

export async function stopBrowserBridge(): Promise<void> {
  if (!bridgeState) return;
  const current = bridgeState;
  bridgeState = null;
  await new Promise<void>((resolve) => current.server.close(() => resolve()));
}
