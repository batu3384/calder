import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf-8');
const configSectionsSource = readFileSync(new URL('./config-sections.ts', import.meta.url), 'utf-8');
const gitPanelSource = readFileSync(new URL('./git-panel.ts', import.meta.url), 'utf-8');
const historySource = readFileSync(new URL('./session-history.ts', import.meta.url), 'utf-8');
const readinessSource = readFileSync(new URL('./readiness-section.ts', import.meta.url), 'utf-8');
const inspectorSource = readFileSync(new URL('./context-inspector.ts', import.meta.url), 'utf-8');
const inspectorCss = readFileSync(new URL('../styles/context-inspector.css', import.meta.url), 'utf-8');

describe('context language contract', () => {
  it('uses curated section language in the right inspector', () => {
    expect(html).toContain('Overview');
    expect(html).toContain('id="context-inspector-overview"');
    expect(html).toContain('class="context-inspector-open control-panel-surface ops-rail ops-rail-surface"');
    expect(configSectionsSource).toContain("'MCP Servers'");
    expect(configSectionsSource).toContain('Model Context Protocol');
    expect(configSectionsSource).toContain("'Skills'");
    expect(configSectionsSource).toContain("'Commands'");
    expect(configSectionsSource).not.toContain("'Integrations'");
    expect(configSectionsSource).toContain('Tools Focus');
    expect(readinessSource).toContain('Readiness');
    expect(readinessSource).toContain('All good');
    expect(gitPanelSource).toContain('Git');
    expect(gitPanelSource).toContain('Git is clean');
    expect(historySource).toContain('Run Log');
    expect(historySource).toContain('recent run');
    expect(inspectorSource).toContain('Project Snapshot');
    expect(inspectorSource).toContain('Open sessions');
    expect(inspectorSource).toContain('Changes');
    expect(inspectorSource).toContain('Run log');
    expect(inspectorSource).toContain('Readiness');
    expect(inspectorSource).toContain('saved');
    expect(html).not.toContain('Ops Rail');
    expect(html).not.toContain('Support');
    expect(html).not.toContain('AI Setup');
    expect(html).not.toContain('Recent Sessions');
    expect(html).not.toContain('Toolchain');
    expect(html).not.toContain('Control Panel');
    expect(html).not.toContain('Tool Status');
    expect(html).not.toContain('Repo');
    expect(html).not.toContain('Config');
  });

  it('marks the right rail with rail mode and keeps a dedicated project snapshot card', () => {
    expect(inspectorSource).toContain('deriveRightRailMode');
    expect(inspectorSource).toContain('deriveRightRailPresentation');
    expect(inspectorSource).toContain('inspectorEl.dataset.railMode');
    expect(inspectorSource).toContain('Project Snapshot');
    expect(html).toContain('data-section="capabilities"');
    expect(html).toContain('data-section="git"');
    expect(html).toContain('data-section="health"');
    expect(html).toContain('data-section="activity"');
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
    expect(inspectorCss).toContain('.inspector-overview-card');
  });
});
