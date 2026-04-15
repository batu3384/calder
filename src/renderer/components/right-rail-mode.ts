export type RightRailMode = 'normal' | 'tools-focus' | 'ultra-compact';
export type RightRailSectionId = 'capabilities' | 'git' | 'activity';
export type RightRailPresentation = 'compact' | 'expanded' | 'promoted' | 'ultra';

export interface RightRailSignals {
  hasDirtyGit: boolean;
  hasGitConflicts: boolean;
  hasToolingContext: boolean;
  preferUltraCompact?: boolean;
}

export function deriveRightRailMode(signals: RightRailSignals): RightRailMode {
  if (signals.preferUltraCompact) return 'ultra-compact';
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
  if (mode === 'ultra-compact') {
    return {
      capabilities: 'ultra',
      git: 'ultra',
      activity: 'ultra',
    };
  }

  if (mode === 'tools-focus') {
    return {
      capabilities: 'promoted',
      git: git.hasDirtyGit || git.hasGitConflicts ? 'expanded' : 'compact',
      activity: 'compact',
    };
  }

  return {
    capabilities: 'expanded',
    git: git.hasDirtyGit || git.hasGitConflicts ? 'promoted' : 'compact',
    activity: 'compact',
  };
}
