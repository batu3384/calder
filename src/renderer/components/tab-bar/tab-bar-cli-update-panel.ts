import type { ProviderId, ProviderUpdateSummary } from '../../../shared/types/provider.js';
import { t } from '../../i18n.js';
import type {
  CliProviderProgressState,
  CliUpdateCenterState,
} from '../surface-services/update-center.js';
import { reloadCliProviderCatalog } from '../surface-services/update-center.js';

interface CliUpdateStatusCounters {
  updated: number;
  upToDate: number;
  syncPending: number;
  skipped: number;
  cancelled: number;
  error: number;
}

interface CreateTabBarCliUpdatePanelOptions {
  tabActionsEl: HTMLElement;
  updateButtonEl: HTMLButtonElement;
  onCancelUpdate: () => Promise<unknown>;
  onRunProviderUpdate: (providerId: ProviderId) => Promise<unknown>;
  onRunProviderInstall: (providerId: ProviderId) => Promise<unknown>;
  onRunAllUpdates: () => Promise<unknown>;
}

export interface TabBarCliUpdatePanelController {
  setup: () => void;
  toggle: (visible: boolean) => void;
  isVisible: () => boolean;
  containsTarget: (target: Node) => boolean;
  renderButton: (cliState: CliUpdateCenterState) => void;
  renderPanel: (cliState: CliUpdateCenterState) => void;
}

const CLI_UPDATE_BUTTON_GLYPHS = {
  refresh: '↻',
  warning: '⚠',
  cancelled: '✕',
  updated: '✓',
  upToDate: '•',
} as const;

function summarizeCliUpdateStatuses(summary: ProviderUpdateSummary): CliUpdateStatusCounters {
  let updated = 0;
  let upToDate = 0;
  let syncPending = 0;
  let skipped = 0;
  let cancelled = 0;
  let error = 0;
  for (const result of summary.results) {
    if (result.status === 'updated') updated += 1;
    else if (result.status === 'up_to_date') upToDate += 1;
    else if (result.status === 'sync_pending') syncPending += 1;
    else if (result.status === 'skipped') skipped += 1;
    else if (result.status === 'cancelled') cancelled += 1;
    else error += 1;
  }
  return { updated, upToDate, syncPending, skipped, cancelled, error };
}

function formatRelativeTimestamp(timestamp?: string): string {
  if (!timestamp) return t('No updates yet');
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return t('No updates yet');
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 60_000) return t('just now');
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 60) return t(`${diffMin}m ago`);
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return t(`${diffHour}h ago`);
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getCliProviderStatusLabel(status: CliProviderProgressState['status']): string {
  if (status === 'not_installed') return t('not installed');
  if (status === 'ready') return t('ready');
  if (status === 'up_to_date') return t('up to date');
  if (status === 'sync_pending') return t('sync pending');
  if (status === 'cancelled') return t('cancelled');
  if (status === 'updated') return t('updated');
  if (status === 'error') return t('error');
  if (status === 'running') return t('running');
  if (status === 'skipped') return t('skipped');
  if (status === 'queued') return t('queued');
  return t(status.replace(/_/g, ' '));
}

type CliUpdateProviderState = CliUpdateCenterState['providers'][number];

interface CliUpdatePanelRenderContext {
  statusEl: HTMLElement;
  metaEl: HTMLElement;
  progressFillEl: HTMLElement;
  progressLabelEl: HTMLElement;
  timestampEl: HTMLElement;
  listEl: HTMLElement;
  updateAllBtnEl: HTMLButtonElement | null;
  cancelBtnEl: HTMLButtonElement | null;
}

