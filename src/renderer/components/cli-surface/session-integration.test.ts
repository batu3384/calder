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
    appliedContext: {
      sources: [
        { id: 'claude:memory:/tmp/demo/CLAUDE.md', provider: 'claude', displayName: 'CLAUDE.md', kind: 'memory' },
        { id: 'shared:rules:/tmp/demo/.calder/rules/testing.hard.md', provider: 'shared', displayName: 'testing.hard.md', kind: 'rules' },
      ],
      sharedRuleCount: 1,
      providerContextSummary: 'CLAUDE.md',
      sharedRulesSummary: 'testing.hard.md',
    },
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('delivers the built inspect prompt to the selected session', async () => {
    await sendCliSelectionToSelectedSession(payload);
    expect(deliverSurfacePrompt).toHaveBeenCalledWith(
      'project-1',
      expect.stringContaining('Terminal capture from CLI surface:'),
    );
    expect(deliverSurfacePrompt).toHaveBeenCalledWith(
      'project-1',
      expect.stringContaining('Selection: exact line'),
    );
    expect(deliverSurfacePrompt).toHaveBeenCalledWith('project-1', expect.stringContaining('Theme: midnight'));
    expect(deliverSurfacePrompt).not.toHaveBeenCalledWith(
      'project-1',
      expect.stringContaining('Visible terminal viewport:'),
    );
  });

  it('frames inferred panels explicitly in the routed prompt', async () => {
    await sendCliSelectionToSelectedSession({
      ...payload,
      inferredLabel: 'settings panel',
      selectionSource: 'inferred',
    });

    expect(deliverSurfacePrompt).toHaveBeenCalledWith(
      'project-1',
      expect.stringContaining('Selection: inferred panel'),
    );
    expect(deliverSurfacePrompt).toHaveBeenCalledWith(
      'project-1',
      expect.stringContaining('Inferred panel: settings panel'),
    );
  });

  it('includes adapter-specific metadata when available', async () => {
    await sendCliSelectionToSelectedSession({
      ...payload,
      command: 'python',
      semanticNodeId: 'settings.footer',
      semanticLabel: 'Footer',
      sourceFile: 'src/ui/footer.ts',
      adapterMeta: {
        framework: 'Textual',
        widgetName: 'Footer',
        focusPath: ['Screen', 'Footer'],
        stateSummary: 'Ready',
      },
    });

    expect(deliverSurfacePrompt).toHaveBeenCalledWith(
      'project-1',
      expect.stringContaining('Framework: Textual'),
    );
    expect(deliverSurfacePrompt).toHaveBeenCalledWith(
      'project-1',
      expect.stringContaining('Widget: Footer'),
    );
    expect(deliverSurfacePrompt).toHaveBeenCalledWith(
      'project-1',
      expect.stringContaining('Semantic target: Footer (settings.footer)'),
    );
    expect(deliverSurfacePrompt).toHaveBeenCalledWith(
      'project-1',
      expect.stringContaining('Source file: src/ui/footer.ts'),
    );
    expect(deliverSurfacePrompt).toHaveBeenCalledWith(
      'project-1',
      expect.stringContaining('Focus path: Screen > Footer'),
    );
    expect(deliverSurfacePrompt).toHaveBeenCalledWith(
      'project-1',
      expect.stringContaining('State: Ready'),
    );
  });

  it('frames semantic snap selections explicitly in the routed prompt', async () => {
    await sendCliSelectionToSelectedSession({
      ...payload,
      selectionSource: 'semantic',
      semanticNodeId: 'menu.root',
      semanticLabel: 'Command Menu',
    });

    expect(deliverSurfacePrompt).toHaveBeenCalledWith(
      'project-1',
      expect.stringContaining('Selection: semantic target'),
    );
    expect(deliverSurfacePrompt).toHaveBeenCalledWith(
      'project-1',
      expect.stringContaining('Semantic target: Command Menu (menu.root)'),
    );
  });

  it('can optionally include the visible viewport when the composer requests broader context', async () => {
    await sendCliSelectionToSelectedSession({
      ...payload,
      contextMode: 'selection-nearby-viewport',
    });

    expect(deliverSurfacePrompt).toHaveBeenCalledWith(
      'project-1',
      expect.stringContaining('Visible terminal viewport:'),
    );
  });

  it('adds a compact project context block when applied context is available', async () => {
    await sendCliSelectionToSelectedSession(payload);

    expect(deliverSurfacePrompt).toHaveBeenCalledWith(
      'project-1',
      expect.stringContaining('Project context:'),
    );
    expect(deliverSurfacePrompt).toHaveBeenCalledWith(
      'project-1',
      expect.stringContaining('Provider memory: CLAUDE.md'),
    );
    expect(deliverSurfacePrompt).toHaveBeenCalledWith(
      'project-1',
      expect.stringContaining('Shared rules: testing.hard.md'),
    );
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
