export type RightRailMode = 'normal' | 'tools-focus';
export type RightRailSectionId = 'capabilities' | 'git' | 'activity';
export type RightRailPresentation = 'compact' | 'expanded' | 'promoted';

export interface RightRailSignals {
  hasDirtyGit: boolean;
  hasGitConflicts: boolean;
  hasToolingContext: boolean;
}

export function deriveRightRailMode(signals: RightRailSignals): RightRailMode {
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
