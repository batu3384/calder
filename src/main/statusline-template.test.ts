import { describe, expect, it } from 'vitest';
import { chmodSync, mkdtempSync, readFileSync, utimesSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { execFile, execFileSync } from 'child_process';
import { createServer } from 'http';
import { promisify } from 'util';
import { buildStatusLinePython, buildStatusLineWrapper } from './statusline-template';
import { getProviderQuotaCacheFile } from './statusline-format';

const execFileAsync = promisify(execFile);

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function waitForSnapshotSource(statusDir: string, source: string) {
  const path = join(statusDir, getProviderQuotaCacheFile('zai'));
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const snapshot = JSON.parse(readFileSync(path, 'utf8'));
    if (snapshot.source === source) return snapshot;
    await sleep(50);
  }
  return JSON.parse(readFileSync(path, 'utf8'));
}

describe('buildStatusLinePython', () => {
  it('preserves .cost and .sessionid capture', () => {
    const py = buildStatusLinePython('/tmp/calder');
    expect(py).toContain("sid+'.cost'");
    expect(py).toContain("sid+'.sessionid'");
  });

  it('includes a render entrypoint and a background refresh entrypoint', () => {
    const py = buildStatusLinePython('/tmp/calder');
    expect(py).toContain('def render_statusline');
    expect(py).toContain('def refresh_provider_cache');
    expect(py).toContain("if __name__ == '__main__':");
  });
});

describe('buildStatusLineWrapper', () => {
  it('invokes the managed python helper instead of inlining python', () => {
    const wrapper = buildStatusLineWrapper('/tmp/calder/statusline.py', '/tmp/calder/statusline.log');
    expect(wrapper).toContain('statusline.py');
    expect(wrapper).toContain('statusline.log');
  });
});

describe('quota cache refresh scaffolding', () => {
  it('seeds honest fallback snapshots for unsupported or syncing providers', () => {
    const py = buildStatusLinePython('/tmp/calder');
    expect(py).toContain('calder:no-supported-anthropic-quota-api');
    expect(py).toContain('zai:quota-surface-pending');
    expect(py).toContain('subprocess.Popen');
  });
});

