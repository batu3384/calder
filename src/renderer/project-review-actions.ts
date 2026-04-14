import type { ProjectReviewDocument } from '../shared/types.js';
import { appState } from './state.js';
import { appendAppliedContextToPrompt, buildAppliedContextSummary } from './project-context-prompt.js';
import { appendProjectGovernanceToPrompt } from './project-governance-prompt.js';
import { appendProjectTeamContextToPrompt } from './project-team-context-prompt.js';
import { deliverPromptToTerminalSession } from './components/terminal-pane.js';

function resolveActivePreviewUrl(projectId: string): string | undefined {
  const project = appState.projects.find((entry) => entry.id === projectId);
  const webSurface = project?.surface?.web;
  return webSurface?.url || webSurface?.history?.at(-1);
}

export function buildProjectReviewFixPrompt(review: ProjectReviewDocument): string {
  const body = review.contents.trim();
  return [
    'Address the following saved review findings in the current task context.',
    `Review findings: ${review.title}`,
    `Source: ${review.relativePath}`,
    body,
    'Work through the findings in priority order. If a finding no longer applies, explain that briefly before moving on.',
  ].filter(Boolean).join('\n\n');
}

export async function sendProjectReviewToSelectedSession(
  projectId: string,
  review: ProjectReviewDocument,
): Promise<{ ok: boolean; targetSessionId?: string; error?: string }> {
  const targetSession = appState.resolveSurfaceTargetSession(projectId);
  if (!targetSession) {
    return { ok: false, error: 'Open or select a CLI session first.' };
  }

  const reviewPromptParts = [buildProjectReviewFixPrompt(review)];
  const activePreviewUrl = resolveActivePreviewUrl(projectId);
  if (activePreviewUrl) {
    reviewPromptParts.push(`Active preview URL: ${activePreviewUrl}`);
  }

  const project = appState.projects.find((entry) => entry.id === projectId);
  const promptWithContext = appendAppliedContextToPrompt(
    reviewPromptParts.join('\n\n'),
    buildAppliedContextSummary(projectId, targetSession.providerId),
  );
  const prompt = appendProjectGovernanceToPrompt(
    appendProjectTeamContextToPrompt(promptWithContext, project?.projectTeamContext),
    project?.projectGovernance,
  );

  const delivered = await deliverPromptToTerminalSession(targetSession.id, prompt);
  if (!delivered) {
    return { ok: false, error: 'Failed to deliver review findings to the selected session.' };
  }

  appState.setActiveSession(projectId, targetSession.id);
  return { ok: true, targetSessionId: targetSession.id };
}
