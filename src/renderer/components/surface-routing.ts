import { appState } from '../state.js';
import { getProviderAvailabilitySnapshot, resolvePreferredProviderForLaunch } from '../provider-availability.js';
import { deliverPromptToTerminalSession, setPendingPrompt } from './terminal-pane.js';
import { promptNewSession } from './tab-bar.js';
import { appendProjectGovernanceToPrompt } from '../project-governance-prompt.js';
import { appendProjectTeamContextToPrompt } from '../project-team-context-prompt.js';

function getPreferredLaunchProvider() {
  return resolvePreferredProviderForLaunch(
    appState.preferences.defaultProvider,
    getProviderAvailabilitySnapshot(),
  );
}

function appendStrictRoutingContract(prompt: string): string {
  return [
    'Routing contract (strict):',
    '- Work only on the exact task requested below.',
    '- Do not continue into unrelated flows unless the prompt explicitly asks for it.',
    '- When the requested task is complete, stop and report completion briefly.',
    '',
    prompt,
  ].join('\n');
}

function applyProjectRoutingContext(projectId: string | undefined, prompt: string): string {
  const strictPrompt = appendStrictRoutingContract(prompt);
  if (!projectId) return strictPrompt;
  const project = appState.projects.find((entry) => entry.id === projectId)
    ?? (appState.activeProject?.id === projectId ? appState.activeProject : undefined);
  return appendProjectGovernanceToPrompt(
    appendProjectTeamContextToPrompt(strictPrompt, project?.projectTeamContext),
    project?.projectGovernance,
  );
}

export async function deliverSurfacePrompt(
  projectId: string,
  prompt: string,
): Promise<{ ok: boolean; targetSessionId?: string; error?: string }> {
  const targetSession = appState.resolveSurfaceTargetSession(projectId, { requireExplicitTarget: true });
  if (!targetSession) {
    return { ok: false, error: 'Select an open session target first.' };
  }

  const delivered = await deliverPromptToTerminalSession(targetSession.id, applyProjectRoutingContext(projectId, prompt));
  if (!delivered) {
    return { ok: false, error: 'Failed to deliver prompt to the selected session.' };
  }

  appState.setActiveSession(projectId, targetSession.id);
  return { ok: true, targetSessionId: targetSession.id };
}

export function queueSurfacePromptInNewSession(projectId: string, sessionName: string, prompt: string) {
  const session = appState.addPlanSession(
    projectId,
    sessionName,
    getPreferredLaunchProvider(),
  );
  if (session) {
    setPendingPrompt(session.id, applyProjectRoutingContext(projectId, prompt));
  }
  return session;
}

export function queueSurfacePromptInCustomSession(prompt: string, onReady: () => void, projectId?: string): void {
  promptNewSession((session) => {
    setPendingPrompt(session.id, applyProjectRoutingContext(projectId, prompt));
    onReady();
  });
}
