import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const inspectorCss = readFileSync(new URL('./context-inspector.css', import.meta.url), 'utf-8');

describe('ops rail stylesheet contract', () => {
  it('uses section dividers instead of stacked card blocks', () => {
    expect(inspectorCss).toContain('.context-inspector-section + .context-inspector-section');
    expect(inspectorCss).toContain('#context-inspector .config-section,');
    expect(inspectorCss).toContain('border: none;');
    expect(inspectorCss).toContain('border-radius: 0;');
  });

  it('renders summary and counts as compact rail metadata', () => {
    expect(inspectorCss).toContain('#context-inspector .toolchain-summary');
    expect(inspectorCss).toContain('border-bottom: 1px solid');
    expect(inspectorCss).toContain('#context-inspector .config-section-count');
    expect(inspectorCss).toContain('#context-inspector .readiness-badge');
    expect(inspectorCss).toContain('min-height: 18px;');
  });
});
