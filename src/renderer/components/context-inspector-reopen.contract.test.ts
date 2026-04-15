import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const htmlSource = readFileSync(new URL('../index.html', import.meta.url), 'utf-8');
const source = readFileSync(new URL('./context-inspector.ts', import.meta.url), 'utf-8');
const styles = readFileSync(new URL('../styles/context-inspector.css', import.meta.url), 'utf-8');

describe('context inspector reopen contract', () => {
  it('ships a dedicated reopen control when the right rail is closed', () => {
    expect(htmlSource).toContain('btn-open-context-inspector');
    expect(source).toContain('btn-open-context-inspector');
    expect(source).toContain("openBtn?.addEventListener('click'");
    expect(styles).toContain('.context-inspector-reopen');
  });
});
