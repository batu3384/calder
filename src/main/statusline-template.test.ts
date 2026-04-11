import { describe, expect, it } from 'vitest';
import { chmodSync, mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { execFileSync } from 'child_process';
import { buildStatusLinePython, buildStatusLineWrapper } from './statusline-template';

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
});
