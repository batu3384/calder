import { appState } from '../state.js';
import { getProviderAvailabilitySnapshot, resolvePreferredProviderForLaunch } from '../provider-availability.js';
import { deliverPromptToTerminalSession, setPendingPrompt } from './terminal-pane.js';
import { promptNewSession } from './tab-bar.js';

function getPreferredLaunchProvider() {
  return resolvePreferredProviderForLaunch(
    appState.preferences.defaultProvider,
    getProviderAvailabilitySnapshot(),
  );
}

export async function deliverSurfacePrompt(
  projectId: string,
  prompt: string,
): Promise<{ ok: boolean; targetSessionId?: string; error?: string }> {
  const targetSession = appState.resolveSurfaceTargetSession(projectId);
  if (!targetSession) {
    return { ok: false, error: 'Select an open session target first.' };
  }

  const delivered = await deliverPromptToTerminalSession(targetSession.id, prompt);
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
    setPendingPrompt(session.id, prompt);
  }
  return session;
}

export function queueSurfacePromptInCustomSession(prompt: string, onReady: () => void): void {
  promptNewSession((session) => {
    setPendingPrompt(session.id, prompt);
    onReady();
  });
}
