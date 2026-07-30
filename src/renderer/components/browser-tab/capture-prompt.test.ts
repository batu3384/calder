import { describe, expect, it } from 'vitest';

import { escapePromptLiteral, formatShadowHostClause, sanitizePromptBody } from './capture-prompt.js';

describe('capture prompt helpers', () => {
  it('escapes quotes and collapses newlines in prompt literals', () => {
    expect(escapePromptLiteral("Don't\nbreak")).toBe("Don\\'t break");
  });

  it('truncates long prompt literals', () => {
    expect(escapePromptLiteral('x'.repeat(250), 20)).toBe(`${'x'.repeat(19)}…`);
  });

  it('formats shadow host chains for inspect prompts', () => {
    expect(formatShadowHostClause([['#app'], ['custom-root', '[data-host="x"]']])).toBe(
      ", shadow: '#app > custom-root'",
    );
  });

  it('returns an empty clause when no shadow hosts exist', () => {
    expect(formatShadowHostClause([])).toBe('');
    expect(formatShadowHostClause(undefined)).toBe('');
  });

  it('sanitizes long instruction bodies', () => {
    expect(sanitizePromptBody("line1\nline2")).toBe('line1 line2');
  });
});
