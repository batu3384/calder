import { t } from '../../i18n.js';
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
    backBtn.title = t('Open a page before navigating back');
    fwdBtn.title = t('Open a page before navigating forward');
    return;
  }

  backBtn.disabled = !instance.webview.canGoBack();
  fwdBtn.disabled = !instance.webview.canGoForward();
  backBtn.title = backBtn.disabled ? t('No page behind this one yet') : t('Back');
  fwdBtn.title = fwdBtn.disabled ? t('No forward page yet') : t('Forward');
}

export function syncAddressBarState(options: AddressBarStateOptions): void {
  const { instance, urlInput, toolbarAddressShell, goBtn, reloadBtn } = options;

  const normalizedDraft = normalizeUrl(urlInput.value);
  const hasUnappliedAddressChange = normalizedDraft !== instance.committedUrl;
  urlInput.dataset.dirty = hasUnappliedAddressChange ? 'true' : 'false';
  toolbarAddressShell.dataset.dirty = hasUnappliedAddressChange ? 'true' : 'false';

  if (instance.isLoading) {
    goBtn.dataset.state = 'stop';
    goBtn.textContent = t('Stop');
    goBtn.title = t('Stop the current page load');
    goBtn.ariaLabel = t('Stop page load');
  } else if (
    !hasUnappliedAddressChange &&
    instance.committedUrl &&
    instance.committedUrl !== 'about:blank'
  ) {
    goBtn.dataset.state = 'reload';
    goBtn.textContent = t('Reload');
    goBtn.title = t('Reload current page');
    goBtn.ariaLabel = t('Reload current page');
  } else {
    goBtn.dataset.state = 'open';
    goBtn.textContent = t('Open');
    goBtn.title = normalizedDraft ? t('Open typed address') : t('Open address');
    goBtn.ariaLabel = t('Open address');
  }

  reloadBtn.disabled = !instance.webviewReady || instance.isLoading || hasUnappliedAddressChange;
  if (instance.committedUrl === 'about:blank') {
    reloadBtn.disabled = true;
  }
  reloadBtn.title = instance.isLoading
    ? t('Wait for the current page to finish loading')
    : hasUnappliedAddressChange
      ? t('Apply the typed address before reloading')
      : instance.committedUrl === 'about:blank'
        ? t('Open a page before reloading')
        : t('Reload');
}
