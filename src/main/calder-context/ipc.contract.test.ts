import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const ipcHandlersSource = readFileSync(new URL('../ipc-handlers.ts', import.meta.url), 'utf8');
const calderIpcSource = readFileSync(new URL('../ipc-calder.ts', import.meta.url), 'utf8');
const preloadSource = [
  readFileSync(new URL('../../preload/preload.ts', import.meta.url), 'utf8'),
  readFileSync(new URL('../../preload/preload-api-project-domains.ts', import.meta.url), 'utf8'),
].join('\n');
const rendererTypesSource = readFileSync(
  new URL('../../renderer/types.ts', import.meta.url),
  'utf8',
);

describe('project context IPC contract', () => {
  it('delegates context IPC handlers from main registration module', () => {
    expect(ipcHandlersSource).toContain('registerCalderIpcHandlers({');
    expect(calderIpcSource).toContain("'context:getProjectState'");
    expect(calderIpcSource).toContain("'context:createStarterFiles'");
    expect(calderIpcSource).toContain("'context:createSharedRule'");
    expect(calderIpcSource).toContain("'context:renameSharedRule'");
    expect(calderIpcSource).toContain("'context:deleteSharedRule'");
    expect(calderIpcSource).toContain("'context:watchProject'");
    expect(calderIpcSource).toContain('bindProjectWatcher(');
    expect(calderIpcSource).toContain('projectContextBindings');
    expect(calderIpcSource).toContain("'context:changed'");
  });

  it('exposes context APIs from preload', () => {
    expect(preloadSource).toContain('context: {');
    expect(preloadSource).toContain('getProjectState');
    expect(preloadSource).toContain('createStarterFiles');
    expect(preloadSource).toContain('createSharedRule');
    expect(preloadSource).toContain('renameSharedRule');
    expect(preloadSource).toContain('deleteSharedRule');
    expect(preloadSource).toContain('watchProject');
    expect(preloadSource).toContain("onChannel('context:changed'");
  });

  it('declares context APIs in renderer types', () => {
    expect(rendererTypesSource).toContain('context: {');
    expect(rendererTypesSource).toContain('getProjectState(projectPath: string)');
    expect(rendererTypesSource).toContain('createStarterFiles(projectPath: string)');
    expect(rendererTypesSource).toContain('createSharedRule(');
    expect(rendererTypesSource).toContain("priority: 'hard' | 'soft'");
    expect(rendererTypesSource).toContain('renameSharedRule(');
    expect(rendererTypesSource).toContain('deleteSharedRule(');
    expect(rendererTypesSource).toContain('watchProject(projectPath: string)');
  });
});
