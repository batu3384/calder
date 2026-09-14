import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const mainSource = readFileSync(new URL('./main.ts', import.meta.url), 'utf8');

const ipcHandlersSource = readFileSync(new URL('./ipc-handlers.ts', import.meta.url), 'utf8');
const appBrowserIpcSource = readFileSync(new URL('./ipc-app-browser.ts', import.meta.url), 'utf8');

describe('Calder browser routing contracts', () => {
  it('marks top-level Calder window browser opens as embedded-preferred', () => {
    expect(mainSource).toContain(
      'openUrlWithBrowserPolicy({ url, preferEmbedded: true }, mainWindow',
    );
  });

  it('marks renderer-driven openExternal calls as embedded-preferred', () => {
    expect(ipcHandlersSource).toContain('registerAppBrowserIpcHandlers({');
    expect(appBrowserIpcSource).toContain(
      'openUrlWithBrowserPolicy({ url, cwd, preferEmbedded: true }, win',
    );
  });

  it('runs hidden CALDER_SMOKE until ui-ready without blocking missing-provider dialog', () => {
    expect(mainSource).toContain("process.env.CALDER_SMOKE === '1'");
    expect(mainSource).toContain('runSmokeAndQuit');
    expect(mainSource).toContain('dataset.bootstrapReady');
    expect(mainSource).toContain('dataset.uiReady');
    expect(mainSource).toContain('providerStartup.blocking && !SMOKE_MODE');
  });
});
