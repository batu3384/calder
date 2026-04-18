import { describe, expect, it } from 'vitest';
import { resolveAutoApprovalInput } from './auto-approval-dispatch.js';

describe('resolveAutoApprovalInput', () => {
  it('returns provider-specific approval input', () => {
    expect(resolveAutoApprovalInput('claude')).toBe('1\n');
    expect(resolveAutoApprovalInput('codex')).toBe('y\n');
    expect(resolveAutoApprovalInput('gemini')).toBe('y\n');
    expect(resolveAutoApprovalInput('qwen')).toBe('y\n');
  });

  it('throws for unsupported providers', () => {
    expect(() => resolveAutoApprovalInput('minimax')).toThrow('Unsupported auto-approval provider');
    expect(() => resolveAutoApprovalInput('blackbox')).toThrow('Unsupported auto-approval provider');
    expect(() => resolveAutoApprovalInput('copilot')).toThrow('Unsupported auto-approval provider');
  });
});
