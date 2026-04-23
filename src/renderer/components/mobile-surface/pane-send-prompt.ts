import type { MobileInspectPlatform } from '../../../shared/types/mobile.js';
import {
  appendAppliedContextToPrompt,
  buildAppliedContextSummary,
  formatAppliedContextTrace,
} from '../../project-context-prompt.js';
import { appState } from '../../state.js';
import type { ProviderId } from '../../types.js';
import { deliverSurfacePrompt } from '../surface-routing.js';
import { buildMobileInspectPrompt, resolveMobileInspectPromptError } from './inspect-prompt.js';
import type { MobileSurfacePaneInstance } from './types.js';

type StatusTone = 'default' | 'success' | 'error';

interface SendInspectPromptOptions {
  instance: MobileSurfacePaneInstance;
  platformLabels: Record<MobileInspectPlatform, string>;
  setInspectStatus(instance: MobileSurfacePaneInstance, message: string, tone?: StatusTone): void;
  rerenderFromState(instance: MobileSurfacePaneInstance): void;
}

function buildMobileAppliedContext(projectId: string, providerId?: ProviderId) {
  return buildAppliedContextSummary(projectId, providerId);
}

export async function sendInspectPromptToSelectedSession(options: SendInspectPromptOptions): Promise<void> {
  const { instance, platformLabels, setInspectStatus, rerenderFromState } = options;
  const prompt = buildMobileInspectPrompt({
    inspectState: instance.inspectState,
    platformLabel: platformLabels[instance.inspectState.platform],
  });
  if (!prompt) {
    instance.inspectState.sendError = resolveMobileInspectPromptError(instance.inspectState);
    rerenderFromState(instance);
    return;
  }

  const target = appState.resolveSurfaceTargetSession(instance.projectId, { requireExplicitTarget: true });
  if (!target) {
    instance.inspectState.sendError = 'Select an open session target first.';
    rerenderFromState(instance);
    return;
  }

  const appliedContext = buildMobileAppliedContext(instance.projectId, target.providerId ?? 'claude');
  instance.inspectState.contextTrace = formatAppliedContextTrace(appliedContext);
  const routedPrompt = appendAppliedContextToPrompt(prompt, appliedContext);

  const result = await deliverSurfacePrompt(instance.projectId, routedPrompt);
  if (!result.ok) {
    instance.inspectState.sendError = result.error ?? 'Failed to deliver prompt.';
    rerenderFromState(instance);
    return;
  }

  instance.inspectState.sendError = '';
  setInspectStatus(instance, `Prompt sent to ${target.name}.`, 'success');
  rerenderFromState(instance);
}