function renderCliUpdateButton(
  updateButtonEl: HTMLButtonElement,
  cliState: CliUpdateCenterState,
): void {
  updateButtonEl.classList.remove('is-warning', 'is-success', 'is-cancelled', 'is-idle');

  if (cliState.phase === 'running') {
    updateButtonEl.classList.add('is-updating');
    updateButtonEl.disabled = false;
    updateButtonEl.textContent = CLI_UPDATE_BUTTON_GLYPHS.refresh;
    const progressLabel =
      cliState.totalProviders > 0
        ? `${cliState.completedProviders}/${cliState.totalProviders}`
        : 'running';
    updateButtonEl.title = t(`Updating CLI tools... (${progressLabel})`);
    updateButtonEl.setAttribute('aria-label', t('Updating CLI tools'));
    return;
  }

  updateButtonEl.classList.remove('is-updating');
  updateButtonEl.disabled = false;

  if (cliState.phase === 'error') {
    updateButtonEl.classList.add('is-warning');
    updateButtonEl.textContent = CLI_UPDATE_BUTTON_GLYPHS.warning;
    updateButtonEl.title = t('CLI update failed.');
    updateButtonEl.setAttribute('aria-label', t('CLI update failed'));
    return;
  }

  if (cliState.phase === 'cancelled') {
    updateButtonEl.classList.add('is-cancelled');
    updateButtonEl.textContent = CLI_UPDATE_BUTTON_GLYPHS.cancelled;
    updateButtonEl.title = t('CLI update cancelled.');
    updateButtonEl.setAttribute('aria-label', t('CLI update cancelled'));
    return;
  }

  if (cliState.phase === 'completed' && cliState.lastSummary) {
    const counters = summarizeCliUpdateStatuses(cliState.lastSummary);
    if (counters.error > 0) {
      updateButtonEl.classList.add('is-warning');
      updateButtonEl.textContent = CLI_UPDATE_BUTTON_GLYPHS.warning;
      updateButtonEl.title = t('CLI update completed with errors');
      updateButtonEl.setAttribute('aria-label', t('CLI update completed with errors'));
    } else if (counters.syncPending > 0) {
      updateButtonEl.classList.add('is-warning');
      updateButtonEl.textContent = CLI_UPDATE_BUTTON_GLYPHS.warning;
      updateButtonEl.title = t('CLI updates waiting for package sync');
      updateButtonEl.setAttribute('aria-label', t('CLI updates waiting for package sync'));
    } else if (counters.updated > 0) {
      updateButtonEl.classList.add('is-success');
      updateButtonEl.textContent = CLI_UPDATE_BUTTON_GLYPHS.updated;
      updateButtonEl.title = t('CLI tools updated');
      updateButtonEl.setAttribute('aria-label', t('CLI tools updated'));
    } else {
      updateButtonEl.classList.add('is-idle');
      updateButtonEl.textContent = CLI_UPDATE_BUTTON_GLYPHS.upToDate;
      updateButtonEl.title = t('CLI tools are already up to date.');
      updateButtonEl.setAttribute('aria-label', t('CLI tools are already up to date'));
    }
    return;
  }

  updateButtonEl.classList.add('is-idle');
  updateButtonEl.textContent = CLI_UPDATE_BUTTON_GLYPHS.refresh;
  updateButtonEl.title = t('Update CLI Tools');
  updateButtonEl.setAttribute('aria-label', t('Update CLI tools'));
}

function renderCliUpdatePanelCancelButton(
  cancelBtnEl: HTMLButtonElement | null,
  cliState: CliUpdateCenterState,
): void {
  if (!cancelBtnEl) return;
  const running = cliState.phase === 'running';
  cancelBtnEl.classList.toggle('hidden', !running);
  cancelBtnEl.disabled = !running || cliState.cancelRequested;
  cancelBtnEl.textContent = cliState.cancelRequested ? t('Cancelling...') : t('Cancel');
}

function getCliUpdateProgress(cliState: CliUpdateCenterState): {
  total: number;
  completed: number;
  progressPercent: number;
  progressLabel: string;
} {
  const total =
    cliState.totalProviders > 0 ? cliState.totalProviders : Math.max(cliState.providers.length, 0);
  const completed = Math.min(cliState.completedProviders, total || cliState.completedProviders);
  const activeProvider = cliState.providers.find(
    (provider) => provider.providerId === cliState.activeProviderId,
  );
  const activeProgress =
    cliState.phase === 'running'
      ? Math.max(0, Math.min(100, activeProvider?.progressPercent ?? 0)) / 100
      : 0;
  const progressPercent = total > 0 ? Math.round(((completed + activeProgress) / total) * 100) : 0;
  const progressLabel = total > 0 ? `${completed}/${total}` : '0/0';
  return { total, completed, progressPercent, progressLabel };
}

function renderCliUpdatePanelTimestamp(
  timestampEl: HTMLElement,
  cliState: CliUpdateCenterState,
): void {
  if (cliState.phase === 'running') {
    timestampEl.textContent = cliState.startedAt
      ? t(`Started: ${formatRelativeTimestamp(cliState.startedAt)}`)
      : t('Started: just now');
    return;
  }

  const reference = cliState.finishedAt ?? cliState.startedAt;
  timestampEl.textContent = reference
    ? t(`Last run: ${formatRelativeTimestamp(reference)}`)
    : t('Last run: No updates yet');
}

