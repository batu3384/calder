import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const modalPrimarySource = readFileSync(new URL('./preferences/preferences-modal.ts', import.meta.url), 'utf8');
const modalSectionsSource = readFileSync(new URL('./preferences/preferences-modal-sections.ts', import.meta.url), 'utf8');
const modalSource = [modalPrimarySource, modalSectionsSource].join('\n');
const contextSource = readFileSync(new URL('./preferences/preferences-context-discovery.ts', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../styles/preferences.css', import.meta.url), 'utf8');

describe('project context preferences contract', () => {
  it('surfaces discovered project context inside the integrations section', () => {
    expect(modalSource).toContain("import { renderProjectContextSection } from './preferences-context-discovery.js';");
    expect(modalSource).toContain('renderProjectContextSection({');
    expect(modalSource).toContain('container: trackingGroup');
    expect(modalSource).toContain('onRefreshProviders: rerenderProviders');
    expect(modalSource).toContain('onCloseModalWide: closeWideModal');

    expect(contextSource).toContain('Project context');
    expect(contextSource).toContain('provider-native memory');
    expect(contextSource).toContain('shared project rules');
    expect(contextSource).toContain('Create starter files');
    expect(contextSource).toContain('New shared rule');
    expect(contextSource).toContain('context.createStarterFiles');
    expect(contextSource).toContain('context.createSharedRule');
    expect(contextSource).toContain('context.renameSharedRule');
    expect(contextSource).toContain('context.deleteSharedRule');
    expect(contextSource).toContain("showModal('New Shared Rule'");
    expect(contextSource).toContain("showModal('Rename Shared Rule'");
    expect(contextSource).toContain('Rename');
    expect(contextSource).toContain('Delete');
    expect(contextSource).toContain('confirm(');
    expect(contextSource).toContain('Preview');
    expect(contextSource).toContain('appState.addFileReaderSession');
    expect(contextSource).toContain('window.calder.git.openInEditor');
    expect(contextSource).toContain('Open');
    expect(contextSource).toContain('context-discovery-toggle');
    expect(contextSource).toContain("source.enabled !== false");
    expect(contextSource).toContain('context-discovery-shell');
  });

  it('styles the project context discovery card with dedicated source rows', () => {
    expect(styles).toContain('.context-discovery-shell');
    expect(styles).toContain('.context-discovery-actions');
    expect(styles).toContain('.context-discovery-action-btn');
    expect(styles).toContain('.context-discovery-item-actions');
    expect(styles).toContain('.context-discovery-item-btn');
    expect(styles).toContain('.context-discovery-toggle');
    expect(styles).toContain('.context-discovery-item-status');
    expect(styles).toContain('.context-discovery-item');
    expect(styles).toContain('.context-discovery-item-meta');
  });
});
