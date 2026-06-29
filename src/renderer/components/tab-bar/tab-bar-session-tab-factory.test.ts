import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const tabBarSource = readFileSync(new URL('./tab-bar.ts', import.meta.url), 'utf-8');
const sessionTabFactorySource = readFileSync(
  new URL('./tab-bar-session-tab-factory.ts', import.meta.url),
  'utf-8',
);

describe('tab bar session tab factory extraction', () => {
  it('delegates session tab creation to dedicated helper', () => {
    expect(tabBarSource).toContain("from './tab-bar-session-tab-factory.js'");
    expect(tabBarSource).toContain('createSessionTab({');
  });

  it('keeps session tab badges, activation, context menu, and reorder behavior in helper module', () => {
    expect(sessionTabFactorySource).toContain("session.type === 'mcp-inspector'");
    expect(sessionTabFactorySource).toContain("session.type === 'remote-terminal'");
    expect(sessionTabFactorySource).toContain(
      'buildProviderIconMarkup(providerId, hasMultipleAvailableProviders())',
    );
    expect(sessionTabFactorySource).toContain(
      'options.showTabContextMenu(event.clientX, event.clientY, project, session, tab)',
    );
    expect(sessionTabFactorySource).toContain(
      "event.dataTransfer!.setData('text/plain', session.id)",
    );
    expect(sessionTabFactorySource).toContain(
      'appState.reorderSession(project.id, draggedId, targetIndex)',
    );
  });
});
