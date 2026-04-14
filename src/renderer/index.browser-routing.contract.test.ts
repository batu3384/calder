import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf-8');

describe('index embedded browser routing contract', () => {
  it('ensures a browser instance exists before navigating incoming embedded urls', () => {
    expect(source).toContain("import { createBrowserTabPane, getBrowserTabInstance } from './components/browser-tab-pane.js';");
    expect(source).toContain('createBrowserTabPane(session.id, session.browserTabUrl ?? payload.url);');
    expect(source).toContain('queueMicrotask(() => {');
    expect(source).toContain('navigateTo(delayedInstance, payload.url);');
  });
});
