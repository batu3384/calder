import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf-8');
const configSectionsSource = readFileSync(new URL('./config-sections.ts', import.meta.url), 'utf-8');
const gitPanelSource = readFileSync(new URL('./git-panel.ts', import.meta.url), 'utf-8');
const historySource = readFileSync(new URL('./session-history.ts', import.meta.url), 'utf-8');
const inspectorCss = readFileSync(new URL('../styles/context-inspector.css', import.meta.url), 'utf-8');

describe('context language contract', () => {
  it('uses curated section language in the right inspector', () => {
    expect(html).toContain('Tool Status');
    expect(html).toContain('Repo');
    expect(html).toContain('Runs');
    expect(html).toContain('Config');
    expect(html).toContain('class="context-inspector-open control-panel-surface ops-rail ops-rail-surface"');
    expect(configSectionsSource).toContain("'MCP Servers'");
    expect(configSectionsSource).toContain('Model Context Protocol');
    expect(configSectionsSource).toContain("'Skills'");
    expect(configSectionsSource).toContain("'Custom Commands'");
    expect(configSectionsSource).not.toContain("'Integrations'");
    expect(configSectionsSource).toContain('Config for');
    expect(gitPanelSource).toContain('Repo');
    expect(historySource).toContain('Runs');
    expect(html).toContain('Signals');
    expect(html).not.toContain('Ops Rail');
    expect(html).not.toContain('Support');
    expect(html).not.toContain('AI Setup');
    expect(html).not.toContain('Recent Sessions');
    expect(html).not.toContain('Toolchain');
    expect(html).not.toContain('Control Panel');
  });

  it('uses button semantics for collapsible context cards', () => {
    expect(configSectionsSource).toContain("button.type = 'button'");
    expect(configSectionsSource).toContain("button.setAttribute('aria-expanded'");
    expect(gitPanelSource).toContain("button.type = 'button'");
    expect(gitPanelSource).toContain("button.setAttribute('aria-expanded'");
    expect(historySource).toContain("button.type = 'button'");
    expect(historySource).toContain("button.setAttribute('aria-expanded'");
  });

  it('styles config cards inside the context inspector with scoped overrides', () => {
    expect(inspectorCss).toContain('#context-inspector .config-section');
    expect(inspectorCss).toContain('#context-inspector .readiness-section-card');
    expect(inspectorCss).toContain('#context-inspector .config-section-header');
    expect(inspectorCss).toContain('#context-inspector .config-item');
    expect(inspectorCss).toContain('box-shadow: none');
  });

  it('keeps the ops rail flatter than a stacked dashboard card column', () => {
    expect(inspectorCss).toContain('#context-inspector .toolchain-summary');
    expect(inspectorCss).toContain('background: transparent;');
    expect(inspectorCss).toContain('border-bottom: 1px solid');
    expect(inspectorCss).toContain('#context-inspector .config-item');
    expect(inspectorCss).toContain('background: transparent;');
    expect(inspectorCss).toContain('border-bottom: 1px solid color-mix(in srgb, var(--border-subtle) 78%, transparent);');
  });
});
