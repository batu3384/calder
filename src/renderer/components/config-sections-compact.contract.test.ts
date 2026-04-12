import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const source = readFileSync(new URL('./config-sections.ts', import.meta.url), 'utf-8');
const inspectorCss = readFileSync(new URL('../styles/context-inspector.css', import.meta.url), 'utf-8');

describe('config sections compact contract', () => {
  it('renders a compact toolchain summary before detailed sections', () => {
    expect(source).toContain('renderToolchainSummary');
    expect(source).toContain('toolchain-summary');
    expect(source).toContain('toolchain-summary-chip');
    expect(source).toContain('No active config items yet');
    expect(source).toContain('Config for');
  });

  it('styles the compact toolchain summary in the context inspector', () => {
    expect(inspectorCss).toContain('.toolchain-summary');
    expect(inspectorCss).toContain('.toolchain-summary-chip');
    expect(inspectorCss).toContain('.toolchain-provider');
  });
});
