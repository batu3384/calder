import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockShowAlertBanner = vi.fn();
const mockRemoveAlertBanner = vi.fn();
const mockShowStatusLineConflictModal = vi.fn<(...args: any[]) => Promise<'keep' | 'replace'>>(async () => 'keep');
const mockRespondConflictDialog = vi.fn();
const mockReinstall = vi.fn<(providerId: unknown) => Promise<{ success: boolean }>>(async () => ({ success: true }));
const mockValidate = vi.fn<(providerId: unknown) => Promise<{ statusLine: string; hooks: string }>>(async () => ({ statusLine: 'calder', hooks: 'complete' }));
const mockGetMeta = vi.fn<(providerId: unknown) => Promise<any>>(async () => ({
  id: 'claude',
  displayName: 'Claude Code',
  binaryName: 'claude',
  capabilities: {
    sessionResume: true,
    costTracking: true,
    contextWindow: true,
    hookStatus: true,
    configReading: true,
    shiftEnterNewline: true,
    pendingPromptTrigger: 'startup-arg',
  },
  defaultContextWindowSize: 200000,
}));

let warningHandler: ((data: any) => void) | undefined;
let conflictHandler: ((data: any) => void) | undefined;

vi.mock('./alert-banner.js', () => ({
  showAlertBanner: (config: unknown) => mockShowAlertBanner(config),
  removeAlertBanner: (sessionId: unknown) => mockRemoveAlertBanner(sessionId),
}));

vi.mock('./statusline-conflict-modal.js', () => ({
  showStatusLineConflictModal: (command: unknown) => mockShowStatusLineConflictModal(command),
}));

vi.stubGlobal('window', {
  calder: {
    provider: {
      getMeta: (providerId: unknown) => mockGetMeta(providerId),
    },
    settings: {
      onConflictDialog: (cb: (data: any) => void) => { conflictHandler = cb; return () => {}; },
      onWarning: (cb: (data: any) => void) => { warningHandler = cb; return () => {}; },
      respondConflictDialog: (choice: unknown) => mockRespondConflictDialog(choice),
      reinstall: (providerId: unknown) => mockReinstall(providerId),
      validate: (providerId: unknown) => mockValidate(providerId),
    },
  },
});

describe('settings guard UI', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    warningHandler = undefined;
    conflictHandler = undefined;
    const mod = await import('./settings-guard-ui.js');
    mod.initSettingsGuard();
  });

  it('uses short, clear tracking copy and the Enable tracking CTA', async () => {
    warningHandler?.({ sessionId: 's1', providerId: 'qwen', statusLine: 'foreign', hooks: 'complete' });

    expect(mockShowAlertBanner).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: 's1',
      message: expect.stringContaining('Tracking is off'),
      cta: expect.objectContaining({ label: 'Enable tracking' }),
    }));
  });

  it('reinstalls and validates the warned provider before clearing the alert', async () => {
    warningHandler?.({ sessionId: 's1', providerId: 'qwen', statusLine: 'missing', hooks: 'complete' });
    const config = mockShowAlertBanner.mock.calls[0]?.[0];
    const button = { disabled: false, textContent: '' } as HTMLButtonElement;

    await config.cta.onClick(button);

    expect(button.textContent).toBe('Enabling…');
    expect(mockReinstall).toHaveBeenCalledWith('qwen');
    expect(mockValidate).toHaveBeenCalledWith('qwen');
    expect(mockRemoveAlertBanner).toHaveBeenCalled();
  });

  it('keeps the alert visible when validation is still unhealthy after reinstall', async () => {
    mockValidate.mockResolvedValueOnce({ statusLine: 'foreign', hooks: 'partial' });
    warningHandler?.({ sessionId: 's1', providerId: 'claude', statusLine: 'foreign', hooks: 'partial' });
    const config = mockShowAlertBanner.mock.calls[0]?.[0];
    const button = { disabled: false, textContent: '' } as HTMLButtonElement;

    await config.cta.onClick(button);

    expect(mockReinstall).toHaveBeenCalledWith('claude');
    expect(mockValidate).toHaveBeenCalledWith('claude');
    expect(button.disabled).toBe(false);
    expect(button.textContent).toBe('Enable tracking');
    expect(mockRemoveAlertBanner).not.toHaveBeenCalled();
  });

  it('maps Keep current and Use Calder choices back to the main process', async () => {
    mockShowStatusLineConflictModal.mockResolvedValueOnce('replace');
    await conflictHandler?.({ foreignCommand: '/tmp/other/statusline.sh' });

    expect(mockShowStatusLineConflictModal).toHaveBeenCalledWith('/tmp/other/statusline.sh');
    expect(mockRespondConflictDialog).toHaveBeenCalledWith('replace');
  });
});
