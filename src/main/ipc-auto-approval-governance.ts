import * as path from 'path';
import type { AutoApprovalMode, ProjectGovernanceState } from '../shared/types';
import { POLICY_RELATIVE_PATH } from './calder-governance/discovery';
import {
  GLOBAL_AUTO_APPROVAL_POLICY_PATH,
  resolveEffectiveAutoApprovalMode,
  setAutoApprovalModeInPolicyFile,
} from './calder-governance/auto-approval-policy';

export function isAutoApprovalMode(value: unknown): value is AutoApprovalMode {
  return value === 'off'
    || value === 'edit_only'
    || value === 'edit_plus_safe_tools'
    || value === 'full_auto'
    || value === 'full_auto_unsafe';
}

export function updateAutoApprovalMode(projectPath: string, scope: 'global' | 'project', mode: AutoApprovalMode | null): void {
  const targetPath = scope === 'global'
    ? GLOBAL_AUTO_APPROVAL_POLICY_PATH
    : path.join(projectPath, POLICY_RELATIVE_PATH);
  setAutoApprovalModeInPolicyFile(targetPath, mode);
}

export async function applySessionOverrideToGovernanceState(
  state: ProjectGovernanceState,
  sessionMode: AutoApprovalMode | undefined,
): Promise<ProjectGovernanceState> {
  if (!state.autoApproval || sessionMode === undefined) return state;

  const resolved = resolveEffectiveAutoApprovalMode({
    globalMode: state.autoApproval.globalMode,
    hasGlobalMode: true,
    projectMode: state.autoApproval.projectMode,
    hasProjectMode: state.autoApproval.projectMode !== undefined,
    sessionMode,
    hasSessionMode: true,
  });

  return {
    ...state,
    autoApproval: {
      ...state.autoApproval,
      sessionMode,
      effectiveMode: resolved.effectiveMode,
      policySource: resolved.policySource,
    },
  };
}
