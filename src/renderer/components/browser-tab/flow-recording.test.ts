import { beforeEach, describe, expect, it, vi } from 'vitest';

import { formatShadowHostStepLine } from './capture-prompt.js';
import * as flowRecording from './flow-recording.js';
import { buildSelectorOptions } from './selector-ui.js';
import type { BrowserTabInstance, FlowStep } from './types.js';

const { addFlowStep, buildFlowPrompt, renderFlowSteps } = flowRecording;

vi.mock('./selector-ui.js', () => ({
  buildSelectorOptions: vi.fn(() => ({ className: '' })),
}));

vi.stubGlobal(
  'document',
  {
    createElement: vi.fn(() => makeElementStub() as HTMLElement),
  },
);

function makeElementStub(): Record<string, unknown> {
  return {
    className: '',
    textContent: '',
    title: '',
    style: { display: 'none' },
    dataset: {},
    appendChild: vi.fn(),
    addEventListener: vi.fn(),
    setAttribute: vi.fn(),
  };
}

function makeFlowInstance(steps: FlowStep[]): BrowserTabInstance {
  return {
    flowSteps: steps,
    flowStepsList: { innerHTML: '', appendChild: vi.fn() } as unknown as HTMLElement,
    flowPanel: { style: { display: 'none' } } as HTMLElement,
    flowInputRow: { style: { display: 'none' } } as HTMLElement,
    flowPanelLabel: { textContent: '' } as HTMLSpanElement,
    flowInstructionInput: { value: 'Replay and fix' } as HTMLTextAreaElement,
    syncToolbarState: vi.fn(),
  } as BrowserTabInstance;
}

describe('flow-recording buildFlowPrompt', () => {
  beforeEach(() => {
    vi.mocked(buildSelectorOptions).mockClear();
  });

  it('includes selector, escaped text, and shadow host metadata', () => {
    const prompt = buildFlowPrompt(
      makeFlowInstance([
        {
          type: 'click',
          tagName: 'button',
          textContent: "Don't save",
          activeSelector: { type: 'css', label: 'css', value: 'button' },
          pageUrl: 'https://example.com',
        },
      ]),
    );

    expect(prompt).toContain("Don\\'t save");
  });

  it('includes shadow host metadata in recorded steps', () => {
    const prompt = buildFlowPrompt(
      makeFlowInstance([
        {
          type: 'click',
          tagName: 'button',
          textContent: 'Save',
          activeSelector: { type: 'qa', label: 'data-testid', value: '[data-testid="save"]' },
          shadowHostSelectors: [['#app'], ['widget-host']],
          pageUrl: 'https://example.com',
        },
      ]),
    );

    expect(prompt).toContain("selector: '[data-testid=\"save\"]'");
    expect(prompt).toContain("shadow: '#app > widget-host'");
    expect(prompt).toContain('Replay and fix');
  });

  it('formats shadow host step lines consistently', () => {
    expect(formatShadowHostStepLine([['#shell']])).toBe("\n   shadow: '#shell'");
  });

  it('passes selector verifications into flow step selector UI', () => {
    const verifications = {
      '[data-testid="save"]': { status: 'unique' as const, matchCount: 1 },
    };
    const instance = makeFlowInstance([
      {
        type: 'click',
        tagName: 'button',
        selectors: [
          { type: 'qa', label: 'data-testid', value: '[data-testid="save"]' },
          { type: 'css', label: 'css', value: 'button' },
        ],
        selectorVerifications: verifications,
        activeSelector: { type: 'qa', label: 'data-testid', value: '[data-testid="save"]' },
      },
    ]);

    renderFlowSteps(instance);

    expect(buildSelectorOptions).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ value: '[data-testid="save"]' }),
      verifications,
      expect.any(Function),
    );
  });

  it('picks the first unique selector when flow steps omit activeSelector', () => {
    const instance = makeFlowInstance([]);
    addFlowStep(instance, {
      type: 'click',
      tagName: 'button',
      selectors: [
        { type: 'css', label: 'css', value: 'button' },
        { type: 'qa', label: 'data-testid', value: '[data-testid="save"]' },
      ],
      selectorVerifications: {
        button: { status: 'ambiguous' as const, matchCount: 4 },
        '[data-testid="save"]': { status: 'unique' as const, matchCount: 1 },
      },
    });

    expect(instance.flowSteps[0]?.activeSelector?.value).toBe('[data-testid="save"]');
  });
});
