import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import { randomBytes } from 'crypto';
import type { AddressInfo } from 'net';
import type { EmbeddedBrowserOpenPayload } from '../shared/types';
import { isMac, isWin, pathSep } from './platform';

interface BrowserBridgeState {
  launcherPath: string;
  shimDir: string;
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

if [ -n "$REAL_CMD" ]; then
  exec "$REAL_CMD" "$@"
fi

exit 1
`;
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
  if (!url) return null;
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
  writeExecutable(launcherPath, createLauncherScript());
  writeExecutable(path.join(shimDir, 'open'), createUrlShim('CALDER_BROWSER_BRIDGE_REAL_OPEN'));
  writeExecutable(path.join(shimDir, 'xdg-open'), createUrlShim('CALDER_BROWSER_BRIDGE_REAL_XDG_OPEN'));

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
