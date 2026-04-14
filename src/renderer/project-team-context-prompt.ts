import type { ProjectTeamContextState } from '../shared/types.js';

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function buildProjectTeamContextPromptBlock(
  projectTeamContext?: ProjectTeamContextState,
): string | undefined {
  if (!projectTeamContext) return undefined;
  const spaces = projectTeamContext.spaces.slice(0, 3);
  if (spaces.length === 0 && projectTeamContext.sharedRuleCount === 0 && projectTeamContext.workflowCount === 0) {
    return undefined;
  }

  const lines = ['Team context:'];
  if (spaces.length > 0) {
    lines.push(`Shared spaces: ${spaces.map((space) => space.displayName).join(', ')}`);
    const summaries = spaces
      .filter((space) => space.summary)
      .map((space) => `- ${space.displayName}: ${space.summary}`);
    if (summaries.length > 0) {
      lines.push('Space summaries:', ...summaries);
    }
  }
  lines.push(
    `Rules/workflows: ${pluralize(projectTeamContext.sharedRuleCount, 'shared rule')}, ${pluralize(projectTeamContext.workflowCount, 'reusable workflow', 'reusable workflows')}`,
  );
  return lines.join('\n');
}

export function appendProjectTeamContextToPrompt(
  prompt: string,
  projectTeamContext?: ProjectTeamContextState,
): string {
  const block = buildProjectTeamContextPromptBlock(projectTeamContext);
  return block ? `${prompt}\n\n${block}` : prompt;
}
