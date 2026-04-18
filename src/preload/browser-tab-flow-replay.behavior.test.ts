import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { replayFlowClick } from './browser-tab-flow-replay';

class FakeMouseEvent {
  type: string;
  constructor(type: string, init: Record<string, unknown>) {
    this.type = type;
    Object.assign(this, init);
  }
}

class FakeShadowRoot {
  selectorMap = new Map<string, FakeElement>();
  descendants: FakeElement[] = [];
  host: FakeElement;

  constructor(host: FakeElement) {
    this.host = host;
  }

  querySelector(selector: string): Element | null {
    const found = this.selectorMap.get(selector) ?? null;
    return found as unknown as Element | null;
  }

  querySelectorAll(selector: string): Element[] {
    if (selector === '*') return [...this.descendants] as unknown as Element[];
    return [];
  }
}

class FakeElement {
  tagName: string;
  ownerDocument: FakeDocument;
  shadowRoot: FakeShadowRoot | null = null;
  selectorMap = new Map<string, FakeElement>();
  descendants: FakeElement[] = [];
  clicks = 0;
  dispatchedTypes: string[] = [];

  constructor(tagName: string, ownerDocument: FakeDocument) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
  }

  querySelector(selector: string): Element | null {
    const found = this.selectorMap.get(selector) ?? null;
    return found as unknown as Element | null;
  }

  querySelectorAll(selector: string): Element[] {
    if (selector === '*') return [...this.descendants] as unknown as Element[];
    return [];
  }

  click(): void {
    this.clicks += 1;
  }

  dispatchEvent(event: Event): boolean {
    const evt = event as unknown as { type?: string };
    if (evt.type) this.dispatchedTypes.push(evt.type);
    return true;
  }

  getBoundingClientRect(): DOMRect {
    return {
      left: 10,
      top: 10,
      width: 100,
      height: 40,
      right: 110,
      bottom: 50,
      x: 10,
      y: 10,
      toJSON: () => ({}),
    } as DOMRect;
  }
}

class FakeIframeElement extends FakeElement {
  contentDocument: FakeDocument | null = null;
}

class FakeDocument {
  selectorMap = new Map<string, FakeElement>();
  descendants: FakeElement[] = [];
  frames: Array<FakeIframeElement> = [];
  defaultView = { location: { href: 'https://example.test' } };

  querySelector(selector: string): Element | null {
    const found = this.selectorMap.get(selector) ?? null;
    return found as unknown as Element | null;
  }

  querySelectorAll(selector: string): Element[] {
    if (selector === '*') return [...this.descendants] as unknown as Element[];
    if (selector === 'iframe,frame') return [...this.frames] as unknown as Element[];
    return [];
  }
}

const originalGlobals: Record<string, unknown> = {};

function stubGlobal(name: string, value: unknown): void {
  originalGlobals[name] = (globalThis as Record<string, unknown>)[name];
  (globalThis as Record<string, unknown>)[name] = value;
}

describe('flow replay behavior', () => {
  beforeEach(() => {
    stubGlobal('HTMLElement', FakeElement);
    stubGlobal('ShadowRoot', FakeShadowRoot);
    stubGlobal('HTMLIFrameElement', FakeIframeElement);
    stubGlobal('HTMLFrameElement', FakeIframeElement);
    stubGlobal('MouseEvent', FakeMouseEvent);
  });

  afterEach(() => {
    for (const [name, value] of Object.entries(originalGlobals)) {
      (globalThis as Record<string, unknown>)[name] = value;
    }
    for (const key of Object.keys(originalGlobals)) delete originalGlobals[key];
  });

  it('falls back from first selector to the next selector', async () => {
    const doc = new FakeDocument();
    const target = new FakeElement('button', doc);
    doc.selectorMap.set('#target', target);
    stubGlobal('document', doc);

    const suppress = vi.fn();
    const ok = await replayFlowClick(
      { selectors: ['.missing', '#target'], timeoutMs: 300, retryIntervalMs: 50 },
      { suppressRecording: suppress, logger: { warn: vi.fn() } },
    );

    expect(ok).toBe(true);
    expect(suppress).toHaveBeenCalledTimes(1);
    expect(target.clicks).toBe(1);
  });

  it('replays click inside same-origin iframe documents', async () => {
    const rootDoc = new FakeDocument();
    const frameDoc = new FakeDocument();
    const frame = new FakeIframeElement('iframe', rootDoc);
    frame.contentDocument = frameDoc;
    rootDoc.frames.push(frame);

    const target = new FakeElement('button', frameDoc);
    frameDoc.selectorMap.set('[data-testid="confirm"]', target);

    stubGlobal('document', rootDoc);

    const ok = await replayFlowClick(
      { selectors: ['[data-testid="confirm"]'], timeoutMs: 300, retryIntervalMs: 50 },
      { suppressRecording: vi.fn(), logger: { warn: vi.fn() } },
    );

    expect(ok).toBe(true);
    expect(target.clicks).toBe(1);
  });

  it('replays click through open shadow host chains', async () => {
    const doc = new FakeDocument();
    const host = new FakeElement('app-shell', doc);
    const shadowRoot = new FakeShadowRoot(host);
    host.shadowRoot = shadowRoot;
    doc.selectorMap.set('#host', host);
    doc.descendants.push(host);

    const target = new FakeElement('button', doc);
    shadowRoot.selectorMap.set('button.inner', target);

    stubGlobal('document', doc);

    const ok = await replayFlowClick(
      {
        selectors: ['button.inner'],
        shadowHostSelectors: [['#host']],
        timeoutMs: 300,
        retryIntervalMs: 50,
      },
      { suppressRecording: vi.fn(), logger: { warn: vi.fn() } },
    );

    expect(ok).toBe(true);
    expect(target.clicks).toBe(1);
  });

  it('uses canvas fallback when payload is canvas-like and selector misses', async () => {
    const doc = new FakeDocument();
    const canvas = new FakeElement('canvas', doc);
    doc.selectorMap.set('canvas', canvas);
    doc.descendants.push(canvas);
    stubGlobal('document', doc);

    const ok = await replayFlowClick(
      {
        selectors: ['.not-found'],
        isCanvasLike: true,
        tagName: 'canvas',
        timeoutMs: 300,
        retryIntervalMs: 50,
      },
      { suppressRecording: vi.fn(), logger: { warn: vi.fn() } },
    );

    expect(ok).toBe(true);
    expect(canvas.clicks).toBe(1);
  });

  it('dispatches pointer-like mouse sequence when click point exists', async () => {
    const doc = new FakeDocument();
    const target = new FakeElement('button', doc);
    doc.selectorMap.set('#pointed', target);
    stubGlobal('document', doc);

    const ok = await replayFlowClick(
      {
        selectors: ['#pointed'],
        clickPoint: { normalizedX: 0.25, normalizedY: 0.5 },
        timeoutMs: 300,
        retryIntervalMs: 50,
      },
      { suppressRecording: vi.fn(), logger: { warn: vi.fn() } },
    );

    expect(ok).toBe(true);
    expect(target.clicks).toBe(0);
    expect(target.dispatchedTypes).toEqual(['mousemove', 'mousedown', 'mouseup', 'click']);
  });

  it('returns false when target is never found before timeout', async () => {
    const doc = new FakeDocument();
    stubGlobal('document', doc);
    const warn = vi.fn();

    const ok = await replayFlowClick(
      { selectors: ['#never'], timeoutMs: 200, retryIntervalMs: 100 },
      { suppressRecording: vi.fn(), logger: { warn } },
    );

    expect(ok).toBe(false);
    expect(warn).toHaveBeenCalled();
  });
});
