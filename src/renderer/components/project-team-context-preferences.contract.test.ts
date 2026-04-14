import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(path.join(process.cwd(), 'src/renderer/components/preferences-modal.ts'), 'utf8');
const styles = readFileSync(path.join(process.cwd(), 'src/renderer/styles/preferences.css'), 'utf8');

describe('project team context preferences contract', () => {
  it('surfaces shared team context inside the integrations section', () => {
    expect(source).toContain('Team context');
    expect(source).toContain('Create starter spaces');
    expect(source).toContain('New shared space');
    expect(source).toContain('teamContext.createStarterFiles');
    expect(source).toContain('teamContext.createSpace');
    expect(source).toContain('team-context-discovery-shell');
    expect(source).toContain('Shared rules');
    expect(source).toContain('Workflows');
  });

  it('styles team context discovery cards with dedicated rows and actions', () => {
    expect(styles).toContain('.team-context-discovery-shell');
    expect(styles).toContain('.team-context-discovery-actions');
    expect(styles).toContain('.team-context-discovery-summary');
    expect(styles).toContain('.team-context-discovery-item');
    expect(styles).toContain('.team-context-discovery-action-btn');
  });
});