function renderCliUpdatePanelStatusAndMeta(
  statusEl: HTMLElement,
  metaEl: HTMLElement,
  cliState: CliUpdateCenterState,
  total: number,
  completed: number,
): void {
  if (cliState.phase === 'running') {
    const activeProvider = cliState.providers.find(
      (provider) => provider.providerId === cliState.activeProviderId,
    );
    const activeLabel = cliState.cancelRequested
      ? t('Cancellation requested. Waiting for the active command to stop...')
      : activeProvider
        ? activeProvider.message
          ? t(`${activeProvider.providerName}: ${activeProvider.message}`)
          : t(`${activeProvider.providerName} in progress.`)
        : t('Waiting for provider progress...');
    statusEl.textContent =
      total > 0
        ? t(
            `${cliState.cancelRequested ? 'Cancelling CLI update' : 'Updating CLI tools'} (${completed}/${total})`,
          )
        : t('Updating CLI tools...');
    metaEl.textContent = activeLabel;
    return;
  }

  if (cliState.phase === 'cancelled') {
    const processedLabel =
      total > 0
        ? t(`${completed}/${total} providers finished before cancellation.`)
        : t(`${completed} provider${completed === 1 ? '' : 's'} finished before cancellation.`);
    statusEl.textContent = t('CLI update cancelled.');
    metaEl.textContent = t(
      `Cancelled ${formatRelativeTimestamp(cliState.finishedAt)}. ${processedLabel}`,
    );
    return;
  }

  if (cliState.phase === 'completed' && cliState.lastSummary) {
    const counters = summarizeCliUpdateStatuses(cliState.lastSummary);
    if (counters.error > 0) {
      statusEl.textContent = t(
        `Completed with ${counters.error} issue${counters.error === 1 ? '' : 's'}.`,
      );
    } else if (counters.syncPending > 0) {
      statusEl.textContent = t(
        `${counters.syncPending} provider${counters.syncPending === 1 ? '' : 's'} waiting for package sync.`,
      );
    } else if (counters.updated > 0) {
      statusEl.textContent = t(
        `${counters.updated} provider${counters.updated === 1 ? '' : 's'} updated.`,
      );
    } else {
      statusEl.textContent = t('All providers are already up to date.');
    }
    metaEl.textContent = t(`Finished ${formatRelativeTimestamp(cliState.finishedAt)}.`);
    return;
  }

  if (cliState.phase === 'error') {
    statusEl.textContent = t('CLI update failed.');
    metaEl.textContent = t(cliState.errorMessage ?? 'An unknown error occurred.');
    return;
  }

  statusEl.textContent = t('No update run yet.');
  metaEl.textContent = t('Install or update individual CLIs below.');
}

function getCliUpdateProviderDetail(provider: CliUpdateProviderState): string {
  const versionParts = [provider.beforeVersion, provider.afterVersion].filter(Boolean);
  if (provider.status === 'running' && provider.message) {
    return typeof provider.progressPercent === 'number'
      ? t(`${provider.message} (${Math.round(provider.progressPercent)}%)`)
      : t(provider.message);
  }
  if (provider.status === 'sync_pending' && provider.message) {
    return t(provider.message);
  }
  if (versionParts.length === 2) {
    return `${versionParts[0]} → ${versionParts[1]}`;
  }
  if (provider.latestVersion) {
    return t(`Latest: ${provider.latestVersion}`);
  }
  if (provider.message) {
    return t(provider.message);
  }
  return provider.status === 'running' ? t('Running...') : t('Waiting...');
}

function renderCliUpdatePanelList(
  listEl: HTMLElement,
  cliState: CliUpdateCenterState,
  onRunProviderUpdate: (providerId: ProviderId) => Promise<unknown>,
  onRunProviderInstall: (providerId: ProviderId) => Promise<unknown>,
): void {
  listEl.innerHTML = '';
  const providers = cliState.providers;
  if (providers.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'cli-update-panel-empty';
    empty.textContent = t('Provider status will appear here as checks complete.');
    listEl.appendChild(empty);
    return;
  }

  for (const provider of providers) {
    const row = document.createElement('div');
    row.className = 'cli-update-provider-row';
    row.classList.toggle(
      'is-active',
      cliState.phase === 'running' && provider.providerId === cliState.activeProviderId,
    );

    const top = document.createElement('div');
    top.className = 'cli-update-provider-head';

    const name = document.createElement('div');
    name.className = 'cli-update-provider-name';
    name.textContent = provider.providerName;

    const status = document.createElement('div');
    status.className = `cli-update-provider-status ${provider.status}`;
    status.textContent = getCliProviderStatusLabel(provider.status);

    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'cli-update-provider-action';
    action.setAttribute('data-provider-id', provider.providerId);
    const needsInstall = provider.status === 'not_installed';
    const actionHandler = needsInstall ? onRunProviderInstall : onRunProviderUpdate;
    action.disabled = cliState.phase === 'running';
    action.textContent =
      provider.status === 'running' && typeof provider.progressPercent === 'number'
        ? `${Math.round(provider.progressPercent)}%`
        : needsInstall
          ? t('Install')
          : t('Update');
    action.setAttribute(
      'aria-label',
      needsInstall ? t(`Install ${provider.providerName}`) : t(`Update ${provider.providerName}`),
    );
    action.addEventListener('click', () => {
      if (action.disabled) return;
      void actionHandler(provider.providerId).catch((error) => {
        console.error('[tab-bar] Failed to run CLI provider action', error);
      });
    });

    top.appendChild(name);
    top.appendChild(status);
    top.appendChild(action);

    const detail = document.createElement('div');
    detail.className = 'cli-update-provider-detail';
    detail.textContent = getCliUpdateProviderDetail(provider);

    row.appendChild(top);
    row.appendChild(detail);
    listEl.appendChild(row);
  }
}

