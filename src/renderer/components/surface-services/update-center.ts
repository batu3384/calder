import * as updateCenterModule from "../../update-center.js";

type UpdateCenterModule = typeof updateCenterModule;
const updateCenter = updateCenterModule as UpdateCenterModule;

export type { CliProviderProgressState, CliUpdateCenterState } from "../../update-center.js";

export const cancelCliProviderUpdates: UpdateCenterModule["cancelCliProviderUpdates"] = (...args) =>
  updateCenter.cancelCliProviderUpdates(...args);

export const getUpdateCenterState: UpdateCenterModule["getUpdateCenterState"] = (...args) =>
  updateCenter.getUpdateCenterState(...args);

export const onUpdateCenterChange: UpdateCenterModule["onUpdateCenterChange"] = (...args) =>
  updateCenter.onUpdateCenterChange(...args);

export const runCliProviderUpdates: UpdateCenterModule["runCliProviderUpdates"] = (...args) =>
  updateCenter.runCliProviderUpdates(...args);

export const initUpdateCenter: UpdateCenterModule["initUpdateCenter"] = (...args) =>
  updateCenter.initUpdateCenter(...args);

export const checkForAppUpdates: UpdateCenterModule["checkForAppUpdates"] = (...args) =>
  updateCenter.checkForAppUpdates(...args);
