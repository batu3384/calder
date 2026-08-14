import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  FakeDocument,
  FakeElement,
  makeWindowStub,
  mockClipboardWrite,
  mockPtyWrite,
  webLinksActivateRef,
} from './terminal-pane.test-harness.js';

describe('terminal pending prompt injection', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useFakeTimers();
    webLinksActivateRef.current = null;

    vi.stubGlobal('document', new FakeDocument());
    vi.stubGlobal('window', makeWindowStub());
    vi.stubGlobal('navigator', { clipboard: { writeText: mockClipboardWrite } });
  });

  it('passes pending prompt as initialPrompt to pty.create for claude', async () => {
    const { createTerminalPane, setPendingPrompt, spawnTerminal } =
      await import('./terminal-pane.js');
    const mockPtyCreate = (window as any).calder.pty.create;

    createTerminalPane('claude-1', '/project', null, false, '', 'claude');
    setPendingPrompt('claude-1', 'fix the bug');
    await spawnTerminal('claude-1');

    expect(mockPtyCreate).toHaveBeenCalledWith(
      'claude-1',
      '/project',
      null,
      false,
      '',
      'claude',
      'fix the bug',
    );
    expect(mockPtyWrite).not.toHaveBeenCalled();
  });

  it('passes pending prompt as initialPrompt to pty.create for codex', async () => {
    const { createTerminalPane, setPendingPrompt, spawnTerminal } =
      await import('./terminal-pane.js');
    const mockPtyCreate = (window as any).calder.pty.create;

    createTerminalPane('codex-1', '/project', null, false, '', 'codex');
    setPendingPrompt('codex-1', 'fix the bug');
    await spawnTerminal('codex-1');

    expect(mockPtyCreate).toHaveBeenCalledWith(
      'codex-1',
      '/project',
      null,
      false,
      '',
      'codex',
      'fix the bug',
    );
    expect(mockPtyWrite).not.toHaveBeenCalled();
  });

  it('passes pending prompt as initialPrompt to pty.create for cursor', async () => {
    const { createTerminalPane, setPendingPrompt, spawnTerminal } =
      await import('./terminal-pane.js');
    const mockPtyCreate = (window as any).calder.pty.create;

    createTerminalPane('cursor-1', '/project', null, false, '', 'cursor');
    setPendingPrompt('cursor-1', 'fix the bug');
    await spawnTerminal('cursor-1');

    expect(mockPtyCreate).toHaveBeenCalledWith(
      'cursor-1',
      '/project',
      null,
      false,
      '',
      'cursor',
      'fix the bug',
    );
    expect(mockPtyWrite).not.toHaveBeenCalled();
  });

  it('does not pass initialPrompt when no pending prompt is set', async () => {
    const { createTerminalPane, spawnTerminal } = await import('./terminal-pane.js');
    const mockPtyCreate = (window as any).calder.pty.create;

    createTerminalPane('claude-2', '/project', null, false, '', 'claude');
    await spawnTerminal('claude-2');

    expect(mockPtyCreate).toHaveBeenCalledWith(
      'claude-2',
      '/project',
      null,
      false,
      '',
      'claude',
      undefined,
    );
  });

  it('launches restored Cursor sessions in native resume mode once a cliSessionId exists', async () => {
    const { createTerminalPane, spawnTerminal } = await import('./terminal-pane.js');
    const mockPtyCreate = (window as any).calder.pty.create;

    createTerminalPane('cursor-restored', '/project', 'cursor-old-id', true, '', 'cursor');
    await spawnTerminal('cursor-restored');

    expect(mockPtyCreate).toHaveBeenCalledWith(
      'cursor-restored',
      '/project',
      'cursor-old-id',
      true,
      '',
      'cursor',
      undefined,
    );
  });

  it('recovers from spawn failures without leaving the session stuck', async () => {
    const { createTerminalPane, spawnTerminal, getTerminalInstance } =
      await import('./terminal-pane.js');
    const mockPtyCreate = (window as any).calder.pty.create;

    mockPtyCreate.mockRejectedValueOnce(new Error('spawn failed')).mockResolvedValueOnce(undefined);

    createTerminalPane('recover-1', '/missing/project', null, true, '', 'claude');

    await expect(spawnTerminal('recover-1')).resolves.toBeUndefined();
    const afterFailure = getTerminalInstance('recover-1');
    expect(afterFailure?.spawned).toBe(false);
    expect(afterFailure?.exited).toBe(true);
    expect(afterFailure?.element.querySelector('.terminal-exit-overlay')).not.toBeNull();
    expect(afterFailure?.element.querySelector('.terminal-exit-title')?.textContent).toBe(
      'Session failed to start',
    );
    const retryButton = afterFailure?.element.querySelector('.respawn-btn') as FakeElement | null;
    expect(retryButton).not.toBeNull();

    retryButton?.emit('click', {});
    await vi.runAllTimersAsync();

    const afterRetry = getTerminalInstance('recover-1');
    expect(afterRetry?.spawned).toBe(true);
    expect(afterRetry?.exited).toBe(false);
    expect(mockPtyCreate).toHaveBeenCalledTimes(2);
  });

  it('does not inject pending prompt from PTY output', async () => {
    const { createTerminalPane, setPendingPrompt, handlePtyData, spawnTerminal } =
      await import('./terminal-pane.js');

    createTerminalPane('codex-2', '/project', null, false, '', 'codex');
    setPendingPrompt('codex-2', 'some prompt');
    await spawnTerminal('codex-2');

    handlePtyData('codex-2', 'some output');
    await vi.runAllTimersAsync();
    expect(mockPtyWrite).not.toHaveBeenCalled();
  });

  it('delivers a prompt into an already spawned terminal session', async () => {
    const { createTerminalPane, spawnTerminal, deliverPromptToTerminalSession } =
      await import('./terminal-pane.js');

    createTerminalPane('codex-live', '/project', null, false, '', 'codex');
    await spawnTerminal('codex-live');
    mockPtyWrite.mockClear();

    const delivered = await (deliverPromptToTerminalSession as any)(
      'codex-live',
      'Fix the auth modal',
    );

    expect(delivered).toBe(true);
    expect(mockPtyWrite).toHaveBeenCalledWith(
      'codex-live',
      '\u001b[200~Fix the auth modal\u001b[201~\r',
    );
  });

  it('marks the provider badge with the active provider id for provider-aware styling', async () => {
    const { createTerminalPane } = await import('./terminal-pane.js');

    const instance = createTerminalPane('claude-themed', '/project', null, false, '', 'claude');
    const providerBadge = instance.element.querySelector(
      '.terminal-pane-provider',
    ) as FakeElement | null;

    expect(providerBadge?.dataset.provider).toBe('claude');
  });
});
