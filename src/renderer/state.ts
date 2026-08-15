export type { PersistedState, Preferences, ProjectRecord } from '../shared/types/project-state.js';
export type { ArchivedSession, SessionRecord } from '../shared/types/session.js';
export {
  _resetForTesting,
  AppState,
  appState,
  createAppState,
  getAppState,
  MAX_SESSION_NAME_LENGTH,
} from './state/state-appstate.js';

import type { CalderApi } from './types.js';

declare global {
  interface Window {
    calder: CalderApi;
  }
}
