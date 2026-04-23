import * as domUtilsModule from "../../dom-utils.js";

type DomUtilsModule = typeof domUtilsModule;
const domUtils = domUtilsModule as DomUtilsModule;

export const esc: DomUtilsModule["esc"] = (...args) => domUtils.esc(...args);
export const areaLabel: DomUtilsModule["areaLabel"] = (...args) => domUtils.areaLabel(...args);
export const createPassphraseInput: DomUtilsModule["createPassphraseInput"] = (...args) => domUtils.createPassphraseInput(...args);
