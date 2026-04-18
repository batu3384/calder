const MINIMAX_TOOL_CALL_MARKUP_RE = /<\s*minimax:tool_call\b/i;

export interface MiniMaxToolCallRecoveryState {
  lastTriggeredAt: number;
  lastMessage: string;
  attempts: number;
}

export function isMiniMaxToolCallMarkupMessage(message: string | null | undefined): boolean {
  if (typeof message !== 'string') return false;
  return MINIMAX_TOOL_CALL_MARKUP_RE.test(message);
}

export function shouldTriggerMiniMaxToolCallRecovery(
  message: string | null | undefined,
  previousState: MiniMaxToolCallRecoveryState | undefined,
  now: number,
  cooldownMs = 45_000,
): boolean {
  if (!isMiniMaxToolCallMarkupMessage(message)) return false;
  if (!previousState) return true;

  const normalized = (message ?? '').trim();
  if (normalized !== previousState.lastMessage) return true;

  return now - previousState.lastTriggeredAt >= cooldownMs;
}

export function buildMiniMaxToolCallRecoveryPrompt(): string {
  return [
    'SYSTEM RECOVERY:',
    'Use native tool calls only.',
    'Do not print XML-like tags such as <minimax:tool_call>.',
    'Retry your last intended action now using real tool_use/function calls.',
  ].join(' ');
}

