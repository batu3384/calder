import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const source = readFileSync(new URL('./tab-bar.ts', import.meta.url), 'utf-8');

describe('tab bar command deck contract', () => {
  it('owns the command deck overflow and context inspector toggle', () => {
    expect(source).toContain('btn-command-deck-more');
    expect(source).toContain('btn-toggle-context-inspector');
    expect(source).toContain('showUsageModal');
    expect(source).toContain('toggleProjectTerminal');
    expect(source).toContain('promptNewMcpInspector');
  });

  it('renders an inline provider selector beside new session', () => {
    expect(source).toContain('session-provider-slot');
    expect(source).toContain('renderSessionProviderSelector');
    expect(source).toContain('resolvePreferredProviderForLaunch');
  });
});
