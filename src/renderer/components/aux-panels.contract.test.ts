import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const inspectorTimelineSource = readFileSync(
  new URL('./session-inspector/session-inspector-timeline.ts', import.meta.url),
  'utf-8',
);
const inspectorUtilsSource = readFileSync(
  new URL('./session-inspector/session-inspector-utils.ts', import.meta.url),
  'utf-8',
);
const sessionInspectorSource = readFileSync(
  new URL('./session-inspector/session-inspector.ts', import.meta.url),
  'utf-8',
);
const inspectorCss = readFileSync(
  new URL('../styles/session-inspector.css', import.meta.url),
  'utf-8',
);
const mcpInspectorSource = readFileSync(new URL('./mcp-inspector.ts', import.meta.url), 'utf-8');
const mcpInspectorListsSource = readFileSync(
  new URL('./mcp-inspector-lists.ts', import.meta.url),
  'utf-8',
);
const mcpInspectorCombined = `${mcpInspectorSource}\n${mcpInspectorListsSource}`;
const mcpCss = readFileSync(new URL('../styles/mcp-inspector.css', import.meta.url), 'utf-8');

describe('auxiliary panel polish contract', () => {
  it('uses a shared inspector empty shell instead of raw empty strings', () => {
    expect(inspectorUtilsSource).toContain('renderInspectorEmpty');
    expect(inspectorTimelineSource).toContain('renderInspectorEmpty(container,');
    expect(inspectorCss).toContain('.inspector-empty-shell');
    expect(inspectorCss).toContain('.inspector-empty-title');
    expect(inspectorCss).toContain('.inspector-empty-copy');
  });

  it('uses structured MCP empty and error states', () => {
    expect(mcpInspectorCombined).toContain('renderMcpEmptyState');
    expect(mcpInspectorCombined).toContain('mcp-empty-state');
    expect(mcpInspectorCombined).toContain('mcp-error-state');
    expect(mcpCss).toContain('.mcp-empty-state');
    expect(mcpCss).toContain('.mcp-error-state');
    expect(mcpCss).toContain('.mcp-empty-copy');
  });

  it('uses calmer inspector chrome with shared status shells', () => {
    expect(sessionInspectorSource).toContain('openPixelOffice');
    expect(sessionInspectorSource).toContain('togglePixelOffice');
    expect(sessionInspectorSource).not.toContain('inspector-header-copy');
    expect(inspectorCss).toContain('.inspector-header-copy');
    expect(inspectorCss).toContain('.inspector-header-actions');
    expect(inspectorCss).toContain('.inspector-header-meta');
    expect(mcpInspectorSource).toContain('setMcpStatus(');
    expect(mcpInspectorSource).toContain('mcp-status-pill');
    expect(mcpInspectorSource).toContain('mcp-status-label');
    expect(mcpCss).toContain('.mcp-status-pill');
    expect(mcpCss).toContain('.mcp-status-label');
  });
});
