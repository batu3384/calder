import {
  checkForAppUpdates,
  getUpdateCenterState,
  onUpdateCenterChange,
} from '../surface-services/update-center.js';
import type {
  AboutDraft,
  RenderAboutSectionArgs,
} from './preferences-modal-sections-types.js';

interface AboutHeroElements {
  hero: HTMLElement;
  versionLine: HTMLElement;
}

interface AboutUpdateElements {
  row: HTMLElement;
  cleanup: () => void;
}

interface AboutUpdateRendererArgs {
  appUpdateState: ReturnType<typeof getUpdateCenterState>['app'];
  formatRelativeTimestamp: (timestamp?: string) => string;
  updateBtn: HTMLButtonElement;
  updateStatus: HTMLElement;
  updateMeta: HTMLElement;
  updateActivity: HTMLElement;
  updateProgress: HTMLElement;
  updateProgressFill: HTMLElement;
}

function renderAboutUpdateState({
  appUpdateState,
  formatRelativeTimestamp,
  updateBtn,
  updateStatus,
  updateMeta,
  updateActivity,
  updateProgress,
  updateProgressFill,
}: AboutUpdateRendererArgs): void {
  if (appUpdateState.phase === 'checking') {
    updateBtn.disabled = true;
    updateBtn.textContent = 'Checking...';
    updateStatus.textContent = 'Checking for updates...';
    updateMeta.textContent = 'Contacting update server.';
    updateActivity.textContent = 'Status: request sent to release channel.';
    updateProgress.classList.add('hidden');
    return;
  }
  if (appUpdateState.phase === 'downloading') {
    updateBtn.disabled = true;
    updateBtn.textContent = 'Downloading...';
    const versionLabel = appUpdateState.targetVersion ? `v${appUpdateState.targetVersion}` : 'new version';
    const percent = typeof appUpdateState.downloadPercent === 'number' ? appUpdateState.downloadPercent : 0;
    updateStatus.textContent = `Downloading ${versionLabel}...`;
    updateMeta.textContent = `${percent}% completed`;
    updateActivity.textContent = 'Status: package download is in progress.';
    updateProgress.classList.remove('hidden');
    updateProgressFill.style.width = `${Math.max(0, Math.min(100, percent))}%`;
    return;
  }
  if (appUpdateState.phase === 'ready_to_restart') {
    updateBtn.disabled = false;
    updateBtn.textContent = 'Restart to Apply';
    const versionLabel = appUpdateState.targetVersion ? `v${appUpdateState.targetVersion}` : 'new update';
    updateStatus.textContent = `${versionLabel} is ready. Restart to apply.`;
    updateMeta.textContent = 'The update is downloaded.';
    updateActivity.textContent = 'Status: restart is required to finish update.';
    updateProgress.classList.remove('hidden');
    updateProgressFill.style.width = '100%';
    return;
  }
  if (appUpdateState.phase === 'up_to_date') {
    updateBtn.disabled = false;
    updateBtn.textContent = 'Check for Updates';
    updateStatus.textContent = 'You’re up to date.';
    updateMeta.textContent = appUpdateState.lastCheckedAt
      ? `Checked ${formatRelativeTimestamp(appUpdateState.lastCheckedAt)}`
      : 'No recent check.';
    updateActivity.textContent = 'Status: no newer build found.';
    updateProgress.classList.add('hidden');
    return;
  }
  if (appUpdateState.phase === 'error') {
    updateBtn.disabled = false;
    updateBtn.textContent = 'Retry Check';
    updateStatus.textContent = 'Update check failed.';
    updateMeta.textContent = appUpdateState.errorMessage ?? 'Try again in a moment.';
    updateActivity.textContent = 'Status: check failed, retry is available.';
    updateProgress.classList.add('hidden');
    return;
  }
  updateBtn.disabled = false;
  updateBtn.textContent = 'Check for Updates';
  updateStatus.textContent = 'No check yet.';
  updateMeta.textContent = 'Use this to check for a newer Calder build.';
  updateActivity.textContent = 'Status: update check has not run in this session.';
  updateProgress.classList.add('hidden');
}

function createAboutHero(): AboutHeroElements {
  const aboutHero = document.createElement('div');
  aboutHero.className = 'about-hero';

  const appName = document.createElement('div');
  appName.className = 'about-app-name';
  appName.textContent = 'Calder';

  const versionLine = document.createElement('div');
  versionLine.className = 'about-version';
  versionLine.textContent = 'Version: loading...';

  const aboutLead = document.createElement('div');
  aboutLead.className = 'about-lead';
  aboutLead.textContent = 'A focused desktop workspace for browser context, CLI surfaces, and AI session flow.';

  aboutHero.appendChild(appName);
  aboutHero.appendChild(versionLine);
  aboutHero.appendChild(aboutLead);
  return { hero: aboutHero, versionLine };
}

