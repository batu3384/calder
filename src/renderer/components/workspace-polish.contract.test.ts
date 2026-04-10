import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const tabBarSource = readFileSync(new URL('./tab-bar.ts', import.meta.url), 'utf-8');
const splitLayoutSource = readFileSync(new URL('./split-layout.ts', import.meta.url), 'utf-8');
const tabsCss = readFileSync(new URL('../styles/tabs.css', import.meta.url), 'utf-8');
const baseCss = readFileSync(new URL('../styles/base.css', import.meta.url), 'utf-8');

describe('workspace polish contract', () => {
  it('renders a workspace identity block in the command deck', () => {
    expect(tabBarSource).toContain('renderWorkspaceIdentity');
    expect(tabBarSource).toContain('workspace-project-name');
    expect(tabBarSource).toContain('workspace-project-meta');
    expect(tabsCss).toContain('#workspace-identity');
    expect(tabsCss).toContain('.workspace-project-name');
    expect(tabsCss).toContain('.workspace-project-meta');
  });

  it('upgrades the empty state into an action-oriented launch surface', () => {
    expect(splitLayoutSource).toContain('empty-state-primary-action');
    expect(splitLayoutSource).toContain('Start First Session');
    expect(splitLayoutSource).toContain('Choose A Project');
    expect(splitLayoutSource).toContain('promptNewProject');
    expect(baseCss).toContain('.empty-state-card');
    expect(baseCss).toContain('.empty-state-primary-action');
  });
});
