import { getProviderCapabilities } from '../provider-availability.js';
import type { ProviderId } from '../types.js';

interface StartupPromptState {
  pendingPrompt: string | null;
  providerId: ProviderId;
}

interface PromptDeliveryState {
  sessionId: string;
  spawned: boolean;
}

interface PendingPromptTimerState {
  pendingPromptTimer: ReturnType<typeof setTimeout> | null;
}

interface DeliverPromptParams {
  session: PromptDeliveryState;
  prompt: string;
  setPendingPrompt: (sessionId: string, prompt: string) => void;
  spawnSession: (sessionId: string) => Promise<void>;
}

function buildBracketedPastePayload(prompt: string): string {
  return `\u001b[200~${prompt}\u001b[201~\r`;
}

export function consumeStartupPrompt(state: StartupPromptState): string | undefined {
  if (state.pendingPrompt && getProviderCapabilities(state.providerId)?.pendingPromptTrigger === 'startup-arg') {
    const startupPrompt = state.pendingPrompt;
    state.pendingPrompt = null;
    return startupPrompt;
  }
  return undefined;
}

export async function deliverPrompt(params: DeliverPromptParams): Promise<void> {
  const { session, prompt, setPendingPrompt, spawnSession } = params;

  if (!session.spawned) {
    setPendingPrompt(session.sessionId, prompt);
    await spawnSession(session.sessionId);
    return;
  }

  window.calder.pty.write(session.sessionId, buildBracketedPastePayload(prompt));
}

export function clearPendingPromptTimer(state: PendingPromptTimerState): void {
  if (state.pendingPromptTimer) {
    clearTimeout(state.pendingPromptTimer);
    state.pendingPromptTimer = null;
  }
}
