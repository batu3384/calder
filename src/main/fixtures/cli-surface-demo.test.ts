import { describe, expect, it, vi } from 'vitest';
import { parseCalderOsc } from '../../shared/cli-surface-protocol.js';
import {
  createCliSurfaceDemoState,
  emitCliSurfaceDemoSemantics,
  renderCliSurfaceDemoFrame,
  updateCliSurfaceDemoState,
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
});
