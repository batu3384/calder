import { describe, expect, it } from 'vitest';
import {
  deriveRightRailMode,
  deriveRightRailPresentation,
  type RightRailSignals,
} from './right-rail-mode.js';

const baseSignals: RightRailSignals = {
  hasHealthWarning: false,
  hasDirtyGit: false,
  hasGitConflicts: false,
  hasToolingContext: true,
};

describe('deriveRightRailMode', () => {
  it('prefers warning when health issues exist', () => {
    expect(deriveRightRailMode({ ...baseSignals, hasHealthWarning: true })).toBe('warning');
  });

  it('uses tools-focus when tooling context is present and health is clear', () => {
    expect(deriveRightRailMode(baseSignals)).toBe('tools-focus');
  });

  it('falls back to normal when there is no active tooling context', () => {
    expect(deriveRightRailMode({ ...baseSignals, hasToolingContext: false })).toBe('normal');
  });
});

describe('deriveRightRailPresentation', () => {
  it('promotes capabilities in tools-focus mode', () => {
    expect(deriveRightRailPresentation('tools-focus').capabilities).toBe('promoted');
  });

  it('promotes health in warning mode', () => {
    expect(deriveRightRailPresentation('warning').health).toBe('promoted');
  });

  it('promotes git when the worktree is dirty in normal mode', () => {
    expect(
      deriveRightRailPresentation('normal', { hasDirtyGit: true, hasGitConflicts: false }).git,
    ).toBe('promoted');
  });
});
