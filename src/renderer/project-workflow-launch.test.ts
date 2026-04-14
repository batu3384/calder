import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockLoad = vi.fn();
const mockSave = vi.fn();

vi.stubGlobal('window', {
  calder: {
    store: { load: mockLoad, save: mockSave },
  },
});

let uuidCounter = 0;
vi.stubGlobal('crypto', {
  randomUUID: () => `workflow-session-${++uuidCounter}`,
});

vi.mock('./session-cost.js', () => ({
  getCost: vi.fn().mockReturnValue(null),
  restoreCost: vi.fn(),
}));

vi.mock('./session-context.js', () => ({
  restoreContext: vi.fn(),
}));

import { appState, _resetForTesting } from './state.js';
import type { ProjectWorkflowDocument } from '../shared/types.js';

function buildWorkflowDocument(overrides: Partial<ProjectWorkflowDocument> = {}): ProjectWorkflowDocument {
  return {
    path: '/proj/.calder/workflows/review-pr.md',
    relativePath: '.calder/workflows/review-pr.md',
    title: 'Review PR',
    contents: '# Review PR\n\nRead the current diff first.\n',
    ...overrides,
  };
}

describe('project workflow launch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    uuidCounter = 0;
    _resetForTesting();
  });

  it('creates a new session seeded with the workflow prompt', () => {
    const project = appState.addProject('Calder', '/proj');

    const session = appState.launchWorkflowSession(
      project.id,
      buildWorkflowDocument(),
      'codex',
    )!;

    expect(session.name).toBe('Review PR');
    expect(session.providerId).toBe('codex');
    expect(appState.activeProject?.activeSessionId).toBe(session.id);
    expect(appState.activeProject?.layout.splitPanes).toContain(session.id);

    const prompt = appState.consumePendingInitialPrompt(project.id, session.id);
    expect(prompt).toContain('Workflow: Review PR');
    expect(prompt).toContain('.calder/workflows/review-pr.md');
    expect(prompt).toContain('Read the current diff first.');
  });
});
