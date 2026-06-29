import { describe, expect, it } from 'vitest';

import {
  validatePtyCreatePayload,
  validatePtyWritePayload,
} from './ipc-validation';

describe('ipc-validation', () => {
  it('validates pty:create payload with spaced initialPrompt', () => {
    const payload = validatePtyCreatePayload(
      'session-1',
      '/repo',
      null,
      false,
      '',
      'claude',
      'fix the bug',
    );
    expect(payload.initialPrompt).toBe('fix the bug');
  });

  it('rejects oversized pty:write payload', () => {
    expect(() => validatePtyWritePayload('s1', 'x'.repeat(2 * 1024 * 1024))).toThrow(/Validation failed/);
  });
});
