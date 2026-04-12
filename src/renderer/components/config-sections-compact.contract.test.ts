import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const source = readFileSync(new URL('./config-sections.ts', import.meta.url), 'utf-8');
const inspectorCss = readFileSync(new URL('../styles/context-inspector.css', import.meta.url), 'utf-8');

describe('config sections compact contract', () => {
  it('renders a compact toolchain summary before detailed sections', () => {
    expect(source).toContain('renderToolchainSummary');
    expect(source).toContain('toolchain-summary');
    expect(source).toContain('toolchain-summary-chip');
    expect(source).toContain('No workspace extras configured yet');
    expect(source).toContain('Tools Focus');
  });

  it('renders tools focus summary copy for tracking and integrations', () => {
    expect(source).toContain('window.calder.settings.validate');
    expect(source).toContain('isTrackingHealthy');
    expect(source).toContain('Tracking is on');
    expect(source).toContain('Tracking is off');
    expect(source).toContain('MCP servers connected');
    expect(source).toContain('custom commands available');
  });

  it('styles the compact toolchain summary in the context inspector', () => {
    expect(inspectorCss).toContain('.toolchain-summary');
    expect(inspectorCss).toContain('.toolchain-summary-chip');
    expect(inspectorCss).toContain('.toolchain-provider');
  });
});
