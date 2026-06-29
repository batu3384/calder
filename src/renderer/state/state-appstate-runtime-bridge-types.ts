import type { ProjectRecord } from '../../shared/types/project-state.js';
import type { ProviderId } from '../../shared/types/provider.js';
import type { EventType } from './state-contracts.js';

export type BuildResumePrompt = (
  sourceProviderId: ProviderId,
  sourceCliSessionId: string | null,
  projectPath: string,
  sourceName: string,
) => Promise<string>;

export interface AppStateRuntimeBridge {
  projects: ProjectRecord[];
  defaultProviderId?: ProviderId;
  sessionHistoryEnabled: boolean;
  pushNav: (sessionId: string) => void;
  pruneNav: (sessionId: string) => void;
  persist: () => void;
  emit: (event: EventType, data?: unknown) => void;
  buildResumePrompt: BuildResumePrompt;
}
