import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendToGuestMock = vi.hoisted(() => vi.fn());

describe('sendGuestMessage', () => {
  beforeEach(() => {
    vi.resetModules();
    sendToGuestMock.mockReset();
    vi.stubGlobal('window', {
      calder: {
        app: {
          sendToGuestWebContents: sendToGuestMock,
        },
      },
    });
  });

  it('does not fall back to direct webview.send when main bridge fails', async () => {
    sendToGuestMock.mockResolvedValue(false);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const webviewSend = vi.fn();
    const { sendGuestMessage } = await import('./guest-messaging.js');

    await sendGuestMessage(
      { getWebContentsId: () => 42, send: webviewSend } as never,
      'enter-inspect-mode',
    );

    expect(sendToGuestMock).toHaveBeenCalledWith(42, 'enter-inspect-mode');
    expect(webviewSend).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
