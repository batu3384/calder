import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const source = readFileSync(new URL('./config-sections.ts', import.meta.url), 'utf-8');
const inspectorCss = readFileSync(new URL('../styles/context-inspector.css', import.meta.url), 'utf-8');

describe('config sections compact contract', () => {
  it('renders a compact toolchain summary before detailed sections', () => {
    expect(source).toContain('renderToolchainSummary');
    expect(source).toContain('getVisibleToolchainSections');
    expect(source).toContain('toolchain-summary');
    expect(source).toContain('toolchain-summary-chip');
    expect(source).toContain('No project MCP, skills, or commands connected yet.');
    expect(source).toContain('Toolkit');
  });

  it('renders tools focus summary copy for tracking and integrations', () => {
    expect(source).toContain('refreshGeneration');
    expect(source).toContain('window.calder.settings.validate');
    expect(source).toContain('isTrackingHealthy');
    expect(source).toContain('Tracking on');
    expect(source).toContain('Tracking limited');
    expect(source).toContain('MCP servers connected');
    expect(source).toContain('custom commands available');
  });

  it('styles the compact toolchain summary in the context inspector', () => {
    expect(inspectorCss).toContain('.toolchain-summary');
    expect(inspectorCss).toContain('.toolchain-summary-chip');
    expect(inspectorCss).toContain('.toolchain-provider');
    expect(source).toContain("empty.className = 'config-empty ops-rail-note'");
    expect(inspectorCss).toContain('.toolchain-summary-empty');
    expect(inspectorCss).toContain('.ops-rail-note[data-tone=\"muted\"]');
  });
});
