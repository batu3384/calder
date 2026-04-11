import { describe, expect, it } from 'vitest';
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
