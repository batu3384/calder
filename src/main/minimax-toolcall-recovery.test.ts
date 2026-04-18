import { describe, expect, it } from 'vitest';
import {
  buildMiniMaxToolCallRecoveryPrompt,
  isMiniMaxToolCallMarkupMessage,
  shouldTriggerMiniMaxToolCallRecovery,
  type MiniMaxToolCallRecoveryState,
} from './minimax-toolcall-recovery';

describe('isMiniMaxToolCallMarkupMessage', () => {
  it('detects minimax pseudo tool-call markup', () => {
    expect(isMiniMaxToolCallMarkupMessage('<minimax:tool_call><invoke name="Read"></invoke></minimax:tool_call>')).toBe(true);
    expect(isMiniMaxToolCallMarkupMessage('<MINIMAX:TOOL_CALL>')).toBe(true);
  });

  it('ignores normal assistant text', () => {
    expect(isMiniMaxToolCallMarkupMessage('tool_use call is ready')).toBe(false);
    expect(isMiniMaxToolCallMarkupMessage('')).toBe(false);
    expect(isMiniMaxToolCallMarkupMessage(undefined)).toBe(false);
  });
});

describe('shouldTriggerMiniMaxToolCallRecovery', () => {
  const now = 1_000_000;

  it('triggers when markup appears for the first time', () => {
    expect(
      shouldTriggerMiniMaxToolCallRecovery('<minimax:tool_call><invoke name="Read"></invoke></minimax:tool_call>', undefined, now),
    ).toBe(true);
  });

  it('does not retrigger same markup before cooldown', () => {
    const previous: MiniMaxToolCallRecoveryState = {
      lastTriggeredAt: now - 10_000,
      lastMessage: '<minimax:tool_call><invoke name="Read"></invoke></minimax:tool_call>',
      attempts: 1,
    };
    expect(
      shouldTriggerMiniMaxToolCallRecovery(previous.lastMessage, previous, now, 45_000),
    ).toBe(false);
  });

  it('retries after cooldown or when message changes', () => {
    const previous: MiniMaxToolCallRecoveryState = {
      lastTriggeredAt: now - 60_000,
      lastMessage: '<minimax:tool_call><invoke name="Read"></invoke></minimax:tool_call>',
      attempts: 1,
    };
    expect(
      shouldTriggerMiniMaxToolCallRecovery(previous.lastMessage, previous, now, 45_000),
    ).toBe(true);
    expect(
      shouldTriggerMiniMaxToolCallRecovery('<minimax:tool_call><invoke name="Bash"></invoke></minimax:tool_call>', previous, now, 45_000),
    ).toBe(true);
  });
});

describe('buildMiniMaxToolCallRecoveryPrompt', () => {
  it('contains explicit protocol guidance', () => {
    const prompt = buildMiniMaxToolCallRecoveryPrompt();
    expect(prompt).toContain('SYSTEM RECOVERY');
    expect(prompt).toContain('<minimax:tool_call>');
    expect(prompt).toContain('tool_use');
  });
});

