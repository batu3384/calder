import { t } from '../../i18n.js';
import {
  checkForAppUpdates,
  getUpdateCenterState,
  onUpdateCenterChange,
} from '../surface-services/update-center.js';
import type { AboutDraft, RenderAboutSectionArgs } from './preferences-modal-sections-types.js';

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
  updateProgress: HTMLElement;
  updateProgressFill: HTMLElement;
}

function renderAboutUpdateState({
  appUpdateState,
  formatRelativeTimestamp,
  updateBtn,
  updateStatus,
  updateMeta,
  updateProgress,
  updateProgressFill,
}: AboutUpdateRendererArgs): void {
  if (appUpdateState.phase === 'checking') {
    updateBtn.disabled = true;
    updateBtn.textContent = t('Checking...');
    updateStatus.textContent = t('Checking for updates...');
    updateMeta.textContent = t('Contacting update server.');
    updateProgress.classList.add('hidden');
    return;
  }
  if (appUpdateState.phase === 'downloading') {
    updateBtn.disabled = true;
    updateBtn.textContent = t('Downloading...');
    const versionLabel = appUpdateState.targetVersion
      ? `v${appUpdateState.targetVersion}`
      : t('new version');
    const percent =
      typeof appUpdateState.downloadPercent === 'number' ? appUpdateState.downloadPercent : 0;
    updateStatus.textContent = t(`Downloading ${versionLabel}...`);
    updateMeta.textContent = t(`${percent}% completed`);
    updateProgress.classList.remove('hidden');
    updateProgressFill.style.width = `${Math.max(0, Math.min(100, percent))}%`;
    return;
  }
  if (appUpdateState.phase === 'ready_to_restart') {
    updateBtn.disabled = false;
    updateBtn.textContent = t('Restart to Apply');
    const versionLabel = appUpdateState.targetVersion
      ? `v${appUpdateState.targetVersion}`
      : t('new update');
    updateStatus.textContent = t(`${versionLabel} is ready. Restart to apply.`);
    updateMeta.textContent = t('The update is downloaded.');
    updateProgress.classList.remove('hidden');
    updateProgressFill.style.width = '100%';
    return;
  }
  if (appUpdateState.phase === 'up_to_date') {
    updateBtn.disabled = false;
    updateBtn.textContent = t('Check for Updates');
    updateStatus.textContent = t("You're up to date.");
    updateMeta.textContent = appUpdateState.lastCheckedAt
      ? t(`Checked ${formatRelativeTimestamp(appUpdateState.lastCheckedAt)}`)
      : t('No recent check.');
    updateProgress.classList.add('hidden');
    return;
  }
  if (appUpdateState.phase === 'error') {
    updateBtn.disabled = false;
    updateBtn.textContent = t('Retry Check');
    updateStatus.textContent = t('Update check failed.');
    updateMeta.textContent = t(appUpdateState.errorMessage ?? 'Try again in a moment.');
    updateProgress.classList.add('hidden');
    return;
  }
  updateBtn.disabled = false;
  updateBtn.textContent = t('Check for Updates');
  updateStatus.textContent = t('No check yet.');
  updateMeta.textContent = t('Use this to check for a newer Calder build.');
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
  versionLine.textContent = t('Version: loading...');

  const aboutLead = document.createElement('div');
  aboutLead.className = 'about-lead';
  aboutLead.textContent = t(
    'A focused desktop workspace for browser context, CLI surfaces, and AI session flow.',
  );

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
  updateBtn.textContent = t('Check for Updates');

  const updateInfo = document.createElement('div');
  updateInfo.className = 'about-update-info';

  const updateStatus = document.createElement('div');
  updateStatus.className = 'about-update-status';

  const updateMeta = document.createElement('div');
  updateMeta.className = 'about-update-meta';

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
  linksDiv.appendChild(
    createExternalAboutLink(t('GitHub'), 'https://github.com/batuhanyuksel/calder'),
  );
  linksDiv.appendChild(
    createExternalAboutLink(t('Report a Bug'), 'https://github.com/batuhanyuksel/calder/issues'),
  );
  return linksDiv;
}

function createAboutCommunity(): HTMLElement {
  const communityDiv = document.createElement('div');
  communityDiv.className = 'about-community';
  communityDiv.append(
    t('Calder is open source. '),
    createExternalAboutLink(t('Contribute on GitHub'), 'https://github.com/batuhanyuksel/calder'),
    t(' — and if you find it useful, give it a star!'),
  );
  return communityDiv;
}

function createDebugModeRow(preferenceDraft: AboutDraft): HTMLElement {
  const debugRow = document.createElement('div');
  debugRow.className = 'modal-toggle-field';

  const debugLabel = document.createElement('label');
  debugLabel.htmlFor = 'pref-debug-mode';
  debugLabel.textContent = t('Debug Mode');

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
    t('Project'),
    t('Calder'),
    t('Version details, update checks, and source links for the current build.'),
  );

  appendOverviewGrid(content, [
    {
      label: t('Channel'),
      value: t('Desktop app'),
      note: t('This workspace is tuned for side-by-side surface and session work.'),
    },
    {
      label: t('Source'),
      value: t('Open source'),
      note: t('The repo and issue tracker stay one click away.'),
    },
    {
      label: t('Updates'),
      value: t('Manual check'),
      note: t('Run a direct check whenever you want to confirm a newer build.'),
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
    versionLine.textContent = t(`Version: ${ver}`);
  });

  return updateCleanup;
}