function renderCliUpdatePanelContent(
  context: CliUpdatePanelRenderContext,
  cliState: CliUpdateCenterState,
  onRunProviderUpdate: (providerId: ProviderId) => Promise<unknown>,
  onRunProviderInstall: (providerId: ProviderId) => Promise<unknown>,
): void {
  const {
    statusEl,
    metaEl,
    progressFillEl,
    progressLabelEl,
    timestampEl,
    listEl,
    updateAllBtnEl,
    cancelBtnEl,
  } = context;

  renderCliUpdatePanelCancelButton(cancelBtnEl, cliState);
  if (updateAllBtnEl) {
    updateAllBtnEl.disabled = cliState.phase === 'running';
    updateAllBtnEl.textContent = cliState.phase === 'running' ? t('Updating...') : t('Update all');
  }
  const { total, completed, progressPercent, progressLabel } = getCliUpdateProgress(cliState);
  progressLabelEl.textContent = t(`Progress: ${progressLabel} (${progressPercent}%)`);
  renderCliUpdatePanelTimestamp(timestampEl, cliState);
  renderCliUpdatePanelStatusAndMeta(statusEl, metaEl, cliState, total, completed);

  progressFillEl.style.width = `${Math.max(progressPercent, cliState.phase === 'running' ? 8 : 0)}%`;
  progressFillEl.classList.toggle('is-running', cliState.phase === 'running');
  renderCliUpdatePanelList(listEl, cliState, onRunProviderUpdate, onRunProviderInstall);
}

