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
    ntpState.textContent = 'Ready';
    ntpTitle.textContent = 'Open a local surface';
    ntpSubtitle.textContent = 'Paste a URL above, or pick a running localhost target below.';
    ntpTargetsText.textContent = 'Looking for running localhost targets…';
    ntpTargetsMeta.textContent = 'Scanning…';
  }

  function showOfflineState(failedUrl: string): void {
    const isLocalSurface = isLocalSurfaceUrl(failedUrl);

    ntpState.dataset.state = isLocalSurface ? 'offline' : 'unavailable';
    ntpState.textContent = 'Offline';
    ntpTitle.textContent = 'Surface offline';
    ntpSubtitle.textContent = isLocalSurface
      ? `${failedUrl} is not reachable. Start the app, then reload or rescan.`
      : `${failedUrl} could not be opened. Try another URL or localhost target.`;
    ntpTargetsText.textContent = isLocalSurface
      ? 'Start the local app again, then rescan or paste a different URL.'
      : 'Paste a different URL, or choose another localhost target.';
    ntpTargetsMeta.textContent = isLocalSurface ? 'Offline' : 'Unavailable';
    ntpGrid.innerHTML = '';

    const offlineCard = document.createElement('div');
    offlineCard.className = 'browser-ntp-empty';
    offlineCard.textContent = isLocalSurface
      ? 'Local app is down. Rescan after it starts, or paste a new URL.'
      : 'Page could not be opened. Choose another target or paste a different URL.';
    ntpGrid.appendChild(offlineCard);
    newTabPage.dataset.mode = 'offline';
    syncSurfaceVisibility(true);
  }

  return {
    resetNewTabCopy,
    showOfflineState,
  };
}
