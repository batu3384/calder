import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../surface-routing.js', () => ({
  deliverSurfacePrompt: vi.fn(async () => ({ ok: true, targetSessionId: 'claude-1' })),
  queueSurfacePromptInNewSession: vi.fn(),
  queueSurfacePromptInCustomSession: vi.fn(),
}));

import {
  deliverSurfacePrompt,
  queueSurfacePromptInCustomSession,
  queueSurfacePromptInNewSession,
} from '../surface-routing.js';
import {
  sendCliSelectionToCustomSession,
  sendCliSelectionToNewSession,
  sendCliSelectionToSelectedSession,
} from './session-integration.js';

describe('cli surface session integration', () => {
  const payload = {
    projectId: 'project-1',
    projectPath: '/tmp/demo',
    surfaceKind: 'cli',
    selection: { mode: 'line', startRow: 1, endRow: 1, startCol: 0, endCol: 80 },
    selectedText: 'Theme: midnight',
    nearbyText: 'Settings',
    viewportText: 'Settings',
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('delivers the built inspect prompt to the selected session', async () => {
    await sendCliSelectionToSelectedSession(payload);
    expect(deliverSurfacePrompt).toHaveBeenCalledWith('project-1', expect.stringContaining('Theme: midnight'));
  });

  it('can route the same selection into a new session', () => {
    sendCliSelectionToNewSession(payload, 'Tighten settings panel');
    expect(queueSurfacePromptInNewSession).toHaveBeenCalled();
  });

  it('can route the same selection into a custom session chooser', () => {
    sendCliSelectionToCustomSession(payload, vi.fn());
    expect(queueSurfacePromptInCustomSession).toHaveBeenCalled();
  });
});
