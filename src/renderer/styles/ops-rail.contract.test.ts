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
    expect(inspectorCss).toContain('min-height: 18px;');
    expect(inspectorCss).toContain('.toolchain-summary-status');
    expect(inspectorCss).toContain('.ops-rail-note');
    expect(inspectorCss).toContain('padding: 9px 11px;');
    expect(inspectorCss).toContain('border-radius: 12px;');
    expect(inspectorCss).toContain('min-height: 42px;');
  });

  it('slims the right rail again at narrower shell widths instead of holding a wide fixed column', () => {
    expect(inspectorCss).toContain('@container workspace-shell (max-width: 980px)');
    expect(inspectorCss).toContain('width: 268px;');
    expect(inspectorCss).toContain('min-width: 236px;');
    expect(inspectorCss).toContain('grid-template-columns: minmax(0, 1fr);');
  });

  it('keeps auto-approval controls wrapping so dropdowns never stretch the rail', () => {
    expect(inspectorCss).toContain('#context-inspector-sections {');
    expect(inspectorCss).toContain('overflow-x: hidden;');
    expect(inspectorCss).toContain('.auto-approval-scope-row');
    expect(inspectorCss).toContain('flex-wrap: wrap;');
    expect(inspectorCss).toContain('.auto-approval-scope-control');
    expect(inspectorCss).toContain('max-width: 100%;');
  });
});
