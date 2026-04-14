import { afterEach, describe, expect, it, vi } from 'vitest';
import * as http from 'node:http';
import * as path from 'node:path';
import {
  buildBrowserBridgeEnv,
  startBrowserBridge,
  stopBrowserBridge,
} from './browser-bridge';

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

  it('does not duplicate shim path entries when PATH already includes shim directory', async () => {
    await startBrowserBridge(() => {});
    const base = buildBrowserBridgeEnv('/repo/project', { PATH: '/usr/bin' });
    const existingPath = `${path.dirname(base.BROWSER)}${path.delimiter}/usr/bin`;
    const env = buildBrowserBridgeEnv('/repo/project', { PATH: existingPath });

    const parts = env.PATH.split(path.delimiter);
    expect(parts[0]).toBe(path.dirname(base.BROWSER));
    expect(parts.filter((segment) => segment === path.dirname(base.BROWSER))).toHaveLength(1);
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
});
