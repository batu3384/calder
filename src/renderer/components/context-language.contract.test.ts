import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf-8');
const configSectionsSource = readFileSync(new URL('./config-sections.ts', import.meta.url), 'utf-8');
const gitPanelSource = readFileSync(new URL('./git-panel.ts', import.meta.url), 'utf-8');
const historySource = readFileSync(new URL('./session-history.ts', import.meta.url), 'utf-8');
const inspectorCss = readFileSync(new URL('../styles/context-inspector.css', import.meta.url), 'utf-8');

describe('context language contract', () => {
  it('uses curated section language in the right inspector', () => {
    expect(html).toContain('Readiness');
    expect(html).toContain('Continuity');
    expect(html).toContain('Toolchain');
    expect(configSectionsSource).toContain("'Integrations'");
    expect(configSectionsSource).toContain("'Skills Library'");
    expect(configSectionsSource).toContain("'Custom Commands'");
    expect(gitPanelSource).toContain('Workspace Changes');
    expect(historySource).toContain('Session Archive');
  });

  it('styles config cards inside the context inspector with scoped overrides', () => {
    expect(inspectorCss).toContain('#context-inspector .config-section');
    expect(inspectorCss).toContain('#context-inspector .config-section-header');
    expect(inspectorCss).toContain('#context-inspector .config-item');
  });
});
