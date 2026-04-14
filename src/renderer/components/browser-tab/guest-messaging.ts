import type { WebviewElement } from './types.js';

export async function sendGuestMessage(
  webview: WebviewElement,
  channel: string,
  ...args: unknown[]
): Promise<void> {
  try {
    const sent = await window.calder.app.sendToGuestWebContents(
      webview.getWebContentsId(),
      channel,
      ...args,
    );
    if (sent) return;
  } catch (err) {
    console.warn(`Failed to send guest message via main bridge (${channel})`, err);
  }

  try {
    webview.send(channel, ...args);
  } catch (err) {
    console.warn(`Failed to send guest message directly (${channel})`, err);
  }
}
