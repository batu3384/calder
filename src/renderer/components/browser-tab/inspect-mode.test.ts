import { describe, expect, it } from 'vitest';

import { buildPrompt } from './inspect-mode.js';
import type { BrowserTabInstance, ElementInfo } from './types.js';

function makeElementInfo(overrides: Partial<ElementInfo> = {}): ElementInfo {
  return {
    tagName: 'button',
    id: 'submit',
    classes: ['primary'],
    textContent: 'Save changes',
    selectors: [{ type: 'qa', label: 'data-testid', value: '[data-testid="save"]' }],
    shadowHostSelectors: [['#app'], ['widget-host']],
    pageUrl: 'https://example.com/app',
    activeSelector: { type: 'qa', label: 'data-testid', value: '[data-testid="save"]' },
    ...overrides,
  };
}

function makeInstance(overrides: Partial<BrowserTabInstance> = {}): BrowserTabInstance {
  return {
    selectedElement: makeElementInfo(),
    instructionInput: { value: 'Make this primary' } as HTMLTextAreaElement,
    inspectAttachDimsCheckbox: { checked: false } as HTMLInputElement,
    ...overrides,
  } as BrowserTabInstance;
}

describe('inspect-mode buildPrompt', () => {
  it('includes selector, escaped text, and shadow host metadata', () => {
    const prompt = buildPrompt(makeInstance());

    expect(prompt).toContain('selector: \'[data-testid="save"]\'');
    expect(prompt).toContain("text: 'Save changes'");
    expect(prompt).toContain("shadow: '#app > widget-host'");
    expect(prompt).toContain('Make this primary');
  });

  it('escapes apostrophes in element text and instructions', () => {
    const prompt = buildPrompt(
      makeInstance({
        selectedElement: makeElementInfo({ textContent: "Don't break" }),
        instructionInput: { value: "Fix the button's label" } as HTMLTextAreaElement,
      }),
    );

    expect(prompt).toContain("text: 'Don\\'t break'");
    expect(prompt).toContain("Fix the button\\'s label");
  });

  it('returns null when instruction or element is missing', () => {
    expect(buildPrompt(makeInstance({ selectedElement: null }))).toBeNull();
    expect(
      buildPrompt(
        makeInstance({
          instructionInput: { value: '   ' } as HTMLTextAreaElement,
        }),
      ),
    ).toBeNull();
  });
});
