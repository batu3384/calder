import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf-8');
const configSectionsSource = [
  readFileSync(new URL('./config-sections/config-sections.ts', import.meta.url), 'utf-8'),
  readFileSync(new URL('./config-sections/config-sections-auto-approval.ts', import.meta.url), 'utf-8'),
].join('\n');
const gitPanelSource = readFileSync(new URL('./git-panel.ts', import.meta.url), 'utf-8');
const historySource = readFileSync(new URL('./session-history.ts', import.meta.url), 'utf-8');
const inspectorSource = readFileSync(new URL('./context-inspector.ts', import.meta.url), 'utf-8');
const inspectorCss = readFileSync(new URL('../styles/context-inspector.css', import.meta.url), 'utf-8');

describe('context language contract', () => {
  it('uses curated section language in the right inspector', () => {
    expect(html).toContain('Inspector');
    expect(html).toContain('Workspace Pulse');
    expect(html).toContain('Run controls, project state, and tools stay separated so the rail stays readable.');
    expect(html).toContain('context-inspector-tabs');
    expect(html).toContain('Worktree status, branches, and safe git actions.');
    expect(html).toContain('Recent runs, notes, and session timeline.');
    expect(html).not.toContain('id="context-inspector-overview"');
    expect(html).toContain('class="context-inspector-open control-panel-surface ops-rail ops-rail-surface"');
    expect(configSectionsSource).toContain("'MCP Servers'");
    expect(configSectionsSource).toContain("'Auto Approval'");
    expect(configSectionsSource).toContain('Model Context Protocol');
    expect(configSectionsSource).toContain("'Skills'");
    expect(configSectionsSource).toContain("'Commands'");
    expect(configSectionsSource).toContain('localizedSectionTitle');
    expect(configSectionsSource).toContain('localizedAddLabel');
    expect(configSectionsSource).toContain("'MCP sunucusu ekle'");
    expect(configSectionsSource).not.toContain("'Integrations'");
    expect(configSectionsSource).toContain('Toolkit');
    expect(gitPanelSource).toContain('Git');
    expect(gitPanelSource).toContain('Git is clean');
    expect(historySource).toContain('Run Log');
    expect(historySource).toContain("'Çalışma günlüğü'");
    expect(historySource).toContain('localizedText');
    expect(historySource).toContain('recent run');
    expect(inspectorSource).toContain('inspectorEl.dataset.railSignal');
    expect(inspectorSource).not.toContain('context-inspector-provider-chip');
    expect(inspectorSource).not.toContain('context-inspector-surface-chip');
    expect(inspectorSource).not.toContain('context-inspector-signal-chip');
    expect(html).not.toContain('Calder Signal');
    expect(html).toContain('context-inspector-header-note');
    expect(html).not.toContain('Ops Rail');
    expect(html).not.toContain('Support');
    expect(html).not.toContain('AI Setup');
    expect(html).not.toContain('Recent Sessions');
    expect(html).not.toContain('Toolchain');
    expect(html).not.toContain('Control Panel');
    expect(html).not.toContain('Sessions, git status, and run activity in one place.');
    expect(html).not.toContain('Tool Status');
    expect(html).not.toContain('Repo');
    expect(html).not.toContain('Config');
  });

  it('keeps stable right-rail sections after removing the snapshot card', () => {
    expect(inspectorSource).toContain('inspectorEl.dataset.railSignal');
    expect(inspectorSource).not.toContain('Project Snapshot');
    expect(html).toContain('data-section="capabilities"');
    expect(html).toContain('data-section="git"');
    expect(html).not.toContain('data-section="health"');
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
    expect(inspectorCss).toContain('#context-inspector .config-section-header');
    expect(inspectorCss).toContain('#context-inspector .config-item');
    expect(inspectorCss).toContain('box-shadow: none');
    expect(inspectorCss).toContain('overflow-wrap: anywhere;');
    expect(inspectorCss).toContain('.context-inspector-header-note');
    expect(inspectorCss).toContain('.auto-approval-control');
  });

  it('keeps the ops rail flatter than a stacked dashboard card column', () => {
    expect(inspectorCss).toContain('#context-inspector .toolchain-summary');
    expect(inspectorCss).toContain('background: transparent;');
    expect(inspectorCss).toContain('border-bottom: 1px solid');
    expect(inspectorCss).toContain('#context-inspector .config-item');
    expect(inspectorCss).toContain('background: transparent;');
    expect(inspectorCss).toContain('border-bottom: 1px solid color-mix(in srgb, var(--border-subtle) 78%, transparent);');
    expect(inspectorCss).toContain("#context-inspector[data-rail-signal='warning'] .context-inspector-section[data-section=\"capabilities\"]");
  });
});
