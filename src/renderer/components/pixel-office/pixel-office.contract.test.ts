import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const sourceRoot = resolve(process.cwd(), 'src');
const readSource = (relativePath: string): string =>
  readFileSync(resolve(sourceRoot, relativePath), 'utf8');

describe('Pixel Office rail contract', () => {
  it('exposes live status and keyboard resize semantics in the DOM shell', () => {
    const html = readSource('renderer/index.html');

    expect(html).toContain('id="pixel-office-live-state"');
    expect(html).toContain('id="pixel-office-session-status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('role="separator"');
    expect(html).toContain('aria-valuemin="140"');
    expect(html).toContain('aria-valuemax="480"');
    expect(html).toContain('tabindex="0"');
  });

  it('keeps the rail theme-aware and aligned to three inspector tabs', () => {
    const pixelCss = readSource('renderer/styles/pixel-office.css');
    const railCss = readSource('renderer/styles/chrome-rail.css');
    const studioCss = readSource('renderer/styles/theme-command-studio.css');

    expect(pixelCss).toContain('background: var(--surface-live)');
    expect(pixelCss).toContain('.pixel-office-session-status');
    expect(railCss).toContain('grid-template-columns: repeat(3');
    expect(studioCss).toContain('grid-template-columns: repeat(3');
    expect(railCss).not.toContain('grid-template-columns: repeat(4');
    expect(studioCss).not.toContain('grid-template-columns: repeat(4');
    expect(pixelCss).not.toMatch(/#[0-9a-f]{3,8}/i);
  });

  it('applies live event batches without refetching the full tail', () => {
    const mount = readSource('renderer/components/pixel-office/mount-pixel-office.ts');

    expect(mount).toContain('onEvent((runId, incoming)');
    expect(mount).toContain('runtime.applyEvidence(sessionId, events, runId)');
  });

  it('keeps evidence preferences localized', () => {
    const preferences = readSource(
      'renderer/components/preferences/preferences-evidence-settings.ts',
    );

    expect(preferences).toContain('import { t }');
    expect(preferences).toContain("t('Session Evidence')");
    expect(preferences).not.toContain("textContent = 'Session Evidence'");
    expect(preferences).not.toContain("textContent = 'Pixel Office'");
    expect(preferences).toContain("t(mode === 'off' ? 'Off' : 'Office')");
  });

  it('exposes event age and context in the accessible session companion', () => {
    const liveStatus = readSource('renderer/components/pixel-office/live-status.ts');

    expect(liveStatus).toContain('latestEvidenceTimestamp');
    expect(liveStatus).toContain('contextPct');
    expect(liveStatus).toContain('formatEventAge');
  });

  it('bridges Context Inspector visibility to the Pixel Office loop', () => {
    const inspector = readSource('renderer/components/context-inspector.ts');
    const mount = readSource('renderer/components/pixel-office/mount-pixel-office.ts');

    expect(inspector).toContain('context-inspector-visibility');
    expect(mount).toContain('context-inspector-visibility');
    expect(mount).toContain('stopRuntime()');
  });
});
