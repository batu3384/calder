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

export function createNewTabStateController(options: NewTabStateControllerOptions): NewTabStateController {
  const {
    elements,
    syncSurfaceVisibility,
    isLocalSurfaceUrl,
  } = options;
  const {
    newTabPage,
    ntpState,
    ntpTitle,
    ntpSubtitle,
    ntpTargetsText,
    ntpTargetsMeta,
    ntpGrid,
  } = elements;

  function resetNewTabCopy(): void {
    newTabPage.dataset.mode = 'default';
    ntpState.dataset.state = 'default';
    ntpState.textContent = 'Ready to capture';
    ntpTitle.textContent = 'Open a running surface';
    ntpSubtitle.textContent = 'Jump into a running app, capture the right context, and route it into the session you choose without leaving Calder.';
    ntpTargetsText.textContent = 'Scanning for active localhost targets…';
    ntpTargetsMeta.textContent = 'Scanning…';
  }

  function showOfflineState(failedUrl: string): void {
    const isLocalSurface = isLocalSurfaceUrl(failedUrl);

    ntpState.dataset.state = isLocalSurface ? 'offline' : 'unavailable';
    ntpState.textContent = 'Offline';
    ntpTitle.textContent = 'Surface offline';
    ntpSubtitle.textContent = isLocalSurface
      ? `${failedUrl} is not reachable right now. Start the local app again, then reload or rescan localhost.`
      : `${failedUrl} could not be opened right now. Try reloading, pasting a different URL, or choosing another local surface.`;
    ntpTargetsText.textContent = isLocalSurface
      ? 'Start the local app again, then rescan localhost or paste a different URL above.'
      : 'Paste a different URL above, or choose another running localhost surface.';
    ntpTargetsMeta.textContent = isLocalSurface ? 'Offline' : 'Unavailable';
    ntpGrid.innerHTML = '';

    const offlineCard = document.createElement('div');
    offlineCard.className = 'browser-ntp-empty';
    offlineCard.textContent = isLocalSurface
      ? 'Start the local app again, then choose another running localhost surface or paste a new URL.'
      : 'This page could not be opened right now. Choose another running surface or paste a different URL.';
    ntpGrid.appendChild(offlineCard);
    newTabPage.dataset.mode = 'offline';
    syncSurfaceVisibility(true);
  }

  return {
    resetNewTabCopy,
    showOfflineState,
  };
}
