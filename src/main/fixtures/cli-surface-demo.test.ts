import { describe, expect, it, vi } from 'vitest';
import { parseCalderOsc } from '../../shared/cli-surface-protocol.js';
import {
  createCliSurfaceDemoState,
  emitCliSurfaceDemoSemantics,
  runCliSurfaceDemo,
  renderCliSurfaceDemoFrame,
  updateCliSurfaceDemoState,
  writeCliSurfaceDemoFrame,
} from './cli-surface-demo.js';

describe('cli surface demo fixture', () => {
  it('renders a boxed demo frame with the active item and footer hints', () => {
    const state = createCliSurfaceDemoState();
    const frame = renderCliSurfaceDemoFrame(state, 38);

    expect(frame).toContain('Project Actions');
    expect(frame).toContain('Review telemetry');
    expect(frame).toContain('Dirty: no');
    expect(frame).toContain('j/k move');
    expect(frame).toContain('d toggle');
  });

  it('applies minimum width and truncates long labels with an ellipsis', () => {
    const state = {
      ...createCliSurfaceDemoState(),
      title: 'Project Actions With A Surprisingly Long Header',
      items: [{ id: 'x', label: 'Very long task title that should truncate', shortcut: '1' }],
    };
    const frame = renderCliSurfaceDemoFrame(state, 10);
    expect(frame).toContain('…');
    expect(frame.split('\n')[0]?.length).toBeGreaterThanOrEqual(26);
  });

  it('updates selection and dirty state through simple actions', () => {
    const first = createCliSurfaceDemoState();
    const moved = updateCliSurfaceDemoState(first, 'next');
    const toggled = updateCliSurfaceDemoState(moved, 'toggle-dirty');

    expect(moved.activeIndex).toBe(1);
    expect(toggled.dirty).toBe(true);
    expect(updateCliSurfaceDemoState(first, 'previous').activeIndex).toBe(first.items.length - 1);
  });

  it('emits semantic nodes, focus, and state with source-file context', () => {
    const write = vi.fn();
    const state = updateCliSurfaceDemoState(createCliSurfaceDemoState(), 'next');

    emitCliSurfaceDemoSemantics(write, state);
    const messages = write.mock.calls
      .map(([chunk]) => parseCalderOsc(String(chunk)))
      .filter((value): value is NonNullable<typeof value> => Boolean(value));

    expect(write).toHaveBeenCalledTimes(state.items.length + 4);
    expect(messages.some((message) => message.nodeId === 'project-actions.root')).toBe(true);
    expect(messages.some((message) => message.nodeId === 'project-actions.item.settings')).toBe(true);
    expect(messages.some((message) => message.sourceFile === 'src/main/fixtures/cli-surface-demo.ts')).toBe(true);
  });

  it('writes a frame through object-style protocol writers and emits semantics', () => {
    const writer = { write: vi.fn() };
    const state = createCliSurfaceDemoState();

    writeCliSurfaceDemoFrame(writer, state, 42);

    expect(writer.write).toHaveBeenCalled();
    const firstChunk = String(writer.write.mock.calls[0]?.[0] ?? '');
    expect(firstChunk.startsWith('\u001b[2J\u001b[H')).toBe(true);
    expect(firstChunk).toContain('Project Actions');
  });

  it('fails fast with guidance when no TTY is available', () => {
    const stdoutIsTTY = process.stdout.isTTY;
    const stdinIsTTY = process.stdin.isTTY;
    const priorExitCode = process.exitCode;
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true as any);

    Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: false });
    Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: false });

    runCliSurfaceDemo();

    expect(process.exitCode).toBe(1);
    expect(stderrSpy).toHaveBeenCalledWith('CLI Surface demo needs a TTY.\n');

    stderrSpy.mockRestore();
    Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: stdoutIsTTY });
    Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: stdinIsTTY });
    process.exitCode = priorExitCode;
  });

  it('handles interactive input and exits cleanly on quit', () => {
    const stdoutIsTTY = process.stdout.isTTY;
    const stdinIsTTY = process.stdin.isTTY;
    const stdoutColumns = process.stdout.columns;
    const originalSetRawMode = (process.stdin as any).setRawMode;
    const originalResume = process.stdin.resume;
    const originalPause = process.stdin.pause;
    const originalSetEncoding = (process.stdin as any).setEncoding;
    const originalOn = process.stdin.on;

    let dataHandler: ((chunk: string) => void) | undefined;
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true as any);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`EXIT:${code ?? 0}`);
    }) as any);
    const processOnSpy = vi.spyOn(process, 'on').mockImplementation(((event: string, _handler: () => void) => process) as any);

    Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: true });
    Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: true });
    Object.defineProperty(process.stdout, 'columns', { configurable: true, value: 120 });

    (process.stdin as any).setRawMode = vi.fn();
    process.stdin.resume = vi.fn() as any;
    process.stdin.pause = vi.fn() as any;
    (process.stdin as any).setEncoding = vi.fn();
    process.stdin.on = vi.fn((event: string, handler: (chunk: string) => void) => {
      if (event === 'data') dataHandler = handler;
      return process.stdin;
    }) as any;

    runCliSurfaceDemo();
    dataHandler?.('j');
    dataHandler?.('d');

    expect(() => dataHandler?.('q')).toThrowError('EXIT:0');
    expect((process.stdin as any).setRawMode).toHaveBeenCalledWith(true);
    expect((process.stdin as any).setRawMode).toHaveBeenCalledWith(false);
    expect(process.stdin.pause).toHaveBeenCalled();
    expect(stdoutSpy).toHaveBeenCalledWith('\u001b[?25l');
    expect(stdoutSpy).toHaveBeenCalledWith('\u001b[?25h\n');

    processOnSpy.mockRestore();
    exitSpy.mockRestore();
    stdoutSpy.mockRestore();
    Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: stdoutIsTTY });
    Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: stdinIsTTY });
    Object.defineProperty(process.stdout, 'columns', { configurable: true, value: stdoutColumns });
    (process.stdin as any).setRawMode = originalSetRawMode;
    process.stdin.resume = originalResume;
    process.stdin.pause = originalPause;
    (process.stdin as any).setEncoding = originalSetEncoding;
    process.stdin.on = originalOn;
  });
});
