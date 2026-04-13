import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const source = readFileSync(new URL('./session-history.ts', import.meta.url), 'utf-8');
const css = readFileSync(new URL('../styles/session-history.css', import.meta.url), 'utf-8');

describe('session history contract', () => {
  it('groups search and actions into a single run-log toolbar', () => {
    expect(source).toContain('history-toolbar');
    expect(source).toContain('history-search-shell');
    expect(css).toContain('.history-toolbar');
    expect(css).toContain('.history-search-shell');
    expect(css).toContain('grid-template-columns: minmax(0, 1fr) auto;');
  });

  it('renders run items with a stronger meta hierarchy', () => {
    expect(source).toContain('history-item-meta');
    expect(source).toContain('history-item-provider');
    expect(css).toContain('.history-item-meta');
    expect(css).toContain('.history-item-provider');
    expect(css).toContain('letter-spacing: 0.06em;');
  });
});
