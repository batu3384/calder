import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const tabBarSource = readFileSync(path.join(process.cwd(), 'src/renderer/components/tab-bar.ts'), 'utf8');
const largeFileDetectorSource = readFileSync(path.join(process.cwd(), 'src/renderer/tools/large-file-detector.ts'), 'utf8');
const browserSessionStorageSource = readFileSync(path.join(process.cwd(), 'src/main/browser-session-storage.ts'), 'utf8');
const prerequisitesSource = readFileSync(path.join(process.cwd(), 'src/main/prerequisites.ts'), 'utf8');
const resolveBinarySource = readFileSync(path.join(process.cwd(), 'src/main/providers/resolve-binary.ts'), 'utf8');
const backgroundTaskActionsSource = readFileSync(path.join(process.cwd(), 'src/renderer/project-background-task-actions.ts'), 'utf8');
const modalSource = readFileSync(path.join(process.cwd(), 'src/renderer/components/modal.ts'), 'utf8');
const preferencesModalSource = readFileSync(path.join(process.cwd(), 'src/renderer/components/preferences-modal.ts'), 'utf8');
const usageModalSource = readFileSync(path.join(process.cwd(), 'src/renderer/components/usage-modal.ts'), 'utf8');
const starPromptSource = readFileSync(path.join(process.cwd(), 'src/renderer/components/star-prompt-dialog.ts'), 'utf8');

describe('bug hardening contract', () => {
  it('surfaces async UI errors instead of silently swallowing them', () => {
    expect(tabBarSource).not.toContain('.catch(() => {});');
    expect(largeFileDetectorSource).not.toContain('handleToolFailure(sessionId, data).catch(() => {});');
  });

  it('avoids silent catch blocks in startup and binary resolution paths', () => {
    expect(browserSessionStorageSource).not.toContain('catch {}');
    expect(prerequisitesSource).not.toContain('catch {}');
    expect(resolveBinarySource).not.toContain('catch {}');
  });

  it('keeps provider id typing strict in background task routing', () => {
    expect(backgroundTaskActionsSource).not.toContain('providerId as any');
  });

  it('uses typed modal cleanup helpers instead of overlay any properties', () => {
    expect(modalSource).toContain('registerModalCleanup');
    expect(modalSource).toContain('runModalCleanup');
    expect(modalSource).not.toContain('_cleanup');
    expect(modalSource).not.toContain('_selectCleanups');

    expect(preferencesModalSource).not.toContain('_cleanup');
    expect(usageModalSource).not.toContain('_cleanup');
    expect(starPromptSource).not.toContain('_cleanup');
  });
});
