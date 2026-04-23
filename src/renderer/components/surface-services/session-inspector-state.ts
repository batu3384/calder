import * as sessionInspectorStateModule from "../../session-inspector-state.js";

type SessionInspectorStateModule = typeof sessionInspectorStateModule;
const sessionInspectorState = sessionInspectorStateModule as SessionInspectorStateModule;

export const getEvents: SessionInspectorStateModule["getEvents"] = (...args) => sessionInspectorState.getEvents(...args);
export const getToolStats: SessionInspectorStateModule["getToolStats"] = (...args) => sessionInspectorState.getToolStats(...args);
export const getContextHistory: SessionInspectorStateModule["getContextHistory"] = (...args) => sessionInspectorState.getContextHistory(...args);
export const getCostDeltas: SessionInspectorStateModule["getCostDeltas"] = (...args) => sessionInspectorState.getCostDeltas(...args);
export const onChange: SessionInspectorStateModule["onChange"] = (...args) => sessionInspectorState.onChange(...args);
export const clearSession: SessionInspectorStateModule["clearSession"] = (...args) => sessionInspectorState.clearSession(...args);
