import { TAB_AND_TERMINAL_TRANSLATION_ENTRIES } from './i18n-translations-tab-terminal.js';
import { PREFERENCES_TRANSLATION_ENTRIES } from './i18n-translations-preferences.js';
import { MOBILE_TRANSLATION_ENTRIES } from './i18n-translations-mobile.js';
import { ERROR_TRANSLATION_ENTRIES } from './i18n-translations-errors.js';
import { CORE_TRANSLATION_ENTRIES_PART_1 } from './i18n-translations-core-part-1.js';
import { CORE_TRANSLATION_ENTRIES_PART_2 } from './i18n-translations-core-part-2.js';
import { CORE_TRANSLATION_ENTRIES_PART_3 } from './i18n-translations-core-part-3.js';

export const DIRECT_TRANSLATION_ENTRIES: ReadonlyArray<readonly [string, string]> = [
  ...TAB_AND_TERMINAL_TRANSLATION_ENTRIES,
  ...PREFERENCES_TRANSLATION_ENTRIES,
  ...MOBILE_TRANSLATION_ENTRIES,
  ...ERROR_TRANSLATION_ENTRIES,
  ...CORE_TRANSLATION_ENTRIES_PART_1,
  ...CORE_TRANSLATION_ENTRIES_PART_2,
  ...CORE_TRANSLATION_ENTRIES_PART_3,
];

export const DIRECT_TRANSLATIONS = new Map<string, string>(DIRECT_TRANSLATION_ENTRIES);
