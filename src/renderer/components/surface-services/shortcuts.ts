import * as shortcutsModule from '../../shortcuts.js';

type ShortcutsModule = typeof shortcutsModule;
const shortcuts = shortcutsModule as ShortcutsModule;

export const shortcutManager = shortcuts.shortcutManager;
export const displayKeys: ShortcutsModule['displayKeys'] = (...args) =>
  shortcuts.displayKeys(...args);
export const eventToAccelerator: ShortcutsModule['eventToAccelerator'] = (...args) =>
  shortcuts.eventToAccelerator(...args);
