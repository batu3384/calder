import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

describe('app/browser IPC delegation contract', () => {
  const ipcHandlersSource = readFileSync(
    path.join(process.cwd(), 'src/main/ipc-handlers.ts'),
    'utf8',
  );
  const appBrowserSource = readFileSync(
    path.join(process.cwd(), 'src/main/ipc-app-browser.ts'),
    'utf8',
  );

  it('delegates app/browser channel registration from ipc-handlers', () => {
    expect(ipcHandlersSource).toContain('registerAppBrowserIpcHandlers({');
    expect(appBrowserSource).toContain("'app:focus'");
    expect(appBrowserSource).toContain("'app:getVersion'");
    expect(appBrowserSource).toContain("'app:getBrowserPreloadPath'");
    expect(appBrowserSource).toContain("'app:sendToGuestWebContents'");
    expect(appBrowserSource).toContain("'browser:saveScreenshot'");
    expect(appBrowserSource).toContain("'browser:listLocalTargets'");
    expect(appBrowserSource).toContain("'app:openExternal'");
  });
});
