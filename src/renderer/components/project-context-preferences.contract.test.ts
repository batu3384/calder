import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./preferences-modal.ts', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../styles/preferences.css', import.meta.url), 'utf8');

describe('project context preferences contract', () => {
  it('surfaces discovered project context inside the integrations section', () => {
    expect(source).toContain('Project context');
    expect(source).toContain('provider-native memory');
    expect(source).toContain('shared project rules');
    expect(source).toContain('Create starter files');
    expect(source).toContain('New shared rule');
    expect(source).toContain('context.createStarterFiles');
    expect(source).toContain('context.createSharedRule');
    expect(source).toContain('context.renameSharedRule');
    expect(source).toContain('context.deleteSharedRule');
    expect(source).toContain("showModal('New Shared Rule'");
    expect(source).toContain("showModal('Rename Shared Rule'");
    expect(source).toContain('Rename');
    expect(source).toContain('Delete');
    expect(source).toContain('confirm(');
    expect(source).toContain('Preview');
    expect(source).toContain('appState.addFileReaderSession');
    expect(source).toContain('closeModal()');
    expect(source).toContain('window.calder.git.openInEditor');
    expect(source).toContain('Open');
    expect(source).toContain('context-discovery-toggle');
    expect(source).toContain("source.enabled !== false");
    expect(source).toContain('context-discovery-shell');
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
