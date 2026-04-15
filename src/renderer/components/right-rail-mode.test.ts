import { describe, expect, it } from 'vitest';
import {
  deriveRightRailMode,
  deriveRightRailPresentation,
  type RightRailSignals,
} from './right-rail-mode.js';

const baseSignals: RightRailSignals = {
  hasDirtyGit: false,
  hasGitConflicts: false,
  hasToolingContext: true,
};

describe('deriveRightRailMode', () => {
  it('uses tools-focus when tooling context is present', () => {
    expect(deriveRightRailMode(baseSignals)).toBe('tools-focus');
  });

  it('uses ultra-compact when explicitly preferred', () => {
    expect(deriveRightRailMode({ ...baseSignals, preferUltraCompact: true })).toBe('ultra-compact');
  });

  it('falls back to normal when there is no active tooling context', () => {
    expect(deriveRightRailMode({ ...baseSignals, hasToolingContext: false })).toBe('normal');
  });
});

describe('deriveRightRailPresentation', () => {
  it('promotes capabilities in tools-focus mode', () => {
    expect(deriveRightRailPresentation('tools-focus').capabilities).toBe('promoted');
  });

  it('promotes git when the worktree is dirty in normal mode', () => {
    expect(
      deriveRightRailPresentation('normal', { hasDirtyGit: true, hasGitConflicts: false }).git,
    ).toBe('promoted');
  });

  it('switches all sections to ultra presentation in ultra-compact mode', () => {
    const presentation = deriveRightRailPresentation('ultra-compact');
    expect(presentation.capabilities).toBe('ultra');
    expect(presentation.git).toBe('ultra');
    expect(presentation.activity).toBe('ultra');
  });
});
