import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  FakeDocument,
  FakeElement,
  FakeTerminal,
  makeWindowStub,
  mockClipboardWrite,
  mockDomSelectionClear,
  terminalOptionsRef,
  webLinksActivateRef,
} from './terminal-pane.test-harness.js';

describe('terminal Ctrl+Shift+C clipboard copy', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useFakeTimers();
    webLinksActivateRef.current = null;

    vi.stubGlobal('document', new FakeDocument());
    vi.stubGlobal('window', makeWindowStub());
    vi.stubGlobal('navigator', { clipboard: { writeText: mockClipboardWrite } });
  });

  it('copies selected text to clipboard on Ctrl+Shift+C keydown', async () => {
    const { createTerminalPane } = await import('./terminal-pane.js');
    const instance = createTerminalPane('s1', '/project', null);
    const term = instance.terminal as unknown as FakeTerminal;

    term.setSelection('hello world');
    term.simulateKey({ ctrlKey: true, shiftKey: true, key: 'C', type: 'keydown' });

    expect(mockClipboardWrite).toHaveBeenCalledWith('hello world');
  });

  it('does not copy on keyup', async () => {
    const { createTerminalPane } = await import('./terminal-pane.js');
    const instance = createTerminalPane('s2', '/project', null);
    const term = instance.terminal as unknown as FakeTerminal;

    term.setSelection('hello world');
    term.simulateKey({ ctrlKey: true, shiftKey: true, key: 'C', type: 'keyup' });

    expect(mockClipboardWrite).not.toHaveBeenCalled();
  });

  it('does not copy when nothing is selected', async () => {
    const { createTerminalPane } = await import('./terminal-pane.js');
    const instance = createTerminalPane('s3', '/project', null);
    const term = instance.terminal as unknown as FakeTerminal;

    term.setSelection('');
    term.simulateKey({ ctrlKey: true, shiftKey: true, key: 'C', type: 'keydown' });

    expect(mockClipboardWrite).not.toHaveBeenCalled();
  });

  it('returns false to prevent default on Ctrl+Shift+C', async () => {
    const { createTerminalPane } = await import('./terminal-pane.js');
    const instance = createTerminalPane('s4', '/project', null);
    const term = instance.terminal as unknown as FakeTerminal;

    const result = term.simulateKey({ ctrlKey: true, shiftKey: true, key: 'C', type: 'keydown' });

    expect(result).toBe(false);
  });

  it('opens detected web links without requiring modifier keys', async () => {
    const { createTerminalPane } = await import('./terminal-pane.js');
    const instance = createTerminalPane('links-1', '/project', null);
    const openExternal = (window as any).calder.app.openExternal;
    const terminal = instance.terminal as unknown as FakeTerminal;

    expect(webLinksActivateRef.current).toBeTypeOf('function');
    webLinksActivateRef.current?.(
      { metaKey: false, ctrlKey: false } as MouseEvent,
      'http://localhost:8000/docs',
    );

    expect(openExternal).toHaveBeenCalledWith('http://localhost:8000/docs', '/project');
    expect(terminal.clearSelection).toHaveBeenCalled();
    expect(mockDomSelectionClear).toHaveBeenCalled();
  });

  it('normalizes bare localhost links before opening', async () => {
    const { createTerminalPane } = await import('./terminal-pane.js');
    createTerminalPane('links-2', '/project', null);
    const openExternal = (window as any).calder.app.openExternal;

    webLinksActivateRef.current?.(
      { metaKey: false, ctrlKey: false } as MouseEvent,
      'localhost:5173/preview',
    );

    expect(openExternal).toHaveBeenCalledWith('http://localhost:5173/preview', '/project');
  });

  it('routes OSC8 hyperlinks through xterm linkHandler', async () => {
    const { createTerminalPane } = await import('./terminal-pane.js');
    const instance = createTerminalPane('links-osc8', '/project', null);
    const openExternal = (window as any).calder.app.openExternal;
    const terminal = instance.terminal as unknown as FakeTerminal;
    const linkHandler = terminalOptionsRef.current?.linkHandler as
      | { activate?: (event: MouseEvent, text: string, range: unknown) => void }
      | undefined;

    linkHandler?.activate?.(
      { metaKey: false, ctrlKey: false } as MouseEvent,
      'http://localhost:3000/dashboard',
      {},
    );

    expect(linkHandler?.activate).toBeTypeOf('function');
    expect(openExternal).toHaveBeenCalledWith('http://localhost:3000/dashboard', '/project');
    expect(terminal.clearSelection).toHaveBeenCalled();
    expect(mockDomSelectionClear).toHaveBeenCalled();
  });

  it('does not cross-dedupe link opens between different terminal sessions', async () => {
    const { createTerminalPane } = await import('./terminal-pane.js');
    createTerminalPane('links-scope-a', '/project', null);
    const sessionALink = webLinksActivateRef.current;

    const openExternal = (window as any).calder.app.openExternal;
    sessionALink?.(
      { metaKey: false, ctrlKey: false } as MouseEvent,
      'http://localhost:3000/dashboard',
    );

    createTerminalPane('links-scope-b', '/project', null);
    const sessionBLink = webLinksActivateRef.current;
    sessionBLink?.(
      { metaKey: false, ctrlKey: false } as MouseEvent,
      'http://localhost:3000/dashboard',
    );

    expect(openExternal).toHaveBeenCalledTimes(2);
    expect(openExternal).toHaveBeenNthCalledWith(1, 'http://localhost:3000/dashboard', '/project');
    expect(openExternal).toHaveBeenNthCalledWith(2, 'http://localhost:3000/dashboard', '/project');
  });

  it('suppresses drag selection when a link anchor is the pointer target', async () => {
    const { createTerminalPane } = await import('./terminal-pane.js');
    const instance = createTerminalPane('links-anchor-target', '/project', null);
    const xtermWrap = instance.element.querySelector('.xterm-wrap') as unknown as FakeElement;

    const linkTarget = {
      closest: () => ({
        getAttribute: () => 'http://localhost:4100/path',
      }),
    };

    const mousedown = {
      button: 0,
      clientX: 1024,
      clientY: 32,
      target: linkTarget,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      stopImmediatePropagation: vi.fn(),
    } as unknown as MouseEvent;
    xtermWrap.emit('mousedown', mousedown);

    expect(
      (mousedown as MouseEvent & { preventDefault: ReturnType<typeof vi.fn> }).preventDefault,
    ).toHaveBeenCalled();
  });

  it('opens link anchors when pointer-based URL detection misses', async () => {
    const { createTerminalPane } = await import('./terminal-pane.js');
    const instance = createTerminalPane('links-anchor-open', '/project', null);
    const openExternal = (window as any).calder.app.openExternal;
    const xtermWrap = instance.element.querySelector('.xterm-wrap') as unknown as FakeElement;

    const linkTarget = {
      closest: () => ({
        getAttribute: () => 'http://localhost:4101/from-anchor',
      }),
    };

    const click = {
      defaultPrevented: false,
      button: 0,
      clientX: 1008,
      clientY: 30,
      target: linkTarget,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      stopImmediatePropagation: vi.fn(),
    } as unknown as MouseEvent;
    xtermWrap.emit('click', click);

    expect(openExternal).toHaveBeenCalledWith('http://localhost:4101/from-anchor', '/project');
  });

  it('resets link-drag suppression before a non-link drag starts', async () => {
    const { createTerminalPane } = await import('./terminal-pane.js');
    const instance = createTerminalPane('links-drag-reset', '/project', null);
    const terminal = instance.terminal as unknown as FakeTerminal;
    terminal.setViewportLine('http://localhost:3000/dashboard plain text tail');

    const xtermWrap = instance.element.querySelector('.xterm-wrap') as unknown as FakeElement;
    const linkMouseDown = {
      button: 0,
      clientX: 16,
      clientY: 12,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      stopImmediatePropagation: vi.fn(),
    } as unknown as MouseEvent;
    xtermWrap.emit('mousedown', linkMouseDown);
    expect(
      (linkMouseDown as MouseEvent & { preventDefault: ReturnType<typeof vi.fn> }).preventDefault,
    ).toHaveBeenCalled();

    const nonLinkMouseDown = {
      button: 0,
      clientX: 1080,
      clientY: 12,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      stopImmediatePropagation: vi.fn(),
    } as unknown as MouseEvent;
    xtermWrap.emit('mousedown', nonLinkMouseDown);
    expect(
      (nonLinkMouseDown as MouseEvent & { preventDefault: ReturnType<typeof vi.fn> })
        .preventDefault,
    ).not.toHaveBeenCalled();

    const dragMove = {
      buttons: 1,
      button: 0,
      clientX: 1090,
      clientY: 18,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      stopImmediatePropagation: vi.fn(),
    } as unknown as MouseEvent;
    xtermWrap.emit('mousemove', dragMove);
    expect(
      (dragMove as MouseEvent & { preventDefault: ReturnType<typeof vi.fn> }).preventDefault,
    ).not.toHaveBeenCalled();
  });
});
