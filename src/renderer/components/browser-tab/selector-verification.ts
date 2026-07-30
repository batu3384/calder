import type { SelectorOption, SelectorVerification } from './types.js';

export function pickInitialActiveSelector(
  selectors: SelectorOption[],
  selectorVerifications?: Record<string, SelectorVerification>,
): SelectorOption {
  if (selectors.length === 0) {
    return { type: 'css', label: 'css', value: '*' };
  }
  if (selectorVerifications) {
    for (const option of selectors) {
      if (selectorVerifications[option.value]?.status === 'unique') {
        return option;
      }
    }
  }
  return selectors[0]!;
}

export function formatSelectorVerificationMessage(
  verification: SelectorVerification | undefined,
): string | null {
  if (!verification) return null;
  if (verification.status === 'unique') {
    return 'Selector resolves to this element uniquely.';
  }
  if (verification.status === 'ambiguous') {
    return `Selector matches ${verification.matchCount} elements. Pick a more specific option or use Draw mode.`;
  }
  return 'Selector no longer resolves to this element. The page may have changed.';
}
