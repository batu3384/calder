import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const source = readFileSync(path.join(process.cwd(), 'src/preload/browser-tab-preload.ts'), 'utf-8');

describe('browser tab preload inspect contract', () => {
  it('guards inspect and flow handlers against non-element event targets', () => {
    expect(source).toContain('resolveEventElementTarget');
    expect(source).toContain('collectSameOriginFrameDocuments');
    expect(source).toContain("drawCanvas.setAttribute('data-calder-overlay', 'true');");
    expect(source).toContain('if (flowMode) exitFlowMode();');
    expect(source).toContain('if (drawMode) exitDrawMode();');
    expect(source).toContain('if (inspectMode) exitInspectMode();');
    expect(source).toContain('escapeCssIdentifier');
    expect(source).toContain('escapeCssAttributeValue');
    expect(source).toContain('void replayFlowClick(payload');
    expect(source).toContain("ipcRenderer.on('auth-fill-credentials'");
    expect(source).toContain("ipcRenderer.sendToHost('auth-fill-result'");
    expect(source).toContain('document.addEventListener(\'load\', onFrameLoadCapture, true);');
    expect(source).not.toContain('browser-tab-open-intent');
    expect(source).not.toContain('browser-tab-popup');
  });
});
