import type { ShareBrowserControlAction, ShareMode } from '../../shared/sharing-types.js';
import { deliverPromptToTerminalSession } from '../components/terminal-pane.js';
import { getBrowserTabInstance } from '../components/browser-tab/instance.js';
import { toggleInspectMode } from '../components/browser-tab/inspect-mode.js';
import { VIEWPORT_PRESETS } from '../components/browser-tab/types.js';
import { applyViewport } from '../components/browser-tab/viewport.js';
import { sendMessage } from './webrtc-utils.js';
import { buildBrowserSessionCatalog, buildInspectPromptFromSelection, findProjectForShare, resolveBrowserTargetSessionId } from './peer-host-session-catalog.js';
import { appState } from '../state.js';

interface BrowserHostPeerState {
  ownerSessionId: string;
  activeSessionId: string;
  connected: boolean;
  authState: 'none' | 'pending' | 'verified';
  dc: RTCDataChannel;
}

export function sendBrowserState(hostPeer: BrowserHostPeerState): void {
  if (!hostPeer.connected || hostPeer.authState !== 'verified') return;
  sendMessage(hostPeer.dc, {
    type: 'browser-state',
    ...buildBrowserSessionCatalog(hostPeer.ownerSessionId),
  });
}

function sendBrowserControlResult(
  hostPeer: BrowserHostPeerState,
  action: ShareBrowserControlAction,
  ok: boolean,
  sessionId?: string,
  reason?: string,
): void {
  sendMessage(hostPeer.dc, {
    type: 'browser-control-result',
    ok,
    action,
    sessionId,
    reason,
  });
}

function sendBrowserInspectResult(hostPeer: BrowserHostPeerState, ok: boolean, sessionId?: string, reason?: string): void {
  sendMessage(hostPeer.dc, {
    type: 'browser-inspect-result',
    ok,
    sessionId,
    reason,
  });
}

function handleBrowserControl(
  hostPeer: BrowserHostPeerState,
  action: ShareBrowserControlAction,
  requestedSessionId?: string,
  viewportLabel?: string,
): void {
  const targetSessionId = resolveBrowserTargetSessionId(hostPeer.ownerSessionId, requestedSessionId);
  if (!targetSessionId) {
    sendBrowserControlResult(hostPeer, action, false, undefined, 'No browser session is currently available.');
    return;
  }

  const instance = getBrowserTabInstance(targetSessionId);
  if (!instance) {
    sendBrowserControlResult(hostPeer, action, false, targetSessionId, 'Browser surface is not ready.');
    return;
  }

  let ok = true;
  let reason: string | undefined;

  try {
    switch (action) {
      case 'back':
        if (!instance.webview.canGoBack()) {
          ok = false;
          reason = 'No page behind this one yet.';
          break;
        }
        instance.webview.goBack();
        break;
      case 'forward':
        if (!instance.webview.canGoForward()) {
          ok = false;
          reason = 'No forward page yet.';
          break;
        }
        instance.webview.goForward();
        break;
      case 'reload':
        instance.webview.reload();
        break;
      case 'toggle-inspect':
        toggleInspectMode(instance);
        break;
      case 'set-viewport': {
        const requestedLabel = String(viewportLabel || '').trim().toLowerCase();
        const preset = VIEWPORT_PRESETS.find((entry) => entry.label.toLowerCase() === requestedLabel);
        if (!preset) {
          ok = false;
          reason = 'Viewport preset is not recognized.';
          break;
        }
        applyViewport(instance, preset);
        break;
      }
      default:
        ok = false;
        reason = 'Browser action is not supported.';
    }
  } catch (error) {
    ok = false;
    reason = error instanceof Error ? error.message : 'Browser action failed.';
  }

  const project = findProjectForShare(hostPeer.ownerSessionId);
  if (ok && project) {
    appState.setActiveSession(project.id, targetSessionId);
  }

  sendBrowserControlResult(hostPeer, action, ok, targetSessionId, reason);
  sendBrowserState(hostPeer);
}

async function handleBrowserInspectSubmit(
  hostPeer: BrowserHostPeerState,
  requestedSessionId: string | undefined,
  instruction: string,
): Promise<void> {
  const normalizedInstruction = String(instruction || '').trim();
  if (!normalizedInstruction) {
    sendBrowserInspectResult(hostPeer, false, requestedSessionId, 'Inspect instruction is required.');
    sendBrowserState(hostPeer);
    return;
  }

  const targetBrowserSessionId = resolveBrowserTargetSessionId(hostPeer.ownerSessionId, requestedSessionId);
  if (!targetBrowserSessionId) {
    sendBrowserInspectResult(hostPeer, false, undefined, 'No browser session is currently available.');
    sendBrowserState(hostPeer);
    return;
  }

  const browserInstance = getBrowserTabInstance(targetBrowserSessionId);
  if (!browserInstance) {
    sendBrowserInspectResult(hostPeer, false, targetBrowserSessionId, 'Browser surface is not ready.');
    sendBrowserState(hostPeer);
    return;
  }

  const prompt = buildInspectPromptFromSelection(browserInstance, normalizedInstruction);
  if (!prompt) {
    sendBrowserInspectResult(hostPeer, false, targetBrowserSessionId, 'Select an element in inspect mode first.');
    sendBrowserState(hostPeer);
    return;
  }

  const routed = await deliverPromptToTerminalSession(hostPeer.activeSessionId, prompt);
  if (!routed) {
    sendBrowserInspectResult(hostPeer, false, targetBrowserSessionId, 'Target CLI session is not available.');
    sendBrowserState(hostPeer);
    return;
  }

  sendBrowserInspectResult(hostPeer, true, targetBrowserSessionId);
  sendBrowserState(hostPeer);
}

export function handleBrowserControlMessage(
  hostPeer: BrowserHostPeerState,
  mode: ShareMode,
  action: ShareBrowserControlAction,
  sessionId?: string,
  viewportLabel?: string,
): void {
  if (mode !== 'readwrite') {
    sendBrowserControlResult(
      hostPeer,
      action,
      false,
      sessionId,
      'Browser controls are disabled in read-only mode.',
    );
    sendBrowserState(hostPeer);
    return;
  }
  handleBrowserControl(hostPeer, action, sessionId, viewportLabel);
}

export function handleBrowserInspectSubmitMessage(
  hostPeer: BrowserHostPeerState,
  mode: ShareMode,
  sessionId: string | undefined,
  instruction: string,
): void {
  if (mode !== 'readwrite') {
    sendBrowserInspectResult(
      hostPeer,
      false,
      sessionId,
      'Inspect submit is disabled in read-only mode.',
    );
    sendBrowserState(hostPeer);
    return;
  }
  void handleBrowserInspectSubmit(hostPeer, sessionId, instruction);
}
