import { describe, expect, it, vi } from 'vitest';

const cleanupMocks = vi.hoisted(() => ({
  antigravity: vi.fn(),
  codex: vi.fn(),
  qwen: vi.fn(),
  claude: vi.fn(),
}));

vi.mock('./antigravity-hooks', () => ({ cleanupAntigravityHooks: cleanupMocks.antigravity }));
vi.mock('./codex-hooks', () => ({ cleanupCodexHooks: cleanupMocks.codex }));
vi.mock('./qwen-hooks', () => ({ cleanupQwenHooks: cleanupMocks.qwen }));
vi.mock('./claude-cli', () => ({ cleanupClaudeHooksOnly: cleanupMocks.claude }));

describe('external-hook-policy', () => {
  it('runs all external cleanups when injection is disabled', async () => {
    vi.resetModules();
    const mod = await import('./external-hook-policy');
    expect(mod.EXTERNAL_HOOK_INJECTION_ENABLED).toBe(false);
    mod.cleanupAllExternalProviderHooks();
    expect(cleanupMocks.antigravity).toHaveBeenCalled();
    expect(cleanupMocks.codex).toHaveBeenCalled();
    expect(cleanupMocks.qwen).toHaveBeenCalled();
    expect(cleanupMocks.claude).toHaveBeenCalled();
  });
});
