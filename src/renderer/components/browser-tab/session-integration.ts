import { appState } from '../../state.js';
import {
  appendAppliedContextToPrompt,
  buildAppliedContextSummary,
  formatAppliedContextTrace,
} from '../../project-context-prompt.js';
import { deliverSurfacePrompt, queueSurfacePromptInCustomSession, queueSurfacePromptInNewSession } from '../surface-routing.js';
import type { BrowserTabInstance } from './types.js';
import type { ProviderId } from '../../types.js';
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

function showContextTrace(traceEl: { textContent: string; style: { display: string } }, contextLines: string[]): void {
  traceEl.textContent = `Applied context:\n${contextLines.join('\n')}`;
  traceEl.style.display = 'block';
}

function buildBrowserAppliedContext(providerId?: ProviderId) {
  const project = appState.activeProject;
  if (!project) return undefined;
  return buildAppliedContextSummary(project.id, providerId);
}

async function sendPromptToSelectedSession(
  instance: BrowserTabInstance,
  prompt: string,
  onDelivered: () => void,
  errorEl: { textContent: string; style: { display: string } },
  traceEl: { textContent: string; style: { display: string } },
): Promise<boolean> {
  const project = appState.activeProject;
  if (!project) return false;
  const targetProviderId = appState.resolveBrowserTargetSession(instance.sessionId)?.providerId;
  const appliedContext = buildBrowserAppliedContext(targetProviderId);
  const routedPrompt = appendAppliedContextToPrompt(prompt, appliedContext);
  showContextTrace(traceEl, formatAppliedContextTrace(appliedContext));

  const result = await deliverSurfacePrompt(project.id, routedPrompt);
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
  await sendPromptToSelectedSession(instance, prompt, () => dismissFlow(instance), instance.flowErrorEl, instance.flowContextTraceEl);
}

export function sendFlowToNewSession(instance: BrowserTabInstance): void {
  const instruction = instance.flowInstructionInput.value.trim();
  const prompt = buildFlowPrompt(instance);
  if (!prompt) return;
  const project = appState.activeProject;
  if (!project) return;
  const appliedContext = buildBrowserAppliedContext(appState.preferences.defaultProvider);
  const routedPrompt = appendAppliedContextToPrompt(
    prompt,
    appliedContext,
  );
  showContextTrace(instance.flowContextTraceEl, formatAppliedContextTrace(appliedContext));

  queueSurfacePromptInNewSession(
    project.id,
    `Flow: ${instruction.slice(0, 30)}`,
    routedPrompt,
  );
  dismissFlow(instance);
}

export function sendFlowToCustomSession(instance: BrowserTabInstance): void {
  const prompt = buildFlowPrompt(instance);
  if (!prompt) return;
  const project = appState.activeProject;
  const appliedContext = buildBrowserAppliedContext();
  const routedPrompt = appendAppliedContextToPrompt(prompt, appliedContext);
  showContextTrace(instance.flowContextTraceEl, formatAppliedContextTrace(appliedContext));

  queueSurfacePromptInCustomSession(routedPrompt, () => {
    dismissFlow(instance);
  }, project?.id);
}

export async function sendToSelectedSession(instance: BrowserTabInstance): Promise<void> {
  const info = instance.selectedElement;
  const prompt = buildPrompt(instance);
  if (!info || !prompt) return;

  hideSendError(instance.inspectErrorEl);
  await sendPromptToSelectedSession(
    instance,
    prompt,
    () => dismissInspect(instance),
    instance.inspectErrorEl,
    instance.inspectContextTraceEl,
  );
}

export function sendToNewSession(instance: BrowserTabInstance): void {
  const info = instance.selectedElement;
  const prompt = buildPrompt(instance);
  if (!info || !prompt) return;
  const project = appState.activeProject;
  if (!project) return;
  const appliedContext = buildBrowserAppliedContext(appState.preferences.defaultProvider);
  const routedPrompt = appendAppliedContextToPrompt(
    prompt,
    appliedContext,
  );
  showContextTrace(instance.inspectContextTraceEl, formatAppliedContextTrace(appliedContext));

  queueSurfacePromptInNewSession(
    project.id,
    `${info.tagName}: ${instance.instructionInput.value.trim().slice(0, 30)}`,
    routedPrompt,
  );
  dismissInspect(instance);
}

export function sendToCustomSession(instance: BrowserTabInstance): void {
  const prompt = buildPrompt(instance);
  if (!prompt) return;
  const project = appState.activeProject;
  const appliedContext = buildBrowserAppliedContext();
  const routedPrompt = appendAppliedContextToPrompt(prompt, appliedContext);
  showContextTrace(instance.inspectContextTraceEl, formatAppliedContextTrace(appliedContext));

  queueSurfacePromptInCustomSession(routedPrompt, () => {
    dismissInspect(instance);
  }, project?.id);
}
