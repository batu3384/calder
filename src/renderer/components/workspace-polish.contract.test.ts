import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const tabBarSource = readFileSync(new URL('./tab-bar.ts', import.meta.url), 'utf-8');
const splitLayoutSource = readFileSync(new URL('./split-layout.ts', import.meta.url), 'utf-8');
const tabsCss = readFileSync(new URL('../styles/tabs.css', import.meta.url), 'utf-8');
const baseCss = readFileSync(new URL('../styles/base.css', import.meta.url), 'utf-8');

describe('workspace polish contract', () => {
  it('keeps the command deck focused on sessions instead of duplicating workspace identity chrome', () => {
    expect(tabBarSource).not.toContain('renderWorkspaceIdentity');
    expect(tabBarSource).not.toContain('workspace-project-name');
    expect(tabBarSource).not.toContain('workspace-project-meta');
    expect(tabsCss).not.toContain('#workspace-identity');
    expect(tabsCss).not.toContain('.workspace-project-name');
    expect(tabsCss).not.toContain('.workspace-project-meta');
  });

  it('upgrades the empty state into an action-oriented launch surface', () => {
    expect(splitLayoutSource).toContain('empty-state-primary-action');
    expect(splitLayoutSource).toContain('Start First Session');
    expect(splitLayoutSource).toContain('Create Project');
    expect(splitLayoutSource).toContain('Open a project or start a live run');
    expect(splitLayoutSource).toContain('Start a run or open Live View');
    expect(splitLayoutSource).toContain('Browser context stays on the left.');
    expect(splitLayoutSource).toContain('promptNewProject');
    expect(baseCss).toContain('.empty-state-card');
    expect(baseCss).toContain('.empty-state-primary-action');
    expect(baseCss).toContain('align-items: flex-start;');
    expect(baseCss).toContain('justify-content: flex-start;');
    expect(baseCss).toContain('border-top: 1px solid var(--border-subtle);');
    expect(baseCss).toContain('background: transparent;');
    expect(baseCss).toContain('--font-display:');
  });
});
