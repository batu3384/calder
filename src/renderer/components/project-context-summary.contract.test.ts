import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./context-inspector.ts', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../styles/context-inspector.css', import.meta.url), 'utf8');

describe('project context summary contract', () => {
  it('renders project context visibility inside the right-rail overview card', () => {
    expect(source).toContain('Project context');
    expect(source).toContain('provider memory');
    expect(source).toContain('shared rules');
    expect(source).toContain('project.projectContext');
    expect(source).toContain('inspector-overview-context-note');
  });

  it('styles the project context note as part of the overview card', () => {
    expect(styles).toContain('.inspector-overview-context-note');
    expect(styles).toContain('.inspector-overview-context-copy');
  });
});
