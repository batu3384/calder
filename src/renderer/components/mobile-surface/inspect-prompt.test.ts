import { describe, expect, it } from 'vitest';

import { buildMobileInspectPrompt, resolveMobileInspectPromptError } from './inspect-prompt.js';
import type { MobileSurfaceInspectState } from './types.js';

function createInspectState(overrides: Partial<MobileSurfaceInspectState> = {}): MobileSurfaceInspectState {
  return {
    platform: 'ios',
    launching: false,
    capturing: false,
    inspectingPoint: false,
    interacting: false,
    pointInspectToken: 0,
    liveMode: false,
    liveIntervalMs: 1200,
    liveLoopToken: 0,
    liveTimer: null,
    liveFrames: 0,
    liveLastFrameAt: null,
    message: '',
    tone: 'default',
    screenshot: null,
    selectedPoint: null,
    selectedElement: null,
    instruction: '',
    sendError: '',
    contextTrace: [],
    ...overrides,
  };
}

describe('mobile inspect prompt helpers', () => {
  it('returns null when required prompt inputs are missing', () => {
    expect(buildMobileInspectPrompt({
      inspectState: createInspectState(),
      platformLabel: 'iOS Simulator',
    })).toBeNull();

    expect(buildMobileInspectPrompt({
      inspectState: createInspectState({
        screenshot: { platform: 'ios', success: true, message: 'ok', dataUrl: 'data:image/png;base64,AA==' },
      }),
      platformLabel: 'iOS Simulator',
    })).toBeNull();
  });

  it('builds a rich prompt when screenshot, point, and instruction exist', () => {
    const prompt = buildMobileInspectPrompt({
      inspectState: createInspectState({
        screenshot: {
          platform: 'ios',
          success: true,
          message: 'captured',
          dataUrl: 'data:image/png;base64,AA==',
          width: 1179,
          height: 2556,
          capturedAt: '2026-04-22T12:00:00.000Z',
          deviceName: 'iPhone 15 Pro',
        },
        selectedPoint: {
          x: 320,
          y: 860,
          normalizedX: 0.27,
          normalizedY: 0.33,
        },
        selectedElement: {
          platform: 'ios',
          success: true,
          message: 'match',
          point: { x: 320, y: 860 },
          element: {
            className: 'XCUIElementTypeButton',
            resourceId: 'checkout-cta',
            text: 'Buy now',
            bounds: { left: 280, top: 820, right: 430, bottom: 900 },
          },
        },
        instruction: 'Tap this call-to-action and verify next screen.',
      }),
      platformLabel: 'iOS Simulator',
    });

    expect(prompt).toContain('Mobile inspect task (iOS Simulator).');
    expect(prompt).toContain('Screenshot size: 1179x2556.');
    expect(prompt).toContain('Device: iPhone 15 Pro.');
    expect(prompt).toContain('Matched element:');
    expect(prompt).toContain('Instruction: Tap this call-to-action and verify next screen.');
  });

  it('returns deterministic validation reasons', () => {
    expect(resolveMobileInspectPromptError(createInspectState()))
      .toBe('Capture a simulator frame first.');

    expect(resolveMobileInspectPromptError(createInspectState({
      screenshot: { platform: 'ios', success: true, message: 'ok', dataUrl: 'data:image/png;base64,AA==' },
    }))).toBe('Pick a point on the captured frame first.');

    expect(resolveMobileInspectPromptError(createInspectState({
      screenshot: { platform: 'ios', success: true, message: 'ok', dataUrl: 'data:image/png;base64,AA==' },
      selectedPoint: { x: 5, y: 8, normalizedX: 0.1, normalizedY: 0.2 },
      instruction: '   ',
    }))).toBe('Write an instruction before sending.');
  });
});
