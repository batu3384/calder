import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf-8');

describe('index embedded browser routing contract', () => {
  it('ensures a browser instance exists before navigating incoming embedded urls', () => {
    expect(source).toContain("import { createBrowserTabPane, getBrowserTabInstance } from './components/browser-tab-pane.js';");
    expect(source).toContain('const EMBEDDED_REVERT_WINDOW_MS = 1800;');
    expect(source).toContain('function shouldAcceptEmbeddedRoute(projectId: string, requestedUrl: string, now: number): boolean {');
    expect(source).toContain('if (!shouldAcceptEmbeddedRoute(project.id, requestedUrl, now)) return;');
    expect(source).not.toContain('if (lastRoute.previous && requestedUrl === lastRoute.previous) return false;');
    expect(source).toContain('const isSameRoute = !!(requestedUrl && previousUrl && requestedUrl === previousUrl);');
    expect(source).toContain('const projectFromSession = payload.sessionId');
    expect(source).toContain('const projectFromPath = payload.cwd ? appState.findProjectForPath(payload.cwd) : undefined;');
    expect(source).toContain('const project = projectFromSession ?? projectFromPath ?? appState.activeProject;');
    expect(source).toContain('createBrowserTabPane(session.id, session.browserTabUrl ?? payload.url);');
    expect(source).toContain('if (!isSameRoute) {');
    expect(source).toContain('queueMicrotask(() => {');
    expect(source).toContain('if (delayedInstance && !isSameRoute) {');
  });
});
