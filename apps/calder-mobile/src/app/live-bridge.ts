import { parsePairingLink } from '../services/pairing';
import { palette } from '../theme';
import type { ConnectionState } from './types';

export const WEBVIEW_STATUS_BRIDGE = `
(() => {
  const post = (payload) => {
    try {
      window.ReactNativeWebView?.postMessage(JSON.stringify(payload));
    } catch {}
  };

  const postStatus = () => {
    try {
      const statusText = document.getElementById('status')?.textContent?.trim() ?? '';
      const connText = document.getElementById('connBadge')?.textContent?.trim() ?? '';
      const modeText = document.getElementById('modeBadge')?.textContent?.trim() ?? '';
      post({
        type: 'mobile_status',
        status: statusText,
        conn: connText,
        mode: modeText,
      });
    } catch {}
  };

  const postSessionCatalog = () => {
    try {
      const select = document.querySelector('[data-mobile-session-select]');
      const switchNote = document.getElementById('sessionSwitchNote')?.textContent?.trim() ?? '';
      if (!(select instanceof HTMLSelectElement)) {
        post({
          type: 'session_catalog',
          sessions: [],
          selectedSessionId: '',
          switchNote,
        });
        return;
      }
      const sessions = Array.from(select.options)
        .map((option) => ({
          id: String(option.value || '').trim(),
          name: String(option.textContent || '').trim(),
        }))
        .filter((session) => session.id.length > 0);
      post({
        type: 'session_catalog',
        sessions,
        selectedSessionId: String(select.value || ''),
        switchNote,
      });
    } catch {}
  };

  const postBrowserCatalog = () => {
    try {
      const select = document.querySelector('[data-mobile-browser-session-select]');
      const statusText = document.querySelector('[data-mobile-browser-status]')?.textContent?.trim() ?? '';
      const inspectSelectionEl = document.querySelector('[data-mobile-inspect-selection]');
      const inspectSelectionText = inspectSelectionEl instanceof HTMLElement
        ? String(inspectSelectionEl.getAttribute('data-mobile-inspect-selection-raw') || inspectSelectionEl.textContent || '').trim()
        : '';
      if (!(select instanceof HTMLSelectElement)) {
        post({
          type: 'browser_catalog',
          sessions: [],
          selectedSessionId: '',
          status: statusText,
          inspectSelection: inspectSelectionText,
        });
        return;
      }
      const sessions = Array.from(select.options)
        .map((option) => ({
          id: String(option.value || '').trim(),
          name: String(option.textContent || '').trim(),
        }))
        .filter((session) => session.id.length > 0);
      post({
        type: 'browser_catalog',
        sessions,
        selectedSessionId: String(select.value || ''),
        status: statusText,
        inspectSelection: inspectSelectionText,
      });
    } catch {}
  };

  const postAll = () => {
    postStatus();
    postSessionCatalog();
    postBrowserCatalog();
  };

  postAll();
  const opts = { childList: true, subtree: true, characterData: true };
  const statusEl = document.getElementById('status');
  const connEl = document.getElementById('connBadge');
  const modeEl = document.getElementById('modeBadge');
  const selectEl = document.querySelector('[data-mobile-session-select]');
  const browserSelectEl = document.querySelector('[data-mobile-browser-session-select]');
  const browserStatusEl = document.querySelector('[data-mobile-browser-status]');
  const inspectSelectionEl = document.querySelector('[data-mobile-inspect-selection]');
  const switchNoteEl = document.getElementById('sessionSwitchNote');
  if (statusEl) new MutationObserver(postStatus).observe(statusEl, opts);
  if (connEl) new MutationObserver(postStatus).observe(connEl, opts);
  if (modeEl) new MutationObserver(postStatus).observe(modeEl, opts);
  if (selectEl) {
    selectEl.addEventListener('change', () => {
      setTimeout(postSessionCatalog, 0);
    });
    new MutationObserver(postSessionCatalog).observe(selectEl, opts);
  }
  if (browserSelectEl) {
    browserSelectEl.addEventListener('change', () => {
      setTimeout(postBrowserCatalog, 0);
    });
    new MutationObserver(postBrowserCatalog).observe(browserSelectEl, opts);
  }
  if (browserStatusEl) {
    new MutationObserver(postBrowserCatalog).observe(browserStatusEl, opts);
  }
  if (inspectSelectionEl) {
    new MutationObserver(postBrowserCatalog).observe(inspectSelectionEl, opts);
  }
  if (switchNoteEl) {
    new MutationObserver(postSessionCatalog).observe(switchNoteEl, opts);
  }
  window.addEventListener('load', () => {
    setTimeout(postAll, 140);
  });
})();
true;
`;

export function statusColor(state: ConnectionState): string {
  if (state === 'connected') return palette.success;
  if (state === 'waiting') return palette.warning;
  if (state === 'error') return palette.danger;
  return palette.textMuted;
}

export function inferConnectionStateFromText(value: string): ConnectionState {
  const text = value.toLowerCase();
  if (!text) return 'idle';
  if (
    text.includes('connected')
    || text.includes('bagli')
    || text.includes('bağlı')
    || text.includes('aktif')
  ) {
    return 'connected';
  }
  if (
    text.includes('waiting')
    || text.includes('authoriz')
    || text.includes('verifying')
    || text.includes('bekli')
    || text.includes('dogrul')
    || text.includes('doğrul')
  ) {
    return 'waiting';
  }
  if (
    text.includes('failed')
    || text.includes('error')
    || text.includes('hata')
    || text.includes('mismatch')
  ) {
    return 'error';
  }
  return 'idle';
}

export function buildNativeBootstrapInjection(
  pairingLink: string | null,
  payload: unknown,
): string {
  if (!pairingLink || !payload || typeof payload !== 'object') {
    return 'true;';
  }
  const parsed = parsePairingLink(pairingLink);
  if (!parsed) return 'true;';

  const envelope = {
    pairingId: parsed.pairingId,
    token: parsed.token,
    payload,
  };
  return `window.__CALDER_NATIVE_BOOTSTRAP = ${JSON.stringify(envelope)}; true;`;
}
