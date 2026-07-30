import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const tabListRendererSource = readFileSync(
  new URL('./tab-bar-tab-list-renderer.ts', import.meta.url),
  'utf-8',
);
const sessionTabFactorySource = readFileSync(
  new URL('./tab-bar-session-tab-factory.ts', import.meta.url),
  'utf-8',
);
const eventWiringSource = readFileSync(
  new URL('./tab-bar-event-wiring.ts', import.meta.url),
  'utf-8',
);
const tabsCss = readFileSync(new URL('../../styles/tabs.css', import.meta.url), 'utf-8');
const statusKeys = readFileSync(
  new URL('../../i18n-translations-core-part-1.ts', import.meta.url),
  'utf-8',
);

describe('tab bar session tab factory extraction', () => {
  it('delegates session tab creation to dedicated helper', () => {
    expect(tabListRendererSource).toContain("from './tab-bar-session-tab-factory.js'");
    expect(tabListRendererSource).toContain('createSessionTab({');
  });

  it('keeps session tab badges, activation, context menu, and reorder behavior in helper module', () => {
    expect(sessionTabFactorySource).toContain("session.type === 'mcp-inspector'");
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

  it('renders session status as dot plus localized text label', () => {
    expect(sessionTabFactorySource).toContain('class="tab-status ${status}"');
    expect(sessionTabFactorySource).toContain('class="tab-status-label"');
    expect(sessionTabFactorySource).toContain('${t(status)}');
    expect(eventWiringSource).toContain("dot.querySelector('.tab-status-label')");
    expect(eventWiringSource).toContain('label.textContent = t(status)');
    expect(tabsCss).toContain('.tab-status::before');
    expect(tabsCss).toContain('.tab-status.working::before');
    expect(tabsCss).toContain('.tab-status.completed::before');
  });

  it('localizes generated tab tooltips instead of relying on post-render mutation', () => {
    expect(sessionTabFactorySource).toContain('tab.title = t(buildSessionTabTitle(');
    expect(sessionTabFactorySource).toContain('t(`Drag to reorder`)');
    expect(eventWiringSource).toContain('tab.title = buildLocalizedSessionTooltip(');
  });

  it('has locale translations for every session status key', () => {
    for (const key of ['idle', 'completed', 'input', 'working', 'waiting']) {
      expect(statusKeys).toContain(`['${key}',`);
    }
  });

  it('drops pill styling from tab type badges', () => {
    expect(tabsCss).not.toContain('.tab-reorder-handle');
    expect(sessionTabFactorySource).not.toContain('tab-reorder-handle');
  });
});
