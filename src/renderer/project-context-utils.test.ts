import { describe, expect, it } from 'vitest';
import { toProjectRelativeContextPath } from './project-context-utils.js';

describe('toProjectRelativeContextPath', () => {
  it('returns a relative path for files inside the project root', () => {
    expect(toProjectRelativeContextPath('/repo', '/repo/.calder/rules/testing.hard.md')).toBe('.calder/rules/testing.hard.md');
  });

  it('returns null for files outside the project root', () => {
    expect(toProjectRelativeContextPath('/repo', '/other/CLAUDE.md')).toBeNull();
  });

  it('handles windows-style separators consistently', () => {
    expect(toProjectRelativeContextPath('C:\\repo', 'C:\\repo\\.calder\\rules\\testing.hard.md')).toBe('.calder/rules/testing.hard.md');
  });
});
