import * as sessionInspectorStateModule from '../../session-inspector-state.js';

type SessionInspectorStateModule = typeof sessionInspectorStateModule;
const sessionInspectorState = sessionInspectorStateModule as SessionInspectorStateModule;

export const getEvents: SessionInspectorStateModule['getEvents'] = (...args) =>
  sessionInspectorState.getEvents(...args);
export const getCostDeltas: SessionInspectorStateModule['getCostDeltas'] = (...args) =>
  sessionInspectorState.getCostDeltas(...args);
