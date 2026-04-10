import { appState } from '../../state.js';
import { getProviderAvailabilitySnapshot, resolvePreferredProviderForLaunch } from '../../provider-availability.js';
import { promptNewSession } from '../tab-bar.js';
import { deliverPromptToTerminalSession, setPendingPrompt } from '../terminal-pane.js';
import type { BrowserTabInstance } from './types.js';
import { buildPrompt, dismissInspect } from './inspect-mode.js';
import { buildFlowPrompt, dismissFlow } from './flow-recording.js';

function getPreferredLaunchProvider() {
  return resolvePreferredProviderForLaunch(
    appState.preferences.defaultProvider,
    getProviderAvailabilitySnapshot(),
  );
}

async function sendPromptToSelectedSession(
  instance: BrowserTabInstance,
  prompt: string,
  onDelivered: () => void,
): Promise<void> {
  const project = appState.activeProject;
  if (!project) return;

  const targetSession = appState.resolveBrowserTargetSession(instance.sessionId);
  if (!targetSession) return;

  const delivered = await deliverPromptToTerminalSession(targetSession.id, prompt);
  if (!delivered) return;

  onDelivered();
  appState.setActiveSession(project.id, targetSession.id);
}

export async function sendFlowToSelectedSession(instance: BrowserTabInstance): Promise<void> {
  const prompt = buildFlowPrompt(instance);
  if (!prompt) return;
  await sendPromptToSelectedSession(instance, prompt, () => dismissFlow(instance));
}

export function sendFlowToNewSession(instance: BrowserTabInstance): void {
  const instruction = instance.flowInstructionInput.value.trim();
  const prompt = buildFlowPrompt(instance);
  if (!prompt) return;
  const project = appState.activeProject;
  if (!project) return;

  const newSession = appState.addPlanSession(
    project.id,
    `Flow: ${instruction.slice(0, 30)}`,
    getPreferredLaunchProvider(),
  );
  if (newSession) {
    setPendingPrompt(newSession.id, prompt);
  }
  dismissFlow(instance);
}

export function sendFlowToCustomSession(instance: BrowserTabInstance): void {
  const prompt = buildFlowPrompt(instance);
  if (!prompt) return;

  promptNewSession((session) => {
    setPendingPrompt(session.id, prompt);
    dismissFlow(instance);
  });
}

export async function sendToSelectedSession(instance: BrowserTabInstance): Promise<void> {
  const info = instance.selectedElement;
  const prompt = buildPrompt(instance);
  if (!info || !prompt) return;

  await sendPromptToSelectedSession(instance, prompt, () => dismissInspect(instance));
}

export function sendToNewSession(instance: BrowserTabInstance): void {
  const info = instance.selectedElement;
  const prompt = buildPrompt(instance);
  if (!info || !prompt) return;
  const project = appState.activeProject;
  if (!project) return;

  const sessionName = `${info.tagName}: ${instance.instructionInput.value.trim().slice(0, 30)}`;
  const newSession = appState.addPlanSession(project.id, sessionName, getPreferredLaunchProvider());
  if (newSession) {
    setPendingPrompt(newSession.id, prompt);
  }
  dismissInspect(instance);
}

export function sendToCustomSession(instance: BrowserTabInstance): void {
  const prompt = buildPrompt(instance);
  if (!prompt) return;

  promptNewSession((session) => {
    setPendingPrompt(session.id, prompt);
    dismissInspect(instance);
  });
}
