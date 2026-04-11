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

function hideSendError(errorEl: { textContent: string; style: { display: string } }): void {
  errorEl.textContent = '';
  errorEl.style.display = 'none';
}

function showSendError(errorEl: { textContent: string; style: { display: string } }, message: string): void {
  errorEl.textContent = message;
  errorEl.style.display = 'block';
}

async function sendPromptToSelectedSession(
  instance: BrowserTabInstance,
  prompt: string,
  onDelivered: () => void,
  errorEl: { textContent: string; style: { display: string } },
): Promise<boolean> {
  const project = appState.activeProject;
  if (!project) return false;

  const targetSession = appState.resolveBrowserTargetSession(instance.sessionId);
  if (!targetSession) {
    showSendError(errorEl, 'Select an open session target first.');
    return false;
  }

  const delivered = await deliverPromptToTerminalSession(targetSession.id, prompt);
  if (!delivered) {
    showSendError(errorEl, 'Failed to deliver prompt to the selected session.');
    return false;
  }

  hideSendError(errorEl);
  onDelivered();
  appState.setActiveSession(project.id, targetSession.id);
  return true;
}

export async function sendFlowToSelectedSession(instance: BrowserTabInstance): Promise<void> {
  const prompt = buildFlowPrompt(instance);
  if (!prompt) return;
  hideSendError(instance.flowErrorEl);
  await sendPromptToSelectedSession(instance, prompt, () => dismissFlow(instance), instance.flowErrorEl);
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

  hideSendError(instance.inspectErrorEl);
  await sendPromptToSelectedSession(instance, prompt, () => dismissInspect(instance), instance.inspectErrorEl);
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
