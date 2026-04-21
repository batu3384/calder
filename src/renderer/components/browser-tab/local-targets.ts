import { instances } from './instance.js';
import { navigateTo } from './navigation.js';
import type { BrowserTabInstance } from './types.js';

export async function populateLocalTargets(
  instance: BrowserTabInstance,
  grid: HTMLDivElement,
  copy: HTMLDivElement,
  meta: HTMLDivElement,
): Promise<void> {
  grid.innerHTML = '';
  copy.textContent = 'Scanning for active localhost targets…';
  meta.textContent = 'Scanning…';

  try {
    const targets = await window.calder.browser.listLocalTargets();
    if (!instances.has(instance.sessionId)) return;

    if (targets.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'browser-ntp-empty';
      empty.textContent = 'No active localhost surfaces found yet. Start a dev server, or paste any URL above.';
      grid.appendChild(empty);
      copy.textContent = 'Only running localhost surfaces are listed here.';
      meta.textContent = '0 running';
      return;
    }

    copy.textContent = 'Only running localhost surfaces appear here. Pick one or paste any URL above.';
    meta.textContent = `${targets.length} running`;
    for (const target of targets) {
      const btn = document.createElement('button');
      btn.className = 'browser-ntp-link';
      const label = document.createElement('span');
      label.className = 'browser-ntp-link-label';
      label.textContent = target.label;

      const targetMeta = document.createElement('span');
      targetMeta.className = 'browser-ntp-link-meta';
      targetMeta.textContent = target.meta;

      btn.appendChild(label);
      btn.appendChild(targetMeta);
      btn.addEventListener('click', () => navigateTo(instance, target.url));
      grid.appendChild(btn);
    }
  } catch {
    if (!instances.has(instance.sessionId)) return;
    const empty = document.createElement('div');
    empty.className = 'browser-ntp-empty';
    empty.textContent = 'Could not detect localhost surfaces right now. Paste any URL above to keep going.';
    grid.appendChild(empty);
    copy.textContent = 'Only running localhost surfaces are listed here.';
    meta.textContent = 'Unavailable';
  }
}
