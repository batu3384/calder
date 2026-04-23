import * as sessionActivityModule from "../../session-activity.js";

type SessionActivityModule = typeof sessionActivityModule;
const sessionActivity = sessionActivityModule as SessionActivityModule;

export type { SessionStatus } from "../../session-activity.js";

export const getStatus: SessionActivityModule["getStatus"] = (...args) => sessionActivity.getStatus(...args);
export const onChange: SessionActivityModule["onChange"] = (...args) => sessionActivity.onChange(...args);
export const initSession: SessionActivityModule["initSession"] = (...args) => sessionActivity.initSession(...args);
export const removeSession: SessionActivityModule["removeSession"] = (...args) => sessionActivity.removeSession(...args);
export const setHookStatus: SessionActivityModule["setHookStatus"] = (...args) => sessionActivity.setHookStatus(...args);