export function createTabBarCliUpdatePanel(
  options: CreateTabBarCliUpdatePanelOptions,
): TabBarCliUpdatePanelController {
  const {
    tabActionsEl,
    updateButtonEl,
    onCancelUpdate,
    onRunProviderUpdate,
    onRunProviderInstall,
    onRunAllUpdates,
  } = options;
  let cliUpdatePanelEl: HTMLElement | null = null;
  let cliUpdatePanelVisible = false;
  let cliUpdatePanelStatusEl: HTMLElement | null = null;
  let cliUpdatePanelMetaEl: HTMLElement | null = null;
  let cliUpdatePanelProgressFillEl: HTMLElement | null = null;
  let cliUpdatePanelProgressLabelEl: HTMLElement | null = null;
  let cliUpdatePanelTimestampEl: HTMLElement | null = null;
  let cliUpdatePanelListEl: HTMLElement | null = null;
  let cliUpdatePanelUpdateAllBtnEl: HTMLButtonElement | null = null;
  let cliUpdatePanelCancelBtnEl: HTMLButtonElement | null = null;

  function setup(): void {
    if (cliUpdatePanelEl) return;
    const panel = document.createElement('section');
    panel.id = 'cli-update-panel';
    panel.className = 'cli-update-panel hidden';
    panel.innerHTML = `
    <div class="cli-update-panel-header">
      <div class="cli-update-panel-title">${t('CLI Update Center')}</div>
      <div class="cli-update-panel-header-actions">
        <button type="button" class="cli-update-panel-update-all" aria-label="${t('Update all CLI tools')}">${t('Update all')}</button>
        <button type="button" class="cli-update-panel-cancel hidden" aria-label="${t('Cancel CLI update')}">${t('Cancel')}</button>
        <button type="button" class="cli-update-panel-close" aria-label="${t('Close update panel')}">&times;</button>
      </div>
    </div>
    <div class="cli-update-panel-actions">${t('Install missing tools or update installed CLIs.')}</div>
    <div class="cli-update-panel-status">${t('No update run yet.')}</div>
    <div class="cli-update-panel-progress-track">
      <div class="cli-update-panel-progress-fill" style="width: 0%"></div>
    </div>
    <div class="cli-update-panel-stats">
      <span class="cli-update-panel-progress-label">${t('Progress: 0/0 (0%)')}</span>
      <span class="cli-update-panel-timestamp">${t('Last run: No updates yet')}</span>
    </div>
    <div class="cli-update-panel-meta">${t('Install or update individual CLIs below.')}</div>
    <div class="cli-update-panel-list"></div>
  `;
    panel.addEventListener('click', (event) => event.stopPropagation());

    const closeBtn = panel.querySelector('.cli-update-panel-close') as HTMLButtonElement | null;
    const updateAllBtn = panel.querySelector(
      '.cli-update-panel-update-all',
    ) as HTMLButtonElement | null;
    const cancelBtn = panel.querySelector('.cli-update-panel-cancel') as HTMLButtonElement | null;
    closeBtn?.addEventListener('click', () => toggle(false));
    updateAllBtn?.addEventListener('click', () => {
      if (updateAllBtn.disabled) return;
      void onRunAllUpdates().catch((error) => {
        console.error('[tab-bar] Failed to update CLI tools', error);
      });
    });
    cancelBtn?.addEventListener('click', () => {
      if (cancelBtn.disabled) return;
      void onCancelUpdate().catch((error) => {
        console.error('[tab-bar] Failed to cancel CLI update', error);
      });
    });

    cliUpdatePanelStatusEl = panel.querySelector('.cli-update-panel-status');
    cliUpdatePanelMetaEl = panel.querySelector('.cli-update-panel-meta');
    cliUpdatePanelProgressFillEl = panel.querySelector('.cli-update-panel-progress-fill');
    cliUpdatePanelProgressLabelEl = panel.querySelector('.cli-update-panel-progress-label');
    cliUpdatePanelTimestampEl = panel.querySelector('.cli-update-panel-timestamp');
    cliUpdatePanelListEl = panel.querySelector('.cli-update-panel-list');
    cliUpdatePanelUpdateAllBtnEl = updateAllBtn;
    cliUpdatePanelCancelBtnEl = cancelBtn;
    if (cliUpdatePanelStatusEl) {
      cliUpdatePanelStatusEl.setAttribute('role', 'status');
      cliUpdatePanelStatusEl.setAttribute('aria-live', 'polite');
    }
    if (cliUpdatePanelMetaEl) cliUpdatePanelMetaEl.setAttribute('aria-live', 'polite');
    panel.setAttribute('aria-busy', 'false');

    tabActionsEl.appendChild(panel);
    cliUpdatePanelEl = panel;
  }

  function toggle(visible: boolean): void {
    if (!cliUpdatePanelEl) return;
    cliUpdatePanelVisible = visible;
    cliUpdatePanelEl.classList.toggle('hidden', !visible);
    updateButtonEl.setAttribute('aria-expanded', visible ? 'true' : 'false');
    if (visible) {
      void reloadCliProviderCatalog().catch((error) => {
        console.warn('[tab-bar] Failed to refresh CLI provider catalog', error);
      });
    }
  }

  function renderButton(cliState: CliUpdateCenterState): void {
    renderCliUpdateButton(updateButtonEl, cliState);
  }

  function renderPanel(cliState: CliUpdateCenterState): void {
    if (
      !cliUpdatePanelStatusEl ||
      !cliUpdatePanelMetaEl ||
      !cliUpdatePanelProgressFillEl ||
      !cliUpdatePanelListEl ||
      !cliUpdatePanelProgressLabelEl ||
      !cliUpdatePanelTimestampEl
    )
      return;
    if (cliUpdatePanelEl)
      cliUpdatePanelEl.setAttribute('aria-busy', cliState.phase === 'running' ? 'true' : 'false');
    renderCliUpdatePanelContent(
      {
        statusEl: cliUpdatePanelStatusEl,
        metaEl: cliUpdatePanelMetaEl,
        progressFillEl: cliUpdatePanelProgressFillEl,
        progressLabelEl: cliUpdatePanelProgressLabelEl,
        timestampEl: cliUpdatePanelTimestampEl,
        listEl: cliUpdatePanelListEl,
        updateAllBtnEl: cliUpdatePanelUpdateAllBtnEl,
        cancelBtnEl: cliUpdatePanelCancelBtnEl,
      },
      cliState,
      onRunProviderUpdate,
      onRunProviderInstall,
    );
  }

  return {
    setup,
    toggle,
    isVisible: () => cliUpdatePanelVisible,
    containsTarget: (target: Node) => Boolean(cliUpdatePanelEl?.contains(target)),
    renderButton,
    renderPanel,
  };
}
