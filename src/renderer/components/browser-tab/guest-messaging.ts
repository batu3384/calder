import type { WebviewElement } from './types.js';

export async function sendGuestMessage(
  webview: WebviewElement,
  channel: string,
  ...args: unknown[]
): Promise<void> {
  const sent = await window.calder.app.sendToGuestWebContents(
    webview.getWebContentsId(),
    channel,
    ...args,
  );
  if (sent) return;

  console.warn(
    `Guest message blocked or failed (${channel}). Main-process mediation is required for guest IPC.`,
  );
}
