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
  ntpEyebrow.className = 'browser-ntp-eyebrow shell-kicker';
  ntpEyebrow.textContent = 'Live View';

  const ntpState = document.createElement('div');
  ntpState.className = 'browser-ntp-state';
  ntpState.dataset.state = 'default';
  ntpState.textContent = 'Ready to capture';

  ntpHeroTop.appendChild(ntpEyebrow);
  ntpHeroTop.appendChild(ntpState);
  ntpHero.appendChild(ntpHeroTop);

  const ntpTitle = document.createElement('div');
  ntpTitle.className = 'browser-ntp-title';
  ntpTitle.textContent = 'Open a running surface';
  ntpHero.appendChild(ntpTitle);

  const ntpSubtitle = document.createElement('div');
  ntpSubtitle.className = 'browser-ntp-subtitle';
  ntpSubtitle.textContent = 'Jump into a running app, capture the right context, and route it into the session you choose without leaving Calder.';
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

  const ntpCapabilities = document.createElement('div');
  ntpCapabilities.className = 'browser-ntp-capabilities';
  for (const label of ['Inspect DOM', 'Annotate visually', 'Record flow']) {
    const chip = document.createElement('span');
    chip.className = 'browser-ntp-capability control-chip';
    chip.textContent = label;
    ntpCapabilities.appendChild(chip);
  }
  ntpHero.appendChild(ntpCapabilities);
  newTabPage.appendChild(ntpHero);

  const ntpLayout = document.createElement('div');
  ntpLayout.className = 'browser-ntp-layout';

  const ntpTargets = document.createElement('section');
  ntpTargets.className = 'browser-ntp-panel browser-ntp-targets';

  const ntpTargetsHeader = document.createElement('div');
  ntpTargetsHeader.className = 'browser-ntp-section-header';

  const ntpTargetsTitle = document.createElement('div');
  ntpTargetsTitle.className = 'browser-ntp-section-title shell-kicker';
  ntpTargetsTitle.textContent = 'Local surfaces';
  ntpTargetsHeader.appendChild(ntpTargetsTitle);

  const ntpTargetsMeta = document.createElement('div');
  ntpTargetsMeta.className = 'browser-ntp-section-meta';
  ntpTargetsMeta.textContent = 'Scanning…';
  ntpTargetsHeader.appendChild(ntpTargetsMeta);

  ntpTargets.appendChild(ntpTargetsHeader);

  const ntpTargetsText = document.createElement('div');
  ntpTargetsText.className = 'browser-ntp-section-copy';
  ntpTargetsText.textContent = 'Scanning for active localhost targets…';
  ntpTargets.appendChild(ntpTargetsText);

  const ntpGrid = document.createElement('div');
  ntpGrid.className = 'browser-ntp-grid';
  ntpTargets.appendChild(ntpGrid);

  const ntpWorkflow = document.createElement('section');
  ntpWorkflow.className = 'browser-ntp-panel browser-ntp-workflow';

  const ntpWorkflowTitle = document.createElement('div');
  ntpWorkflowTitle.className = 'browser-ntp-section-title shell-kicker';
  ntpWorkflowTitle.textContent = 'How it works';
  ntpWorkflow.appendChild(ntpWorkflowTitle);

  const ntpWorkflowList = document.createElement('div');
  ntpWorkflowList.className = 'browser-ntp-flow';
  const flowSteps = [
    ['01', 'Open a surface', 'Start with a running app, a localhost surface, or any manual URL.'],
    ['02', 'Capture the right context', 'Inspect an element, draw on the page, or record a reproducible browser flow.'],
    ['03', 'Hand off to session', 'Route the page context into a new or open session without leaving Calder.'],
  ] as const;

  for (const [index, title, copy] of flowSteps) {
    const step = document.createElement('div');
    step.className = 'browser-ntp-flow-step';
    step.innerHTML = `
      <span class="browser-ntp-flow-index">${index}</span>
      <div class="browser-ntp-flow-copy">
        <div class="browser-ntp-flow-title">${title}</div>
        <div class="browser-ntp-flow-text">${copy}</div>
      </div>
    `;
    ntpWorkflowList.appendChild(step);
  }
  ntpWorkflow.appendChild(ntpWorkflowList);

  ntpLayout.appendChild(ntpTargets);
  ntpLayout.appendChild(ntpWorkflow);
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
