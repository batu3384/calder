import type { ProjectBackgroundTaskDocument, ProviderId } from '../shared/types.js';
import { appState } from './state.js';
import { appendAppliedContextToPrompt, buildAppliedContextSummary } from './project-context-prompt.js';
import { appendProjectGovernanceToPrompt } from './project-governance-prompt.js';
import { appendProjectTeamContextToPrompt } from './project-team-context-prompt.js';
import { deliverPromptToTerminalSession, setPendingPrompt } from './components/terminal-pane.js';

export function buildProjectBackgroundTaskPrompt(task: ProjectBackgroundTaskDocument): string {
  return [
    'Take over this queued Calder background task.',
    `Task: ${task.title}`,
    `Source: ${task.relativePath}`,
    `Status: ${task.status}`,
    task.prompt,
    task.handoff ? `Handoff:\n${task.handoff}` : null,
    task.artifacts.length > 0 ? `Known artifacts:\n${task.artifacts.map((artifact) => `- ${artifact}`).join('\n')}` : null,
    'Work through the task carefully. If the task is stale or unsafe, explain why before making changes.',
  ].filter(Boolean).join('\n\n');
}

function buildProjectBackgroundTaskRoutedPrompt(
  projectId: string,
  providerId: ProviderId | undefined,
  task: ProjectBackgroundTaskDocument,
): string {
  const project = appState.projects.find((entry) => entry.id === projectId);
  const promptWithContext = appendAppliedContextToPrompt(
    buildProjectBackgroundTaskPrompt(task),
    buildAppliedContextSummary(projectId, providerId),
  );

  return appendProjectGovernanceToPrompt(
    appendProjectTeamContextToPrompt(promptWithContext, project?.projectTeamContext),
    project?.projectGovernance,
  );
}

export async function sendProjectBackgroundTaskToSelectedSession(
  projectId: string,
  task: ProjectBackgroundTaskDocument,
): Promise<{ ok: boolean; targetSessionId?: string; error?: string }> {
  const targetSession = appState.resolveSurfaceTargetSession(projectId, { requireExplicitTarget: true });
  if (!targetSession) {
    return { ok: false, error: 'Open or select a CLI session first.' };
  }

  const prompt = buildProjectBackgroundTaskRoutedPrompt(projectId, targetSession.providerId, task);

  const delivered = await deliverPromptToTerminalSession(targetSession.id, prompt);
  if (!delivered) {
    return { ok: false, error: 'Failed to deliver background task to the selected session.' };
  }

  appState.setActiveSession(projectId, targetSession.id);
  return { ok: true, targetSessionId: targetSession.id };
}

export function resumeProjectBackgroundTaskInNewSession(
  projectId: string,
  task: ProjectBackgroundTaskDocument,
): { ok: boolean; targetSessionId?: string; error?: string } {
  const sessionName = task.status === 'queued' ? task.title : `${task.title} (resume)`;
  const session = appState.addPlanSession(projectId, sessionName);
  if (!session) {
    return { ok: false, error: 'Unable to create a new CLI session for this task.' };
  }

  setPendingPrompt(session.id, buildProjectBackgroundTaskRoutedPrompt(projectId, session.providerId, task));
  return { ok: true, targetSessionId: session.id };
}
