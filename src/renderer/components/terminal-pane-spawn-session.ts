import type { ProviderId } from '../types.js';
import { initSession } from './surface-services/session-activity.js';
import { markFreshSession } from './surface-services/session-insights.js';
import { consumeStartupPrompt } from './terminal-pane-prompt-delivery.js';

interface SpawnSessionState {
  sessionId: string;
  projectPath: string;
  cliSessionId: string | null;
  providerId: ProviderId;
  args: string;
  isResume: boolean;
  pendingPrompt: string | null;
}

export async function spawnPtySession(state: SpawnSessionState): Promise<void> {
  if (!state.isResume) {
    markFreshSession(state.sessionId);
  }
  initSession(state.sessionId);

  const initialPrompt = consumeStartupPrompt(state);
  await window.calder.pty.create(
    state.sessionId,
    state.projectPath,
    state.cliSessionId,
    state.isResume,
    state.args,
    state.providerId,
    initialPrompt,
  );
  state.isResume = true;
}
