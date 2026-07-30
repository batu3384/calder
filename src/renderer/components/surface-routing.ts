import { appendProjectTeamContextToPrompt } from '../project-team-context-prompt.js';
import { appState } from '../state.js';
import { appendProjectGovernanceToPrompt } from './surface-services/project-governance-prompt.js';
import {
  getProviderAvailabilitySnapshot,
  resolvePreferredProviderForLaunch,
} from './surface-services/provider-availability.js';
import { promptNewSession } from './tab-bar/tab-bar.js';
import { deliverPromptToTerminalSession, setPendingPrompt } from './terminal-pane.js';

export interface SurfaceRoutingOptions {
  strictContract?: boolean;
}

export interface DeliverBrowserCapturePromptOptions extends SurfaceRoutingOptions {
  targetSessionId?: string;
}

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

export function applyProjectRoutingContext(
  projectId: string | undefined,
  prompt: string,
  options?: SurfaceRoutingOptions,
): string {
  const useStrictContract = options?.strictContract !== false;
  const routedPrompt = useStrictContract ? appendStrictRoutingContract(prompt) : prompt;
  if (!projectId) return routedPrompt;
  const project =
    appState.projects.find((entry) => entry.id === projectId) ??
    (appState.activeProject?.id === projectId ? appState.activeProject : undefined);
  return appendProjectGovernanceToPrompt(
    appendProjectTeamContextToPrompt(routedPrompt, project?.projectTeamContext),
    project?.projectGovernance,
  );
}

function resolveCaptureTargetSession(
  projectId: string,
  browserSessionId: string,
  targetSessionId?: string,
) {
  if (targetSessionId) {
    const listed = appState
      .listSurfaceTargetSessions(projectId)
      .find((session) => session.id === targetSessionId);
    if (listed) return listed;
  }
  return appState.resolveBrowserTargetSession(browserSessionId);
}

function seedExplicitBrowserTarget(
  projectId: string,
  browserSessionId: string,
  targetSessionId: string,
): void {
  const explicitTarget = appState.resolveSurfaceTargetSession(projectId, {
    requireExplicitTarget: true,
  });
  if (explicitTarget?.id === targetSessionId) return;
  appState.setBrowserTargetSession(browserSessionId, targetSessionId);
}

async function deliverPromptToResolvedTarget(
  projectId: string,
  targetSession: { id: string },
  prompt: string,
  options?: SurfaceRoutingOptions,
): Promise<{ ok: boolean; targetSessionId?: string; error?: string }> {
  const delivered = await deliverPromptToTerminalSession(
    targetSession.id,
    applyProjectRoutingContext(projectId, prompt, options),
  );
  if (!delivered) {
    return { ok: false, error: 'Failed to deliver prompt to the selected session.' };
  }

  appState.setActiveSession(projectId, targetSession.id);
  return { ok: true, targetSessionId: targetSession.id };
}

export async function deliverBrowserCapturePrompt(
  projectId: string,
  browserSessionId: string,
  prompt: string,
  options?: DeliverBrowserCapturePromptOptions,
): Promise<{ ok: boolean; targetSessionId?: string; error?: string }> {
  const targetSession = resolveCaptureTargetSession(
    projectId,
    browserSessionId,
    options?.targetSessionId,
  );
  if (!targetSession) {
    return { ok: false, error: 'Select an open session target first.' };
  }

  seedExplicitBrowserTarget(projectId, browserSessionId, targetSession.id);
  return deliverPromptToResolvedTarget(projectId, targetSession, prompt, options);
}

export async function deliverSurfacePrompt(
  projectId: string,
  prompt: string,
): Promise<{ ok: boolean; targetSessionId?: string; error?: string }> {
  const targetSession = appState.resolveSurfaceTargetSession(projectId, {
    requireExplicitTarget: true,
  });
  if (!targetSession) {
    return { ok: false, error: 'Select an open session target first.' };
  }

  return deliverPromptToResolvedTarget(projectId, targetSession, prompt);
}

export function queueSurfacePromptInNewSession(
  projectId: string,
  sessionName: string,
  prompt: string,
  providerOverride?: ReturnType<typeof getPreferredLaunchProvider>,
  routingOptions?: SurfaceRoutingOptions,
) {
  const session = appState.addPlanSession(
    projectId,
    sessionName,
    providerOverride ?? getPreferredLaunchProvider(),
  );
  if (session) {
    setPendingPrompt(session.id, applyProjectRoutingContext(projectId, prompt, routingOptions));
  }
  return session;
}

export function queueSurfacePromptInCustomSession(
  prompt: string,
  onReady: () => void,
  projectId?: string,
  routingOptions?: SurfaceRoutingOptions,
): void {
  promptNewSession((session) => {
    setPendingPrompt(session.id, applyProjectRoutingContext(projectId, prompt, routingOptions));
    onReady();
  });
}
