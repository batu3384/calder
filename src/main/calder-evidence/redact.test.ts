import { describe, expect, it } from 'vitest';

import { redactValue } from './redact.js';

describe('calder-evidence redact', () => {
  it('redacts nested secrets without leaking originals', () => {
    const input = {
      headers: {
        Authorization: 'Bearer abc.def.ghi',
      },
      config: {
        password: 'password=super-secret',
        token: 'token=not-safe',
      },
      keys: ['sk-live-abcdefghijklmnopqrstuvwxyz', 'ghp_1234567890123456789012345678901234'],
      note: 'plain text',
    };

    const result = redactValue(input);
    const serialized = JSON.stringify(result.value);

    expect(result.redactedCount).toBeGreaterThan(0);
    expect(result.redactionTypes.length).toBeGreaterThan(0);
    expect(serialized).not.toContain('super-secret');
    expect(serialized).not.toContain('not-safe');
    expect(serialized).not.toContain('abc.def.ghi');
    expect(serialized).toContain('[REDACTED:');
    expect((result.value as { note: string }).note).toBe('plain text');
  });

  it('redacts slack, npm, jwt, env assignments and generic secret fields', () => {
    const input = {
      slack: 'xoxb-123456789012-abcdefghij',
      npm: 'npm_abcdefghijklmnopqrstuvwxyz123456',
      jwt: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.signaturepart',
      envLine: 'export OPENAI_API_KEY=sk-live-should-hide',
      field: 'api_key=deadbeefcafe',
      note: 'plain text stays',
    };

    const result = redactValue(input);
    const serialized = JSON.stringify(result.value);

    expect(serialized).not.toContain('xoxb-123456789012');
    expect(serialized).not.toContain('npm_abcdefghijklmnop');
    expect(serialized).not.toContain('eyJhbGciOiJIUzI1NiJ9');
    expect(serialized).not.toContain('sk-live-should-hide');
    expect(serialized).not.toContain('deadbeefcafe');
    expect(serialized).toContain('[REDACTED:');
    expect((result.value as { note: string }).note).toBe('plain text stays');
  });
});
