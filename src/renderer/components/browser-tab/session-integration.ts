import { appState } from '../../state.js';
import { deliverSurfacePrompt, queueSurfacePromptInCustomSession, queueSurfacePromptInNewSession } from '../surface-routing.js';
import type { BrowserTabInstance } from './types.js';
import { buildPrompt, dismissInspect } from './inspect-mode.js';
import { buildFlowPrompt, dismissFlow } from './flow-recording.js';

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

  const result = await deliverSurfacePrompt(project.id, prompt);
  if (!result.ok) {
    showSendError(errorEl, result.error ?? 'Failed to deliver prompt.');
    return false;
  }

  hideSendError(errorEl);
  onDelivered();
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

  queueSurfacePromptInNewSession(
    project.id,
    `Flow: ${instruction.slice(0, 30)}`,
    prompt,
  );
  dismissFlow(instance);
}

export function sendFlowToCustomSession(instance: BrowserTabInstance): void {
  const prompt = buildFlowPrompt(instance);
  if (!prompt) return;

  queueSurfacePromptInCustomSession(prompt, () => {
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

  queueSurfacePromptInNewSession(
    project.id,
    `${info.tagName}: ${instance.instructionInput.value.trim().slice(0, 30)}`,
    prompt,
  );
  dismissInspect(instance);
}

export function sendToCustomSession(instance: BrowserTabInstance): void {
  const prompt = buildPrompt(instance);
  if (!prompt) return;

  queueSurfacePromptInCustomSession(prompt, () => {
    dismissInspect(instance);
  });
}
