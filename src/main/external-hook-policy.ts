import { cleanupAntigravityHooks } from './antigravity-hooks';
import { cleanupClaudeHooksOnly } from './claude-cli';
import { cleanupCodexHooks } from './codex-hooks';
import { cleanupQwenHooks } from './qwen-hooks';

/**
 * Calder must not mutate external CLI configs (~/.gemini, ~/.codex, ~/.claude, ~/.qwen).
 * Hook scripts under ~/.calder/runtime stay for Calder-internal use only.
 */
export const EXTERNAL_HOOK_INJECTION_ENABLED = false;

function safeCleanup(label: string, fn: () => void): void {
  try {
    fn();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Failed to cleanup external hooks for ${label}: ${message}`);
  }
}

export function cleanupAllExternalProviderHooks(): void {
  safeCleanup('antigravity', cleanupAntigravityHooks);
  safeCleanup('codex', cleanupCodexHooks);
  safeCleanup('qwen', cleanupQwenHooks);
  safeCleanup('claude', cleanupClaudeHooksOnly);
}
