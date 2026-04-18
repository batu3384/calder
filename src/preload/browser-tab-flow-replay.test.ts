import { describe, expect, it } from 'vitest';
import { normalizeFlowReplayPayload } from './browser-tab-flow-replay';

describe('browser tab flow replay payload normalization', () => {
  it('normalizes legacy string payloads', () => {
    const payload = normalizeFlowReplayPayload('  button.primary  ');
    expect(payload.selectors).toEqual(['button.primary']);
    expect(payload.shadowHostSelectors).toEqual([]);
    expect(payload.timeoutMs).toBe(1200);
    expect(payload.retryIntervalMs).toBe(120);
  });

  it('deduplicates selectors and keeps shadow host selector chains', () => {
    const payload = normalizeFlowReplayPayload({
      selectors: ['[data-testid="cta"]', ' [data-testid="cta"] ', '#hero-btn'],
      shadowHostSelectors: [['app-shell', 'app-shell'], ['widget-host']],
      clickPoint: { normalizedX: 1.4, normalizedY: -0.1 },
      tagName: 'CANVAS',
      isCanvasLike: false,
      timeoutMs: 9999,
      retryIntervalMs: 1,
    });

    expect(payload.selectors).toEqual(['[data-testid="cta"]', '#hero-btn']);
    expect(payload.shadowHostSelectors).toEqual([['app-shell'], ['widget-host']]);
    expect(payload.clickPoint).toEqual({ normalizedX: 1, normalizedY: 0 });
    expect(payload.isCanvasLike).toBe(true);
    expect(payload.tagName).toBe('canvas');
    expect(payload.timeoutMs).toBe(4000);
    expect(payload.retryIntervalMs).toBe(50);
  });

  it('falls back to safe defaults for malformed payload objects', () => {
    const payload = normalizeFlowReplayPayload({
      selector: '  ',
      selectors: [null, undefined, 42],
      timeoutMs: 'bad',
      retryIntervalMs: 'bad',
      clickPoint: { normalizedX: 'x', normalizedY: null },
    });

    expect(payload.selectors).toEqual([]);
    expect(payload.shadowHostSelectors).toEqual([]);
    expect(payload.clickPoint).toBeUndefined();
    expect(payload.timeoutMs).toBe(1200);
    expect(payload.retryIntervalMs).toBe(120);
  });
});
