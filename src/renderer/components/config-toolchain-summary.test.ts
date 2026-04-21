import { describe, expect, it } from 'vitest';
import { getVisibleToolchainSections, sectionSummaryText } from './config-toolchain-summary.js';

describe('config-toolchain-summary', () => {
  it('formats section summary copy per section type', () => {
    expect(sectionSummaryText({ id: 'mcp', count: 1 })).toBe('1 MCP server connected');
    expect(sectionSummaryText({ id: 'mcp', count: 2 })).toBe('2 MCP servers connected');
    expect(sectionSummaryText({ id: 'agents', count: 1 })).toBe('1 agent available');
    expect(sectionSummaryText({ id: 'agents', count: 3 })).toBe('3 agents available');
    expect(sectionSummaryText({ id: 'skills', count: 2 })).toBe('2 skills ready');
    expect(sectionSummaryText({ id: 'commands', count: 1 })).toBe('1 custom command available');
    expect(sectionSummaryText({ id: 'commands', count: 4 })).toBe('4 custom commands available');
    expect(sectionSummaryText({ id: 'other', count: 5 })).toBe('5 configured');
  });

  it('keeps empty sections with add actions visible in the summary strip', () => {
    const visible = getVisibleToolchainSections([
      { id: 'agents', count: 0 },
      { id: 'skills', count: 0, onAdd: () => {} },
      { id: 'commands', count: 2 },
    ]);

    expect(visible.map((section) => section.id)).toEqual(['skills', 'commands']);
  });
});
