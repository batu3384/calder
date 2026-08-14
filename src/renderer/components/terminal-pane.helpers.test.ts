import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  FakeDocument,
  FakeElement,
  FakeTerminal,
  makeWindowStub,
  mockClipboardWrite,
  terminalOptionsRef,
  webLinksActivateRef,
} from './terminal-pane.test-harness.js';

describe('terminal helper extractions', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useFakeTimers();
    webLinksActivateRef.current = null;
    terminalOptionsRef.current = null;

    vi.stubGlobal('document', new FakeDocument());
    vi.stubGlobal('window', makeWindowStub());
    vi.stubGlobal('navigator', { clipboard: { writeText: mockClipboardWrite } });
  });

  it('createTerminalCore wires OSC and web link activation handlers', async () => {
    const { createTerminalCore } = await import('./terminal-pane-runtime.js');
    const activateOscLink = vi.fn();
    const activateWebLink = vi.fn();

    const { terminal } = createTerminalCore({
      sessionId: 'runtime-1',
      projectPath: '/project',
      activateOscLink,
      activateWebLink,
    });
    const runtimeTerminal = terminal as unknown as FakeTerminal;
    const linkHandler = terminalOptionsRef.current?.linkHandler as
      | { activate?: (event: MouseEvent | undefined, uri: string, range?: unknown) => void }
      | undefined;

    expect(runtimeTerminal.loadedAddons).toHaveLength(3);
    linkHandler?.activate?.(undefined, 'https://example.dev/osc');
    webLinksActivateRef.current?.(undefined as unknown as MouseEvent, 'https://example.dev/web');

    expect(activateOscLink).toHaveBeenCalledWith(undefined, 'https://example.dev/osc');
    expect(activateWebLink).toHaveBeenCalledWith(undefined, 'https://example.dev/web');
  });

  it('bindTerminalInputAndFocusHandlers forwards input and focus ownership', async () => {
    const { bindTerminalInputAndFocusHandlers } = await import('./terminal-pane-runtime.js');
    const terminal = new FakeTerminal();
    const element = new FakeElement('div');
    const writePtyData = vi.fn();
    const setFocused = vi.fn();
    let focusedSessionId: string | null = null;

    bindTerminalInputAndFocusHandlers({
      terminal: terminal as unknown as any,
      element: element as unknown as HTMLDivElement,
      sessionId: 'runtime-2',
      writePtyData,
      setFocused: (sessionId) => {
        focusedSessionId = sessionId;
        setFocused(sessionId);
      },
      getFocusedSessionId: () => focusedSessionId,
    });

    const preventDefault = vi.fn();
    const keyHandled = terminal.simulateKey({
      shiftKey: true,
      key: 'Enter',
      type: 'keydown',
      preventDefault,
    } as unknown as KeyboardEvent);
    expect(keyHandled).toBe(false);
    expect(preventDefault).toHaveBeenCalled();
    expect(writePtyData).toHaveBeenCalledWith('runtime-2', '\x1b[13;2u');

    writePtyData.mockClear();
    setFocused.mockClear();
    terminal.emitData('echo test');
    expect(writePtyData).toHaveBeenCalledWith('runtime-2', 'echo test');
    expect(setFocused).toHaveBeenCalledWith('runtime-2');

    setFocused.mockClear();
    element.emit('mousedown', {});
    expect(setFocused).toHaveBeenCalledWith('runtime-2');
  });

  it('registerTerminalLinkProviders registers file and GitHub providers when available', async () => {
    const { registerTerminalLinkProviders } = await import('./terminal-pane-runtime.js');
    const terminal = new FakeTerminal();
    const getRemoteUrl = vi.fn(async () => 'https://github.com/acme/repo');

    registerTerminalLinkProviders({
      terminal: terminal as unknown as any,
      projectPath: '/project',
      projectId: 'project-1',
      getRemoteUrl,
    });
    await Promise.resolve();

    expect(getRemoteUrl).toHaveBeenCalledWith('/project');
    expect(terminal.registerLinkProvider).toHaveBeenCalledTimes(2);
  });

  it('instance DOM helpers preserve open/fit/focus behavior', async () => {
    const {
      attachTerminalInstanceToContainer,
      clearFocusedTerminalInstances,
      fitTerminalInstance,
      hideTerminalInstance,
      setFocusedTerminalInstance,
      showTerminalInstance,
    } = await import('./terminal-pane-instance-dom.js');
    const container = new FakeElement('div');
    const elementA = new FakeElement('div');
    elementA.className = 'terminal-pane hidden swarm-dimmed swarm-unread';
    const wrapA = new FakeElement('div');
    wrapA.className = 'xterm-wrap';
    elementA.appendChild(wrapA);
    const terminalA = new FakeTerminal();
    const fitA = { fit: vi.fn() };
    const instanceA = {
      terminal: terminalA as unknown as any,
      fitAddon: fitA as any,
      element: elementA as unknown as any,
    };
    const writeResize: Array<[string, number, number]> = [];

    attachTerminalInstanceToContainer(instanceA, container as unknown as HTMLElement);
    expect(container.children.includes(elementA)).toBe(true);
    expect(terminalA.open).toHaveBeenCalledTimes(1);
    expect(terminalA.loadedAddons).toHaveLength(1);

    const xtermNode = new FakeElement('div');
    xtermNode.className = 'xterm';
    wrapA.appendChild(xtermNode);
    terminalA.open.mockClear();
    attachTerminalInstanceToContainer(instanceA, container as unknown as HTMLElement);
    expect(terminalA.open).not.toHaveBeenCalled();

    showTerminalInstance(instanceA, true);
    expect(elementA.classList.contains('hidden')).toBe(false);
    expect(elementA.classList.contains('split')).toBe(true);

    hideTerminalInstance(instanceA);
    expect(elementA.classList.contains('hidden')).toBe(true);
    expect(elementA.classList.contains('swarm-dimmed')).toBe(false);
    expect(elementA.classList.contains('swarm-unread')).toBe(false);

    const elementB = new FakeElement('div');
    const terminalB = new FakeTerminal();
    const instanceB = {
      terminal: terminalB as unknown as any,
      fitAddon: { fit: vi.fn() } as any,
      element: elementB as unknown as any,
    };

    elementA.classList.remove('hidden');
    fitTerminalInstance('runtime-3', instanceA, (sessionId, cols, rows) => {
      writeResize.push([sessionId, cols, rows]);
    });
    expect(fitA.fit).toHaveBeenCalled();
    expect(writeResize).toContainEqual(['runtime-3', terminalA.cols, terminalA.rows]);

    elementA.classList.add('focused');
    elementB.classList.add('focused');
    clearFocusedTerminalInstances([
      ['a', instanceA],
      ['b', instanceB],
    ]);
    expect(elementA.classList.contains('focused')).toBe(false);
    expect(elementB.classList.contains('focused')).toBe(false);

    setFocusedTerminalInstance('a', [
      ['a', instanceA],
      ['b', instanceB],
    ]);
    expect(elementA.classList.contains('focused')).toBe(true);
    expect(terminalA.focus).toHaveBeenCalledTimes(1);

    const fakeDocument = document as unknown as FakeDocument;
    fakeDocument.activeElement = { closest: () => null } as unknown as FakeElement;
    terminalA.focus.mockClear();
    setFocusedTerminalInstance('a', [['a', instanceA]]);
    expect(terminalA.focus).not.toHaveBeenCalled();
  });

  it('fitTerminal forwards terminal dimensions to pty resize for registered sessions', async () => {
    const { createTerminalPane, fitTerminal } = await import('./terminal-pane.js');
    const resizeSpy = (window as any).calder.pty.resize;

    createTerminalPane('fit-wrapper', '/project', null, false, '', 'claude');
    fitTerminal('fit-wrapper');

    expect(resizeSpy).toHaveBeenCalledWith('fit-wrapper', 120, 30);
  });
});
