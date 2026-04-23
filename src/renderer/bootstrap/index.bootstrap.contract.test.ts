import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const indexSource = readFileSync(new URL('../index.ts', import.meta.url), 'utf-8');
const orchestratorSource = readFileSync(new URL('./renderer-session-orchestrator.ts', import.meta.url), 'utf-8');

describe('index session bootstrap contract', () => {
  it('delegates PTY/session event wiring through the renderer session orchestrator', () => {
    expect(indexSource).toContain("from './bootstrap/renderer-session-orchestrator.js'");
    expect(indexSource).toContain('const sessionOrchestrator = createRendererSessionOrchestrator({');
    expect(indexSource).toContain('sessionOrchestrator.handlePtyData(sessionId, data);');
    expect(indexSource).toContain('sessionOrchestrator.handleCostData(sessionId, costData);');
    expect(indexSource).toContain('sessionOrchestrator.handleHookStatus(sessionId, status, hookName);');
    expect(indexSource).toContain('sessionOrchestrator.handleInspectorEvents(sessionId, events);');
    expect(indexSource).toContain('sessionOrchestrator.handleCliSessionId(sessionId, cliSessionId);');
    expect(indexSource).toContain('sessionOrchestrator.handlePtyExit(sessionId, exitCode);');
    expect(indexSource).toContain('await sessionOrchestrator.initialize();');
  });

  it('keeps initialization ordering and project/session bootstrap in the orchestrator', () => {
    expect(orchestratorSource).toContain('await loadProviderMetas();');
    expect(orchestratorSource).toContain('initUpdateCenter();');
    expect(orchestratorSource).toContain('initSidebar();');
    expect(orchestratorSource).toContain('initTabBar();');
    expect(orchestratorSource).toContain('initSplitLayout();');
    expect(orchestratorSource).toContain('options.initKeybindings();');
    expect(orchestratorSource).toContain('initShareManager();');
    expect(orchestratorSource).toContain('startGitPolling();');
    expect(orchestratorSource).toContain('await appState.load();');
    expect(orchestratorSource).toContain('promptNewProject();');
    expect(orchestratorSource).toContain('checkWhatsNew();');
    expect(orchestratorSource).toContain('checkStarPrompt();');
  });
});
