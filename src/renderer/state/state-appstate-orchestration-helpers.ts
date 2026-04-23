import type { PersistedState, ProjectRecord } from '../../shared/types/project-state.js';
import type { EventType } from './state-contracts.js';
import { setProjectDomainState } from '../state-project-domain-updater.js';
import type { ProjectDomainStateKey } from '../state-project-domain-updater.js';
import type { AppStateRuntimeBridge } from './state-appstate-runtime-bridge.js';

interface RuntimeBridgeFactoryArgs {
  state: PersistedState;
  pushNav: (sessionId: string) => void;
  pruneNav: (sessionId: string) => void;
  persist: () => void;
  emit: (event: EventType, data?: unknown) => void;
  buildResumePrompt: AppStateRuntimeBridge['buildResumePrompt'];
}

interface SetProjectDomainForStateArgs<K extends ProjectDomainStateKey> {
  projects: ProjectRecord[];
  activeProjectId: string | null;
  projectId: string;
  key: K;
  incoming: ProjectRecord[K];
  normalize: (
    incoming: NonNullable<ProjectRecord[K]>,
    previous: ProjectRecord[K],
  ) => ProjectRecord[K];
  persist: () => void;
  emit: (event: EventType) => void;
}

interface UpdateProjectSurfaceForStateArgs {
  projects: ProjectRecord[];
  projectId: string;
  mutate: (project: ProjectRecord) => boolean;
  persist: () => void;
  emit: (event: EventType) => void;
}

export function createAppStateRuntimeBridge(args: RuntimeBridgeFactoryArgs): AppStateRuntimeBridge {
  const {
    state,
    pushNav,
    pruneNav,
    persist,
    emit,
    buildResumePrompt,
  } = args;
  return {
    projects: state.projects,
    defaultProviderId: state.preferences.defaultProvider,
    sessionHistoryEnabled: state.preferences.sessionHistoryEnabled,
    pushNav,
    pruneNav,
    persist,
    emit,
    buildResumePrompt,
  };
}

export function setProjectDomainForState<K extends ProjectDomainStateKey>(
  args: SetProjectDomainForStateArgs<K>,
): void {
  const {
    projects,
    activeProjectId,
    projectId,
    key,
    incoming,
    normalize,
    persist,
    emit,
  } = args;
  const project = projects.find((entry) => entry.id === projectId);
  if (!project) return;
  if (!setProjectDomainState(project, key, incoming, normalize)) return;
  persist();
  if (project.id === activeProjectId) emit('project-changed');
}

export function updateProjectSurfaceForState(args: UpdateProjectSurfaceForStateArgs): void {
  const {
    projects,
    projectId,
    mutate,
    persist,
    emit,
  } = args;
  const project = projects.find((entry) => entry.id === projectId);
  if (!project || !mutate(project)) return;
  persist();
  emit('project-changed');
  emit('session-changed');
}
