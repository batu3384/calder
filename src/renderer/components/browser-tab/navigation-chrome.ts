import { normalizeUrl } from './navigation.js';
import type { BrowserTabInstance } from './types.js';

interface NavigationControlsOptions {
  instance: BrowserTabInstance;
  backBtn: HTMLButtonElement;
  fwdBtn: HTMLButtonElement;
}

interface AddressBarStateOptions {
  instance: BrowserTabInstance;
  urlInput: HTMLInputElement;
  toolbarAddressShell: HTMLDivElement;
  goBtn: HTMLButtonElement;
  reloadBtn: HTMLButtonElement;
}

export function syncNavigationControls(options: NavigationControlsOptions): void {
  const { instance, backBtn, fwdBtn } = options;

  if (!instance.webviewReady) {
    backBtn.disabled = true;
    fwdBtn.disabled = true;
    backBtn.title = 'Open a page before navigating back';
    fwdBtn.title = 'Open a page before navigating forward';
    return;
  }

  backBtn.disabled = !instance.webview.canGoBack();
  fwdBtn.disabled = !instance.webview.canGoForward();
  backBtn.title = backBtn.disabled ? 'No page behind this one yet' : 'Back';
  fwdBtn.title = fwdBtn.disabled ? 'No forward page yet' : 'Forward';
}

export function syncAddressBarState(options: AddressBarStateOptions): void {
  const { instance, urlInput, toolbarAddressShell, goBtn, reloadBtn } = options;

  const normalizedDraft = normalizeUrl(urlInput.value);
  const hasUnappliedAddressChange = normalizedDraft !== instance.committedUrl;
  urlInput.dataset.dirty = hasUnappliedAddressChange ? 'true' : 'false';
  toolbarAddressShell.dataset.dirty = hasUnappliedAddressChange ? 'true' : 'false';

  if (instance.isLoading) {
    goBtn.dataset.state = 'stop';
    goBtn.textContent = 'Stop';
    goBtn.title = 'Stop the current page load';
    goBtn.ariaLabel = 'Stop page load';
  } else if (
    !hasUnappliedAddressChange &&
    instance.committedUrl &&
    instance.committedUrl !== 'about:blank'
  ) {
    goBtn.dataset.state = 'reload';
    goBtn.textContent = 'Reload';
    goBtn.title = 'Reload current page';
    goBtn.ariaLabel = 'Reload current page';
  } else {
    goBtn.dataset.state = 'open';
    goBtn.textContent = 'Open';
    goBtn.title = normalizedDraft ? 'Open typed address' : 'Open address';
    goBtn.ariaLabel = 'Open address';
  }

  reloadBtn.disabled = !instance.webviewReady || instance.isLoading || hasUnappliedAddressChange;
  if (instance.committedUrl === 'about:blank') {
    reloadBtn.disabled = true;
  }
  reloadBtn.title = instance.isLoading
    ? 'Wait for the current page to finish loading'
    : hasUnappliedAddressChange
      ? 'Apply the typed address before reloading'
      : instance.committedUrl === 'about:blank'
        ? 'Open a page before reloading'
        : 'Reload';
}
