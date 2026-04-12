export type RightRailMode = 'normal' | 'warning' | 'tools-focus';
export type RightRailSectionId = 'capabilities' | 'git' | 'health' | 'activity';
export type RightRailPresentation = 'compact' | 'expanded' | 'promoted';

export interface RightRailSignals {
  hasHealthWarning: boolean;
  hasDirtyGit: boolean;
  hasGitConflicts: boolean;
  hasToolingContext: boolean;
}

export function deriveRightRailMode(signals: RightRailSignals): RightRailMode {
  if (signals.hasHealthWarning) return 'warning';
  if (signals.hasToolingContext) return 'tools-focus';
  return 'normal';
}

export function deriveRightRailPresentation(
  mode: RightRailMode,
  git: Pick<RightRailSignals, 'hasDirtyGit' | 'hasGitConflicts'> = {
    hasDirtyGit: false,
    hasGitConflicts: false,
  },
): Record<RightRailSectionId, RightRailPresentation> {
  if (mode === 'warning') {
    return {
      capabilities: 'expanded',
      git: git.hasDirtyGit || git.hasGitConflicts ? 'expanded' : 'compact',
      health: 'promoted',
      activity: 'compact',
    };
  }

  if (mode === 'tools-focus') {
    return {
      capabilities: 'promoted',
      git: git.hasDirtyGit || git.hasGitConflicts ? 'expanded' : 'compact',
      health: 'compact',
      activity: 'compact',
    };
  }

  return {
    capabilities: 'expanded',
    git: git.hasDirtyGit || git.hasGitConflicts ? 'promoted' : 'compact',
    health: 'compact',
    activity: 'compact',
  };
}