describe('generated renderer payload parsing', () => {
  it('uses Claude Code token totals for context and latest event cwd for the project label', () => {
    const statusDir = mkdtempSync(join(tmpdir(), 'calder-statusline-test-'));
    const scriptPath = join(statusDir, 'statusline.py');
    writeFileSync(scriptPath, buildStatusLinePython(statusDir), { mode: 0o755 });
    chmodSync(scriptPath, 0o755);
    writeFileSync(
      join(statusDir, 'sess-1.events'),
      JSON.stringify({ type: 'session_start', cwd: '/Users/batuhanyuksel/Documents/aa' }) + '\n',
    );

    const payload = JSON.stringify({
      model: { display_name: 'Sonnet 4.6' },
      cost: { total_cost_usd: 0.1234 },
      context_window: {
        total_input_tokens: 20_000,
        total_output_tokens: 4_000,
        context_window_size: 200_000,
        current_usage: null,
        used_percentage: null,
      },
      session_id: 'claude-session-1',
    });

    const output = execFileSync('/usr/bin/python3', [scriptPath, 'render'], {
      input: payload,
      encoding: 'utf8',
      env: { ...process.env, CLAUDE_IDE_SESSION_ID: 'sess-1' },
    }).trim();

    expect(output).toContain('Sonnet 4.6  Anthropic  --  aa');
    expect(output).toContain('Ctx 12%  Cost $0.12');
  });

  it('uses Claude Code OAuth rate_limits for visible remaining quota', () => {
    const statusDir = mkdtempSync(join(tmpdir(), 'calder-statusline-test-'));
    const scriptPath = join(statusDir, 'statusline.py');
    writeFileSync(scriptPath, buildStatusLinePython(statusDir), { mode: 0o755 });
    chmodSync(scriptPath, 0o755);

    const payload = JSON.stringify({
      model: { display_name: 'Haiku 4.5' },
      cost: { total_cost_usd: 0.223 },
      context_window: { used_percentage: 25 },
      rate_limits: {
        five_hour: { used_percentage: 73, resets_at: '2026-04-11T14:00:00Z' },
        seven_day: { used_percentage: 12, resets_at: '2026-04-15T09:00:00Z' },
      },
      cwd: '/Users/batuhanyuksel/Documents/aa',
    });

    const output = execFileSync('/usr/bin/python3', [scriptPath, 'render'], {
      input: payload,
      encoding: 'utf8',
      env: { ...process.env, CLAUDE_IDE_SESSION_ID: 'sess-claude-limits' },
    }).trim();

    expect(output).toContain('Haiku 4.5  Anthropic  --  aa');
    expect(output).toContain('Ctx 25%  Cost $0.22  5h 27% left  Week 88% left  Live');
  });

  it('renders Qwen payloads with the Qwen provider label and CALDER_SESSION_ID fallback', () => {
    const statusDir = mkdtempSync(join(tmpdir(), 'calder-statusline-test-'));
    const scriptPath = join(statusDir, 'statusline.py');
    writeFileSync(scriptPath, buildStatusLinePython(statusDir), { mode: 0o755 });
    chmodSync(scriptPath, 0o755);

    const payload = JSON.stringify({
      model: { display_name: 'qwen3-coder' },
      context_window: { used_percentage: 18 },
      workspace: { current_dir: '/Users/batuhanyuksel/Documents/orbis' },
      session_id: 'qwen-session-1',
    });

    const output = execFileSync('/usr/bin/python3', [scriptPath, 'render'], {
      input: payload,
      encoding: 'utf8',
      env: { ...process.env, CALDER_SESSION_ID: 'sess-qwen-1' },
    }).trim();

    expect(output).toContain('qwen3-coder  Qwen  --  orbis');
    expect(output).toContain('Ctx 18%  Cost --');
  });

  it('refreshes Z.ai quota labels when running behind a local gateway', async () => {
    const statusDir = mkdtempSync(join(tmpdir(), 'calder-statusline-test-'));
    const scriptPath = join(statusDir, 'statusline.py');
    writeFileSync(scriptPath, buildStatusLinePython(statusDir), { mode: 0o755 });
    chmodSync(scriptPath, 0o755);
    const now = Date.now();

    const server = createServer((_req, res) => {
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          data: {
            limits: [
              { type: 'TOKENS_LIMIT', percentage: 40, nextResetTime: now + 2 * 60 * 60_000 },
              { type: 'TIME_LIMIT', percentage: 10, nextResetTime: now + 14 * 24 * 60 * 60_000 },
            ],
          },
        }),
      );
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('server did not bind to a port');

      await execFileAsync('/usr/bin/python3', [scriptPath, 'refresh', 'zai', 'glm-5.1'], {
        encoding: 'utf8',
        env: {
          ...process.env,
          ANTHROPIC_BASE_URL: 'http://127.0.0.1:43111',
          ZAI_API_KEY: 'test-token',
          CALDER_ZAI_QUOTA_LIMIT_URL: `http://127.0.0.1:${address.port}/api/monitor/usage/quota/limit`,
        },
      });

      const snapshot = JSON.parse(
        readFileSync(join(statusDir, getProviderQuotaCacheFile('zai')), 'utf8'),
      );

      expect(snapshot).toMatchObject({
        provider: 'zai',
        model: 'glm-5.1',
        fiveHour: '60% left',
        weekly: '90% left',
        weeklyLabel: 'Cycle',
        status: 'unknown',
        source: 'zai:quota-limit',
      });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('retries an existing syncing Z.ai cache during render behind a local gateway', async () => {
    const statusDir = mkdtempSync(join(tmpdir(), 'calder-statusline-test-'));
    const scriptPath = join(statusDir, 'statusline.py');
    writeFileSync(scriptPath, buildStatusLinePython(statusDir), { mode: 0o755 });
    chmodSync(scriptPath, 0o755);
    writeFileSync(
      join(statusDir, getProviderQuotaCacheFile('zai')),
      JSON.stringify({
        provider: 'zai',
        model: 'glm-5.1',
        fiveHour: null,
        weekly: null,
        weeklyLabel: 'Cycle',
        status: 'syncing',
        updatedAt: Date.now(),
        source: 'zai:quota-surface-pending',
      }),
    );
    const lockPath = join(statusDir, 'statusline.refresh.lock');
    writeFileSync(lockPath, 'old-refresh');
    const staleLockTime = new Date(Date.now() - 10 * 60_000);
    utimesSync(lockPath, staleLockTime, staleLockTime);

    const server = createServer((_req, res) => {
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          data: {
            limits: [{ type: 'TOKENS_LIMIT', percentage: 25 }],
          },
        }),
      );
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('server did not bind to a port');

      const payload = JSON.stringify({
        model: { display_name: 'glm-5.1' },
        cost: { total_cost_usd: 0.22 },
        context_window: { used_percentage: 25 },
        cwd: '/Users/batuhanyuksel/Documents/aa',
      });

      execFileSync('/usr/bin/python3', [scriptPath, 'render'], {
        input: payload,
        encoding: 'utf8',
        env: {
          ...process.env,
          CLAUDE_IDE_SESSION_ID: 'sess-zai-retry',
          ANTHROPIC_BASE_URL: 'http://127.0.0.1:43111',
          ZAI_API_KEY: 'test-token',
          CALDER_ZAI_QUOTA_LIMIT_URL: `http://127.0.0.1:${address.port}/api/monitor/usage/quota/limit`,
        },
      });

      const snapshot = await waitForSnapshotSource(statusDir, 'zai:quota-limit');
      expect(snapshot).toMatchObject({
        fiveHour: '75% left',
        status: 'unknown',
        source: 'zai:quota-limit',
      });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('labels short Z.ai secondary windows as Week', async () => {
    const statusDir = mkdtempSync(join(tmpdir(), 'calder-statusline-test-'));
    const scriptPath = join(statusDir, 'statusline.py');
    writeFileSync(scriptPath, buildStatusLinePython(statusDir), { mode: 0o755 });
    chmodSync(scriptPath, 0o755);
    const now = Date.now();

    const server = createServer((_req, res) => {
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          data: {
            limits: [
              { type: 'TIME_LIMIT', percentage: 10, nextResetTime: now + 3 * 24 * 60 * 60_000 },
            ],
          },
        }),
      );
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('server did not bind to a port');

      await execFileAsync('/usr/bin/python3', [scriptPath, 'refresh', 'zai', 'glm-5.1'], {
        encoding: 'utf8',
        env: {
          ...process.env,
          ANTHROPIC_BASE_URL: 'http://127.0.0.1:43111',
          ZAI_API_KEY: 'test-token',
          CALDER_ZAI_QUOTA_LIMIT_URL: `http://127.0.0.1:${address.port}/api/monitor/usage/quota/limit`,
        },
      });

      const snapshot = JSON.parse(
        readFileSync(join(statusDir, getProviderQuotaCacheFile('zai')), 'utf8'),
      );

      expect(snapshot).toMatchObject({
        provider: 'zai',
        model: 'glm-5.1',
        fiveHour: null,
        weekly: '90% left',
        weeklyLabel: 'Week',
        status: 'unknown',
        source: 'zai:quota-limit',
      });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
