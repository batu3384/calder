import { describe, expect, it } from 'vitest';

import { buildPrompt } from './inspect-mode.js';
import type { BrowserTabInstance } from './types.js';

function makeInspectInstance(overrides: Partial<BrowserTabInstance> = {}): BrowserTabInstance {
  return {
    sessionId: 'browser-1',
    selectedElement: {
      tagName: 'button',
      pageUrl: 'http://localhost:3000/page?q=1\ninjected',
      textContent: "Don't break",
      activeSelector: { value: "button[data-test='x']" },
      shadowHostSelectors: [['#app']],
    },
    instructionInput: {
      value: "Fix the 'submit' button\nand escape quotes",
    } as HTMLTextAreaElement,
    inspectAttachDimsCheckbox: { checked: false } as HTMLInputElement,
    ...overrides,
  } as BrowserTabInstance;
}

describe('browser capture pipeline integration', () => {
  it('builds an inspect prompt with escaped literals end-to-end', () => {
    const prompt = buildPrompt(makeInspectInstance());
    expect(prompt).not.toBeNull();
    expect(prompt).toContain("selector: 'button[data-test=\\'x\\']'");
    expect(prompt).toContain("text: 'Don\\'t break'");
    expect(prompt).toContain("shadow: '#app'");
    expect(prompt).toContain("Fix the \\'submit\\' button and escape quotes");
    expect(prompt).not.toMatch(/\n/);
  });

  it('returns null when inspect prerequisites are missing', () => {
    expect(buildPrompt(makeInspectInstance({ selectedElement: null }))).toBeNull();
    expect(
      buildPrompt(
        makeInspectInstance({
          instructionInput: { value: '   ' } as HTMLTextAreaElement,
        }),
      ),
    ).toBeNull();
  });
});
