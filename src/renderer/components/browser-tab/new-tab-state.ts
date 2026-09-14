import { t } from '../../i18n.js';

interface NewTabStateElements {
  newTabPage: HTMLDivElement;
  ntpState: HTMLDivElement;
  ntpTitle: HTMLDivElement;
  ntpSubtitle: HTMLDivElement;
  ntpTargetsText: HTMLDivElement;
  ntpTargetsMeta: HTMLDivElement;
  ntpGrid: HTMLDivElement;
}

interface NewTabStateControllerOptions {
  elements: NewTabStateElements;
  syncSurfaceVisibility: (showEmptySurface: boolean) => void;
  isLocalSurfaceUrl: (url: string) => boolean;
}

export interface NewTabStateController {
  resetNewTabCopy: () => void;
  showOfflineState: (failedUrl: string) => void;
}

export function createNewTabStateController(
  options: NewTabStateControllerOptions,
): NewTabStateController {
  const { elements, syncSurfaceVisibility, isLocalSurfaceUrl } = options;
  const { newTabPage, ntpState, ntpTitle, ntpSubtitle, ntpTargetsText, ntpTargetsMeta, ntpGrid } =
    elements;

  function resetNewTabCopy(): void {
    newTabPage.dataset.mode = 'default';
    ntpState.dataset.state = 'default';
    ntpState.textContent = t('Ready');
    ntpTitle.textContent = t('Open a local surface');
    ntpSubtitle.textContent = t('Paste a URL above, or pick a running localhost target below.');
    ntpTargetsText.textContent = t('Looking for running localhost targets…');
    ntpTargetsMeta.textContent = t('Scanning…');
  }

  function showOfflineState(failedUrl: string): void {
    const isLocalSurface = isLocalSurfaceUrl(failedUrl);

    ntpState.dataset.state = isLocalSurface ? 'offline' : 'unavailable';
    ntpState.textContent = t('Offline');
    ntpTitle.textContent = t('Surface offline');
    ntpSubtitle.textContent = isLocalSurface
      ? `${failedUrl}. ${t('Start the local app again, then rescan localhost or paste a different URL above.')}`
      : `${failedUrl}. ${t('This page could not be opened right now. Choose another running surface or paste a different URL.')}`;
    ntpTargetsText.textContent = isLocalSurface
      ? t('Start the local app again, then rescan localhost or paste a different URL above.')
      : t('Paste a different URL above, or choose another running localhost surface.');
    ntpTargetsMeta.textContent = isLocalSurface ? t('Offline') : t('Unavailable');
    ntpGrid.innerHTML = '';

    const offlineCard = document.createElement('div');
    offlineCard.className = 'browser-ntp-empty';
    offlineCard.textContent = isLocalSurface
      ? t(
          'Start the local app again, then choose another running localhost surface or paste a new URL.',
        )
      : t(
          'This page could not be opened right now. Choose another running surface or paste a different URL.',
        );
    ntpGrid.appendChild(offlineCard);
    newTabPage.dataset.mode = 'offline';
    syncSurfaceVisibility(true);
  }

  return {
    resetNewTabCopy,
    showOfflineState,
  };
}
