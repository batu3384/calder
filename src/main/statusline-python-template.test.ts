import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STATUSLINE_STALE_MS,
  fallbackQuotaStatus,
  getProviderQuotaCacheFile,
} from './statusline-format.js';
import { buildStatusLinePythonTemplate } from './statusline-python-template.js';

describe('buildStatusLinePythonTemplate', () => {
  it('injects runtime placeholders for config, status directory, and cache file', () => {
    const statusDir = '/tmp/calder-statusline';
    const rendered = buildStatusLinePythonTemplate(statusDir);

    expect(rendered).toContain(statusDir);
    expect(rendered).toContain(getProviderQuotaCacheFile('anthropic'));
    expect(rendered).toContain(String(DEFAULT_STATUSLINE_STALE_MS));
    expect(rendered).toContain(`"${fallbackQuotaStatus('anthropic')}"`);
    expect(rendered).toContain(`"${fallbackQuotaStatus('zai')}"`);
    expect(rendered).toContain(`"${fallbackQuotaStatus('minimax')}"`);
    expect(rendered).toContain(`"${fallbackQuotaStatus('qwen')}"`);

    expect(rendered).not.toContain('__CALDER_CONFIG_JSON__');
    expect(rendered).not.toContain('__CALDER_STATUS_DIR__');
    expect(rendered).not.toContain('__CALDER_ANTHROPIC_QUOTA_CACHE_FILE__');
  });
});
