import { describe, expect, it } from 'vitest';
import { closeInspect, createInitialInspectState, openInspect, setInspectPayload } from './inspect-mode.js';

describe('cli surface inspect mode', () => {
  it('starts closed with no selection payload', () => {
    expect(createInitialInspectState()).toEqual({
      active: false,
      selection: null,
      payload: null,
    });
  });

  it('opens inspect mode without mutating selection state', () => {
    expect(openInspect(createInitialInspectState())).toEqual({
      active: true,
      selection: null,
      payload: null,
    });
  });

  it('stores selection payloads while keeping inspect active', () => {
    const state = setInspectPayload(
      createInitialInspectState(),
      { mode: 'line', startRow: 3, endRow: 3, startCol: 0, endCol: 80 },
      {
        projectId: 'project-1',
        projectPath: '/tmp/demo',
        surfaceKind: 'cli',
        selection: { mode: 'line', startRow: 3, endRow: 3, startCol: 0, endCol: 80 },
        selectedText: 'Status: ready',
        nearbyText: 'Status: ready',
        viewportText: 'Status: ready',
      },
    );

    expect(state.active).toBe(true);
    expect(state.selection?.startRow).toBe(3);
    expect(state.payload?.selectedText).toBe('Status: ready');
  });

  it('closes inspect mode and clears transient state', () => {
    const state = closeInspect(
      setInspectPayload(
        createInitialInspectState(),
        { mode: 'viewport', startRow: 0, endRow: 10, startCol: 0, endCol: 80 },
        {
          projectId: 'project-1',
          projectPath: '/tmp/demo',
          surfaceKind: 'cli',
          selection: { mode: 'viewport', startRow: 0, endRow: 10, startCol: 0, endCol: 80 },
          selectedText: 'viewport',
          nearbyText: 'viewport',
          viewportText: 'viewport',
        },
      ),
    );

    expect(state).toEqual({
      active: false,
      selection: null,
      payload: null,
    });
  });
});
