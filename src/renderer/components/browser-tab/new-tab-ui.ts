export interface BrowserNewTabUi {
  newTabPage: HTMLDivElement;
  ntpState: HTMLDivElement;
  ntpTitle: HTMLDivElement;
  ntpSubtitle: HTMLDivElement;
  ntpTargetsText: HTMLDivElement;
  ntpTargetsMeta: HTMLDivElement;
  ntpGrid: HTMLDivElement;
  focusAddressBtn: HTMLButtonElement;
  refreshTargetsBtn: HTMLButtonElement;
}

export function createBrowserNewTabUi(initialMode: 'default' | 'hidden'): BrowserNewTabUi {
  const newTabPage = document.createElement('div');
  newTabPage.className = 'browser-new-tab-page';
  newTabPage.dataset.mode = initialMode;

  const ntpHero = document.createElement('div');
  ntpHero.className = 'browser-ntp-hero';

  const ntpHeroTop = document.createElement('div');
  ntpHeroTop.className = 'browser-ntp-hero-top';

  const ntpEyebrow = document.createElement('div');
  ntpEyebrow.className = 'browser-ntp-eyebrow';
  ntpEyebrow.textContent = 'Live View';

  const ntpState = document.createElement('div');
  ntpState.className = 'browser-ntp-state';
  ntpState.dataset.state = 'default';
  ntpState.textContent = 'Ready';

  ntpHeroTop.appendChild(ntpEyebrow);
  ntpHeroTop.appendChild(ntpState);
  ntpHero.appendChild(ntpHeroTop);

  const ntpTitle = document.createElement('div');
  ntpTitle.className = 'browser-ntp-title';
  ntpTitle.textContent = 'Open a local surface';
  ntpHero.appendChild(ntpTitle);

  const ntpSubtitle = document.createElement('div');
  ntpSubtitle.className = 'browser-ntp-subtitle';
  ntpSubtitle.textContent = 'Paste a URL above, or pick a running localhost target below.';
  ntpHero.appendChild(ntpSubtitle);

  const ntpActions = document.createElement('div');
  ntpActions.className = 'browser-ntp-actions';

  const focusAddressBtn = document.createElement('button');
  focusAddressBtn.className = 'browser-ntp-action';
  focusAddressBtn.textContent = 'Focus address bar';

  const refreshTargetsBtn = document.createElement('button');
  refreshTargetsBtn.className = 'browser-ntp-action browser-ntp-action-secondary';
  refreshTargetsBtn.textContent = 'Rescan localhost';

  ntpActions.appendChild(focusAddressBtn);
  ntpActions.appendChild(refreshTargetsBtn);
  ntpHero.appendChild(ntpActions);
  newTabPage.appendChild(ntpHero);

  const ntpLayout = document.createElement('div');
  ntpLayout.className = 'browser-ntp-layout';

  const ntpTargets = document.createElement('section');
  ntpTargets.className = 'browser-ntp-targets';

  const ntpTargetsHeader = document.createElement('div');
  ntpTargetsHeader.className = 'browser-ntp-section-header';

  const ntpTargetsTitle = document.createElement('div');
  ntpTargetsTitle.className = 'browser-ntp-section-title';
  ntpTargetsTitle.textContent = 'Localhost';
  ntpTargetsHeader.appendChild(ntpTargetsTitle);

  const ntpTargetsMeta = document.createElement('div');
  ntpTargetsMeta.className = 'browser-ntp-section-meta';
  ntpTargetsMeta.textContent = 'Scanning…';
  ntpTargetsHeader.appendChild(ntpTargetsMeta);

  ntpTargets.appendChild(ntpTargetsHeader);

  const ntpTargetsText = document.createElement('div');
  ntpTargetsText.className = 'browser-ntp-section-copy';
  ntpTargetsText.textContent = 'Looking for running localhost targets…';
  ntpTargets.appendChild(ntpTargetsText);

  const ntpGrid = document.createElement('div');
  ntpGrid.className = 'browser-ntp-grid';
  ntpTargets.appendChild(ntpGrid);

  ntpLayout.appendChild(ntpTargets);
  newTabPage.appendChild(ntpLayout);

  return {
    newTabPage,
    ntpState,
    ntpTitle,
    ntpSubtitle,
    ntpTargetsText,
    ntpTargetsMeta,
    ntpGrid,
    focusAddressBtn,
    refreshTargetsBtn,
  };
}
