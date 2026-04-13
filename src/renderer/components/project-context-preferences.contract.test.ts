import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./preferences-modal.ts', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../styles/preferences.css', import.meta.url), 'utf8');

describe('project context preferences contract', () => {
  it('surfaces discovered project context inside the integrations section', () => {
    expect(source).toContain('Project context');
    expect(source).toContain('provider-native memory');
    expect(source).toContain('shared project rules');
    expect(source).toContain('context-discovery-shell');
  });

  it('styles the project context discovery card with dedicated source rows', () => {
    expect(styles).toContain('.context-discovery-shell');
    expect(styles).toContain('.context-discovery-item');
    expect(styles).toContain('.context-discovery-item-meta');
  });
});