function createAboutUpdateRow(
  formatRelativeTimestamp: (timestamp?: string) => string,
): AboutUpdateElements {
  const updateRow = document.createElement('div');
  updateRow.className = 'about-update-row';

  const updateBtn = document.createElement('button');
  updateBtn.className = 'about-update-btn';
  updateBtn.textContent = 'Check for Updates';

  const updateInfo = document.createElement('div');
  updateInfo.className = 'about-update-info';

  const updateStatus = document.createElement('div');
  updateStatus.className = 'about-update-status';

  const updateMeta = document.createElement('div');
  updateMeta.className = 'about-update-meta';

  const updateActivity = document.createElement('div');
  updateActivity.className = 'about-update-activity';

  const updateProgress = document.createElement('div');
  updateProgress.className = 'about-update-progress hidden';

  const updateProgressFill = document.createElement('div');
  updateProgressFill.className = 'about-update-progress-fill';
  updateProgress.appendChild(updateProgressFill);

  updateBtn.addEventListener('click', () => {
    const appStateSnapshot = getUpdateCenterState().app;
    if (appStateSnapshot.phase === 'ready_to_restart') {
      void window.calder.update.install();
      return;
    }
    void checkForAppUpdates();
  });

  updateInfo.appendChild(updateStatus);
  updateInfo.appendChild(updateMeta);
  updateInfo.appendChild(updateActivity);
  updateInfo.appendChild(updateProgress);
  updateRow.appendChild(updateBtn);
  updateRow.appendChild(updateInfo);

  const renderState = (appUpdateState: ReturnType<typeof getUpdateCenterState>['app']) => {
    renderAboutUpdateState({
      appUpdateState,
      formatRelativeTimestamp,
      updateBtn,
      updateStatus,
      updateMeta,
      updateActivity,
      updateProgress,
      updateProgressFill,
    });
  };

  renderState(getUpdateCenterState().app);
  const cleanup = onUpdateCenterChange((snapshot) => {
    renderState(snapshot.app);
  });
  return { row: updateRow, cleanup };
}

function createExternalAboutLink(label: string, url: string): HTMLAnchorElement {
  const link = document.createElement('a');
  link.className = 'about-link';
  link.textContent = label;
  link.href = '#';
  link.addEventListener('click', (event) => {
    event.preventDefault();
    window.calder.app.openExternal(url);
  });
  return link;
}

function createAboutLinks(): HTMLElement {
  const linksDiv = document.createElement('div');
  linksDiv.className = 'about-links about-link-grid';
  linksDiv.appendChild(createExternalAboutLink('GitHub', 'https://github.com/batuhanyuksel/calder'));
  linksDiv.appendChild(createExternalAboutLink('Report a Bug', 'https://github.com/batuhanyuksel/calder/issues'));
  return linksDiv;
}

function createAboutCommunity(): HTMLElement {
  const communityDiv = document.createElement('div');
  communityDiv.className = 'about-community';
  communityDiv.append(
    'Calder is open source. ',
    createExternalAboutLink('Contribute on GitHub', 'https://github.com/batuhanyuksel/calder'),
    ' — and if you find it useful, give it a star!',
  );
  return communityDiv;
}

function createDebugModeRow(preferenceDraft: AboutDraft): HTMLElement {
  const debugRow = document.createElement('div');
  debugRow.className = 'modal-toggle-field';

  const debugLabel = document.createElement('label');
  debugLabel.htmlFor = 'pref-debug-mode';
  debugLabel.textContent = 'Debug Mode';

  const debugModeCheckbox = document.createElement('input');
  debugModeCheckbox.type = 'checkbox';
  debugModeCheckbox.id = 'pref-debug-mode';
  debugModeCheckbox.checked = preferenceDraft.debugMode;
  debugModeCheckbox.addEventListener('change', () => {
    preferenceDraft.debugMode = debugModeCheckbox.checked;
  });

  debugRow.appendChild(debugLabel);
  debugRow.appendChild(debugModeCheckbox);
  return debugRow;
}

export function renderAboutPreferencesSection({
  content,
  preferenceDraft,
  appendSectionIntro,
  appendOverviewGrid,
  formatRelativeTimestamp,
}: RenderAboutSectionArgs): () => void {
  appendSectionIntro(
    content,
    'Project',
    'Calder',
    'Version details, update checks, and source links for the current build.',
  );

  appendOverviewGrid(content, [
    {
      label: 'Channel',
      value: 'Desktop app',
      note: 'This workspace is tuned for side-by-side surface and session work.',
    },
    {
      label: 'Source',
      value: 'Open source',
      note: 'The repo and issue tracker stay one click away.',
    },
    {
      label: 'Updates',
      value: 'Manual check',
      note: 'Run a direct check whenever you want to confirm a newer build.',
    },
  ]);

  const aboutDiv = document.createElement('div');
  aboutDiv.className = 'about-section';

  const { hero: aboutHero, versionLine } = createAboutHero();
  const { row: updateRow, cleanup: updateCleanup } = createAboutUpdateRow(formatRelativeTimestamp);
  const linksDiv = createAboutLinks();
  const communityDiv = createAboutCommunity();
  const debugRow = createDebugModeRow(preferenceDraft);

  aboutDiv.appendChild(aboutHero);
  aboutDiv.appendChild(updateRow);
  aboutDiv.appendChild(linksDiv);
  aboutDiv.appendChild(communityDiv);
  aboutDiv.appendChild(debugRow);
  content.appendChild(aboutDiv);

  void window.calder.app.getVersion().then((ver) => {
    versionLine.textContent = `Version: ${ver}`;
  });

  return updateCleanup;
}
