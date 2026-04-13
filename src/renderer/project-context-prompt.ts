import type { AppliedContextSummary, ProjectContextState, ProviderId } from '../shared/types.js';
import { appState } from './state.js';

export function buildAppliedContextSummary(
  projectId: string,
  providerId?: ProviderId,
): AppliedContextSummary | undefined {
  const projects = Array.isArray((appState as { projects?: unknown }).projects)
    ? (appState as { projects: Array<{ id: string; projectContext?: ProjectContextState }> }).projects
    : [];
  const activeProject = (appState as { activeProject?: { id: string; projectContext?: ProjectContextState } }).activeProject;
  const project = projects.find((entry) => entry.id === projectId)
    ?? (activeProject?.id === projectId ? activeProject : undefined);
  const projectContext = project?.projectContext;
  if (!projectContext || projectContext.sources.length === 0) {
    return undefined;
  }

  const enabledSources = projectContext.sources.filter((source) => source.enabled !== false);
  const sharedRules = enabledSources.filter((source) => source.provider === 'shared' && source.kind === 'rules');
  const providerSources = providerId
    ? enabledSources.filter((source) => source.provider === providerId && source.kind !== 'mcp')
    : [];
  const selectedSources = [...providerSources.slice(0, 1), ...sharedRules.slice(0, 2)];

  if (selectedSources.length === 0) {
    return undefined;
  }

  return {
    sources: selectedSources.map((source) => ({
      id: source.id,
      provider: source.provider,
      displayName: source.displayName,
      kind: source.kind,
    })),
    sharedRuleCount: sharedRules.length,
    providerContextSummary: providerSources.length > 0
      ? providerSources.slice(0, 2).map((source) => source.displayName).join(', ')
      : undefined,
    sharedRulesSummary: sharedRules.length > 0
      ? sharedRules.slice(0, 3).map((source) => source.displayName).join(', ')
      : undefined,
  };
}

export function appendAppliedContextToPrompt(
  prompt: string,
  appliedContext?: AppliedContextSummary,
): string {
  if (!appliedContext || appliedContext.sources.length === 0) {
    return prompt;
  }

  const lines = ['', 'Project context:'];
  if (appliedContext.providerContextSummary) {
    lines.push(`Provider memory: ${appliedContext.providerContextSummary}`);
  }
  if (appliedContext.sharedRulesSummary) {
    lines.push(`Shared rules: ${appliedContext.sharedRulesSummary}`);
  }
  lines.push(`Applied sources: ${appliedContext.sources.map((source) => source.displayName).join(', ')}`);
  return `${prompt}${lines.join('\n')}`;
}
