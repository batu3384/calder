import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./context-inspector.ts', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../styles/context-inspector.css', import.meta.url), 'utf8');

describe('project context summary contract', () => {
  it('removes project context snapshot copy from the right-rail chrome', () => {
    expect(source).not.toContain('Project context');
    expect(source).not.toContain('provider memory');
    expect(source).not.toContain('shared rules');
    expect(source).not.toContain('project.projectContext');
    expect(source).not.toContain('inspector-overview-context-note');
  });

  it('removes project context note styles tied to the deleted overview card', () => {
    expect(styles).not.toContain('.inspector-overview-context-note');
    expect(styles).not.toContain('.inspector-overview-context-copy');
  });
});
