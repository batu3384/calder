import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const htmlSource = readFileSync(new URL('../index.html', import.meta.url), 'utf-8');
const source = readFileSync(new URL('./context-inspector.ts', import.meta.url), 'utf-8');
const styles = readFileSync(new URL('../styles/context-inspector.css', import.meta.url), 'utf-8');
const commandStudioStyles = readFileSync(new URL('../styles/theme-command-studio.css', import.meta.url), 'utf-8');

function extractRuleBlock(sourceText: string, selector: string): string {
  const start = sourceText.indexOf(`${selector} {`);
  if (start < 0) return '';
  const end = sourceText.indexOf('}', start);
  return end < 0 ? sourceText.slice(start) : sourceText.slice(start, end + 1);
}

describe('context inspector reopen contract', () => {
  it('ships a dedicated reopen control when the right rail is closed', () => {
    expect(htmlSource).toContain('btn-open-context-inspector');
    expect(source).toContain('btn-open-context-inspector');
    expect(source).toContain("openBtn?.addEventListener('click'");
    expect(styles).toContain('.context-inspector-reopen');
  });

  it('keeps the reopen control visible and state-synchronised with the right rail', () => {
    expect(source).toContain('syncInspectorOpenState');
    expect(styles).toContain('.context-inspector-reopen');
    expect(styles).toContain('opacity: 0.96;');
    expect(styles).toContain('top: 50%;');
    expect(styles).toContain('right: 0;');
    expect(styles).toContain('transform: translateY(-50%);');
    expect(styles).toContain('writing-mode: vertical-rl;');
  });

  it('keeps command studio polish from overlapping top-bar actions', () => {
    const reopenRule = extractRuleBlock(commandStudioStyles, '.context-inspector-reopen');

    expect(reopenRule).toContain('top: 50%;');
    expect(reopenRule).toContain('right: 0;');
    expect(reopenRule).toContain('transform: translateY(-50%);');
    expect(reopenRule).toContain('writing-mode: vertical-rl;');
    expect(reopenRule).not.toContain('top: 14px;');
    expect(reopenRule).not.toContain('min-width: 96px;');
    expect(reopenRule).not.toContain('writing-mode: horizontal-tb;');
  });
});
