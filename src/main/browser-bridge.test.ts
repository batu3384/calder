import { afterEach, describe, expect, it, vi } from 'vitest';
import * as http from 'node:http';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  buildBrowserBridgeEnv,
  startBrowserBridge,
  stopBrowserBridge,
} from './browser-bridge';

const execFileAsync = promisify(execFile);

async function postToBridge(
  url: string,
  token: string,
  body: URLSearchParams,
  method: 'POST' | 'GET' = 'POST',
): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      url,
      {
        method,
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          'x-calder-token': token,
        },
      },
      (res) => {
        res.resume();
        res.on('end', () => resolve(res.statusCode ?? 0));
      },
    );
    req.on('error', reject);
    req.write(body.toString());
    req.end();
  });
}

afterEach(async () => {
  await stopBrowserBridge();
});

describe('browser-bridge', () => {
  it('returns the original environment when the bridge is not running', () => {
    expect(buildBrowserBridgeEnv('/repo/project', { PATH: '/usr/bin' })).toEqual({
      PATH: '/usr/bin',
    });
  });

  it('starts a local bridge, exposes launch env, and handles open requests', async () => {
    const onOpenRequest = vi.fn();
    await startBrowserBridge(onOpenRequest);

    const env = buildBrowserBridgeEnv('/repo/project', { PATH: '/usr/bin' });
    expect(env.BROWSER).toBeDefined();
    expect(env.CALDER_BROWSER_BRIDGE_LAUNCHER).toBe(env.BROWSER);
    expect(env.CALDER_BROWSER_BRIDGE_CWD).toBe('/repo/project');
    expect(env.CALDER_BROWSER_BRIDGE_URL).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/open$/);
    expect(env.PATH.split(path.delimiter)[0]).toBe(path.dirname(env.BROWSER));

    const status = await postToBridge(
      env.CALDER_BROWSER_BRIDGE_URL,
      env.CALDER_BROWSER_BRIDGE_TOKEN,
      new URLSearchParams({
        url: 'https://example.com/docs',
        cwd: '/repo/project',
        preferEmbedded: '1',
      }),
    );

    expect(status).toBe(204);
    expect(onOpenRequest).toHaveBeenCalledWith({
      url: 'https://example.com/docs',
      cwd: '/repo/project',
      preferEmbedded: true,
    });
  });

  it('rejects requests with an invalid token', async () => {
    const onOpenRequest = vi.fn();
    await startBrowserBridge(onOpenRequest);
    const env = buildBrowserBridgeEnv('/repo/project', { PATH: '/usr/bin' });

    const status = await postToBridge(
      env.CALDER_BROWSER_BRIDGE_URL,
      'wrong-token',
      new URLSearchParams({ url: 'https://example.com' }),
    );

    expect(status).toBe(403);
    expect(onOpenRequest).not.toHaveBeenCalled();
  });

  it('returns server errors when the open handler throws', async () => {
    await startBrowserBridge(() => {
      throw new Error('boom');
    });
    const env = buildBrowserBridgeEnv('/repo/project', { PATH: '/usr/bin' });

    const status = await postToBridge(
      env.CALDER_BROWSER_BRIDGE_URL,
      env.CALDER_BROWSER_BRIDGE_TOKEN,
      new URLSearchParams({ url: 'https://example.com' }),
    );

    expect(status).toBe(500);
  });

  it('returns 404 for unsupported routes or methods', async () => {
    const onOpenRequest = vi.fn();
    await startBrowserBridge(onOpenRequest);
    const env = buildBrowserBridgeEnv('/repo/project', { PATH: '/usr/bin' });

    const routeStatus = await postToBridge(
      env.CALDER_BROWSER_BRIDGE_URL.replace('/open', '/unknown'),
      env.CALDER_BROWSER_BRIDGE_TOKEN,
      new URLSearchParams({ url: 'https://example.com' }),
    );
    const methodStatus = await postToBridge(
      env.CALDER_BROWSER_BRIDGE_URL,
      env.CALDER_BROWSER_BRIDGE_TOKEN,
      new URLSearchParams({ url: 'https://example.com' }),
      'GET',
    );

    expect(routeStatus).toBe(404);
    expect(methodStatus).toBe(404);
    expect(onOpenRequest).not.toHaveBeenCalled();
  });

  it('returns 400 when payload is missing url', async () => {
    const onOpenRequest = vi.fn();
    await startBrowserBridge(onOpenRequest);
    const env = buildBrowserBridgeEnv('/repo/project', { PATH: '/usr/bin' });

    const status = await postToBridge(
      env.CALDER_BROWSER_BRIDGE_URL,
      env.CALDER_BROWSER_BRIDGE_TOKEN,
      new URLSearchParams({ cwd: '/repo/project' }),
    );

    expect(status).toBe(400);
    expect(onOpenRequest).not.toHaveBeenCalled();
  });

  it('returns 400 when payload URL protocol is unsupported', async () => {
    const onOpenRequest = vi.fn();
    await startBrowserBridge(onOpenRequest);
    const env = buildBrowserBridgeEnv('/repo/project', { PATH: '/usr/bin' });

    const status = await postToBridge(
      env.CALDER_BROWSER_BRIDGE_URL,
      env.CALDER_BROWSER_BRIDGE_TOKEN,
      new URLSearchParams({ url: 'javascript:alert(1)' }),
    );

    expect(status).toBe(400);
    expect(onOpenRequest).not.toHaveBeenCalled();
  });

  it('does not duplicate shim path entries when PATH already includes shim directory', async () => {
    await startBrowserBridge(() => {});
    const base = buildBrowserBridgeEnv('/repo/project', { PATH: '/usr/bin' });
    const existingPath = `${path.dirname(base.BROWSER)}${path.delimiter}/usr/bin`;
    const env = buildBrowserBridgeEnv('/repo/project', { PATH: existingPath });

    const parts = env.PATH.split(path.delimiter);
    expect(parts[0]).toBe(path.dirname(base.BROWSER));
    expect(parts.filter((segment) => segment === path.dirname(base.BROWSER))).toHaveLength(1);
  });

  it('injects a Node require hook into NODE_OPTIONS exactly once', async () => {
    await startBrowserBridge(() => {});
    const base = buildBrowserBridgeEnv('/repo/project', { PATH: '/usr/bin' });
    expect(base.NODE_OPTIONS).toContain('--require=');
    expect(base.NODE_OPTIONS).toContain(path.dirname(base.BROWSER));

    const env = buildBrowserBridgeEnv('/repo/project', { PATH: '/usr/bin', NODE_OPTIONS: base.NODE_OPTIONS });
    expect(env.NODE_OPTIONS).toBe(base.NODE_OPTIONS);
  });

  it('routes absolute open command launches from Node child_process through the bridge', async () => {
    if (process.platform === 'win32') return;

    const onOpenRequest = vi.fn();
    await startBrowserBridge(onOpenRequest);
    const env = buildBrowserBridgeEnv('/repo/project', { PATH: '/usr/bin' });

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'calder-node-open-hook-'));
    const markerPath = path.join(tmpDir, 'external-open.marker');
    const openScriptPath = path.join(tmpDir, 'open');
    try {
      fs.writeFileSync(openScriptPath, `#!/bin/sh\necho external > "${markerPath}"\nexit 0\n`, { mode: 0o755 });

      const nodeScript = `
        const { spawn } = require('node:child_process');
        const openCommand = process.argv[1];
        const child = spawn(openCommand, ['https://example.com/node-hook-open'], { stdio: 'ignore' });
        child.on('error', () => process.exit(2));
        child.on('close', (code) => process.exit(typeof code === 'number' ? code : 1));
      `;

      await execFileAsync(process.execPath, ['-e', nodeScript, openScriptPath], {
        env: {
          ...process.env,
          ...env,
        },
      });

      expect(fs.existsSync(markerPath)).toBe(false);
      expect(onOpenRequest).toHaveBeenCalledWith({
        url: 'https://example.com/node-hook-open',
        cwd: '/repo/project',
        preferEmbedded: true,
      });
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('forces Playwright browser subprocesses to run headless through NODE_OPTIONS hook', async () => {
    if (process.platform === 'win32') return;

    await startBrowserBridge(() => {});
    const env = buildBrowserBridgeEnv('/repo/project', { PATH: '/usr/bin' });

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'calder-playwright-headless-'));
    const browserBinDir = path.join(tmpDir, 'ms-playwright', 'chromium');
    const browserBinPath = path.join(browserBinDir, 'chromium');
    const argsLogPath = path.join(tmpDir, 'browser-args.log');
    try {
      fs.mkdirSync(browserBinDir, { recursive: true });
      fs.writeFileSync(
        browserBinPath,
        `#!/bin/sh\nprintf '%s\\n' \"$@\" > "${argsLogPath}"\nexit 0\n`,
        { mode: 0o755 },
      );

      const nodeScript = `
        const { spawn } = require('node:child_process');
        const browserPath = process.argv[1];
        const child = spawn(browserPath, ['--remote-debugging-pipe', '--user-data-dir=/tmp/pw-user-data'], { stdio: 'ignore' });
        child.on('error', () => process.exit(2));
        child.on('close', (code) => process.exit(typeof code === 'number' ? code : 1));
      `;

      await execFileAsync(process.execPath, ['-e', nodeScript, browserBinPath], {
        env: {
          ...process.env,
          ...env,
        },
      });

      const argsLog = fs.readFileSync(argsLogPath, 'utf8');
      expect(argsLog).toContain('--remote-debugging-pipe');
      expect(argsLog).toContain('--headless=new');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('forces Playwright API launches to headless and mirrors goto urls into Calder browser', async () => {
    if (process.platform === 'win32') return;

    const onOpenRequest = vi.fn();
    await startBrowserBridge(onOpenRequest);
    const env = buildBrowserBridgeEnv('/repo/project', { PATH: '/usr/bin' });

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'calder-playwright-api-hook-'));
    const nodeModulesDir = path.join(tmpDir, 'node_modules');
    const playwrightModuleDir = path.join(nodeModulesDir, 'playwright');
    const launchOptionsLog = path.join(tmpDir, 'launch-options.json');
    try {
      fs.mkdirSync(playwrightModuleDir, { recursive: true });
      fs.writeFileSync(path.join(playwrightModuleDir, 'index.js'), `
        const fs = require('node:fs');
        module.exports = {
          chromium: {
            launch: async (options = {}) => {
              fs.writeFileSync(process.env.CALDER_FAKE_PLAYWRIGHT_OPTIONS_LOG, JSON.stringify(options));
              return {
                newPage: async () => ({
                  goto: async () => ({ ok: () => true }),
                }),
                newContext: async () => ({
                  newPage: async () => ({
                    goto: async () => ({ ok: () => true }),
                  }),
                }),
                contexts: () => [],
              };
            },
          },
        };
      `);

      const nodeScript = `
        process.env.NODE_PATH = process.argv[1];
        require('node:module').Module._initPaths();
        const playwright = require('playwright');
        (async () => {
          const browser = await playwright.chromium.launch({ headless: false });
          const page = await browser.newPage();
          await page.goto('http://localhost:4555/pw-api-mirror');
          process.exit(0);
        })().catch(() => process.exit(1));
      `;

      await execFileAsync(process.execPath, ['-e', nodeScript, nodeModulesDir], {
        env: {
          ...process.env,
          ...env,
          CALDER_FAKE_PLAYWRIGHT_OPTIONS_LOG: launchOptionsLog,
        },
      });

      const optionsRaw = fs.readFileSync(launchOptionsLog, 'utf8');
      const launchOptions = JSON.parse(optionsRaw) as { headless?: boolean };
      expect(launchOptions.headless).toBe(true);

      const deadline = Date.now() + 1_000;
      while (onOpenRequest.mock.calls.length === 0 && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 25));
      }

      expect(onOpenRequest).toHaveBeenCalledWith({
        url: 'http://localhost:4555/pw-api-mirror',
        cwd: '/repo/project',
        preferEmbedded: true,
      });
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('treats repeated start calls as idempotent while bridge is active', async () => {
    const first = vi.fn();
    const second = vi.fn();
    await startBrowserBridge(first);
    await startBrowserBridge(second);
    const env = buildBrowserBridgeEnv('/repo/project', { PATH: '/usr/bin' });

    const status = await postToBridge(
      env.CALDER_BROWSER_BRIDGE_URL,
      env.CALDER_BROWSER_BRIDGE_TOKEN,
      new URLSearchParams({ url: 'https://example.com' }),
    );

    expect(status).toBe(204);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
  });

  it('does not fall back to the system browser when bridge launch fails by default', async () => {
    if (process.platform === 'win32') return;

    await startBrowserBridge(() => {});
    const env = buildBrowserBridgeEnv('/repo/project', { PATH: '/usr/bin' });

    const markerPath = path.join(os.tmpdir(), `calder-bridge-marker-${Date.now()}-${Math.random()}.txt`);
    const fallbackScript = path.join(os.tmpdir(), `calder-bridge-fallback-${Date.now()}-${Math.random()}.sh`);
    fs.writeFileSync(fallbackScript, `#!/bin/sh\necho fallback > "${markerPath}"\nexit 0\n`, { mode: 0o755 });

    const shimPath = path.join(path.dirname(env.BROWSER), 'open');
    await expect(execFileAsync(shimPath, ['https://example.com/docs'], {
      env: {
        ...process.env,
        ...env,
        CALDER_BROWSER_BRIDGE_TOKEN: 'invalid-token',
        CALDER_BROWSER_BRIDGE_REAL_OPEN: fallbackScript,
      },
    })).rejects.toMatchObject({ code: 1 });

    expect(fs.existsSync(markerPath)).toBe(false);

    fs.rmSync(fallbackScript, { force: true });
    fs.rmSync(markerPath, { force: true });
  });

  it('allows fallback only when explicitly opted in', async () => {
    if (process.platform === 'win32') return;

    await startBrowserBridge(() => {});
    const env = buildBrowserBridgeEnv('/repo/project', { PATH: '/usr/bin' });

    const markerPath = path.join(os.tmpdir(), `calder-bridge-marker-${Date.now()}-${Math.random()}.txt`);
    const fallbackScript = path.join(os.tmpdir(), `calder-bridge-fallback-${Date.now()}-${Math.random()}.sh`);
    fs.writeFileSync(fallbackScript, `#!/bin/sh\necho fallback > "${markerPath}"\nexit 0\n`, { mode: 0o755 });

    const shimPath = path.join(path.dirname(env.BROWSER), 'open');
    await execFileAsync(shimPath, ['https://example.com/docs'], {
      env: {
        ...process.env,
        ...env,
        CALDER_BROWSER_BRIDGE_TOKEN: 'invalid-token',
        CALDER_BROWSER_BRIDGE_REAL_OPEN: fallbackScript,
        CALDER_BROWSER_BRIDGE_ALLOW_EXTERNAL_FALLBACK: '1',
      },
    });

    expect(fs.existsSync(markerPath)).toBe(true);

    fs.rmSync(fallbackScript, { force: true });
    fs.rmSync(markerPath, { force: true });
  });
});
