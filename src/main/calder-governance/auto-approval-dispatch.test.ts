import { describe, expect, it } from 'vitest';

import {
  resolveAutoApprovalInput,
  supportsAutoApprovalDispatch,
} from './auto-approval-dispatch.js';

describe('resolveAutoApprovalInput', () => {
  it('returns provider-specific approval input', () => {
    expect(resolveAutoApprovalInput('claude')).toBe('1\n');
    expect(resolveAutoApprovalInput('codex')).toBe('y\n');
    expect(resolveAutoApprovalInput('antigravity')).toBe('y\n');
    expect(resolveAutoApprovalInput('qwen')).toBe('y\n');
    expect(resolveAutoApprovalInput('copilot')).toBe('y\n');
  });

  it('throws for unsupported providers', () => {
    expect(() => resolveAutoApprovalInput('minimax' as any)).toThrow(
      'Unsupported auto-approval provider',
    );
  });

  it('exposes provider support checks for orchestrator guards', () => {
    expect(supportsAutoApprovalDispatch('claude')).toBe(true);
    expect(supportsAutoApprovalDispatch('codex')).toBe(true);
    expect(supportsAutoApprovalDispatch('antigravity')).toBe(true);
    expect(supportsAutoApprovalDispatch('qwen')).toBe(true);
    expect(supportsAutoApprovalDispatch('copilot')).toBe(true);
    expect(supportsAutoApprovalDispatch('minimax' as any)).toBe(false);
    expect(supportsAutoApprovalDispatch(null)).toBe(false);
    expect(supportsAutoApprovalDispatch(undefined)).toBe(false);
  });
});
