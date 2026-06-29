import * as gitStatusModule from '../../git-status.js';

type GitStatusModule = typeof gitStatusModule;
const gitStatus = gitStatusModule as GitStatusModule;

export type { GitStatus } from '../../git-status.js';

export const onChange: GitStatusModule['onChange'] = (...args) => gitStatus.onChange(...args);
export const getGitStatus: GitStatusModule['getGitStatus'] = (...args) =>
  gitStatus.getGitStatus(...args);
export const getActiveGitPath: GitStatusModule['getActiveGitPath'] = (...args) =>
  gitStatus.getActiveGitPath(...args);
export const getWorktrees: GitStatusModule['getWorktrees'] = (...args) =>
  gitStatus.getWorktrees(...args);
export const setActiveWorktree: GitStatusModule['setActiveWorktree'] = (...args) =>
  gitStatus.setActiveWorktree(...args);
export const onWorktreeChange: GitStatusModule['onWorktreeChange'] = (...args) =>
  gitStatus.onWorktreeChange(...args);
export const refreshGitStatus: GitStatusModule['refreshGitStatus'] = (...args) =>
  gitStatus.refreshGitStatus(...args);
