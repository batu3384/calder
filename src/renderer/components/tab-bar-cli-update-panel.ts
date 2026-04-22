import type { ProviderUpdateSummary } from '../../shared/types/provider.js';
import type { CliProviderProgressState, CliUpdateCenterState } from '../update-center.js';

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
  if (!timestamp) return 'No updates yet';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return 'No updates yet';
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 60_000) return 'just now';
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  return date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function getCliProviderStatusLabel(status: CliProviderProgressState['status']): string {
  if (status === 'up_to_date') return 'up to date';
  if (status === 'sync_pending') return 'sync pending';
  if (status === 'cancelled') return 'cancelled';
  return status.replace(/_/g, ' ');
}

export function createTabBarCliUpdatePanel(options: CreateTabBarCliUpdatePanelOptions): TabBarCliUpdatePanelController {
  const { tabActionsEl, updateButtonEl, onCancelUpdate } = options;
  let cliUpdatePanelEl: HTMLElement | null = null;
  let cliUpdatePanelVisible = false;
  let cliUpdatePanelStatusEl: HTMLElement | null = null;
  let cliUpdatePanelMetaEl: HTMLElement | null = null;
  let cliUpdatePanelProgressFillEl: HTMLElement | null = null;
  let cliUpdatePanelProgressLabelEl: HTMLElement | null = null;
  let cliUpdatePanelTimestampEl: HTMLElement | null = null;
  let cliUpdatePanelListEl: HTMLElement | null = null;
  let cliUpdatePanelCancelBtnEl: HTMLButtonElement | null = null;

  function setup(): void {
    if (cliUpdatePanelEl) return;
    const panel = document.createElement('section');
    panel.id = 'cli-update-panel';
    panel.className = 'cli-update-panel hidden';
    panel.innerHTML = `
    <div class="cli-update-panel-header">
      <div class="cli-update-panel-title">CLI Update Center</div>
      <div class="cli-update-panel-header-actions">
        <button type="button" class="cli-update-panel-cancel hidden" aria-label="Cancel CLI update">Cancel</button>
        <button type="button" class="cli-update-panel-close" aria-label="Close update panel">&times;</button>
      </div>
    </div>
    <div class="cli-update-panel-status">No update run yet.</div>
    <div class="cli-update-panel-progress-track">
      <div class="cli-update-panel-progress-fill" style="width: 0%"></div>
    </div>
    <div class="cli-update-panel-stats">
      <span class="cli-update-panel-progress-label">Progress: 0/0 (0%)</span>
      <span class="cli-update-panel-timestamp">Last run: No updates yet</span>
    </div>
    <div class="cli-update-panel-meta">Press the update button to start a provider refresh.</div>
    <div class="cli-update-panel-list"></div>
  `;
    panel.addEventListener('click', (event) => event.stopPropagation());

    const closeBtn = panel.querySelector('.cli-update-panel-close') as HTMLButtonElement | null;
    const cancelBtn = panel.querySelector('.cli-update-panel-cancel') as HTMLButtonElement | null;
    closeBtn?.addEventListener('click', () => toggle(false));
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
    cliUpdatePanelCancelBtnEl = cancelBtn;
    if (cliUpdatePanelStatusEl) {
      cliUpdatePanelStatusEl.setAttribute('role', 'status');
      cliUpdatePanelStatusEl.setAttribute('aria-live', 'polite');
    }
    if (cliUpdatePanelMetaEl) {
      cliUpdatePanelMetaEl.setAttribute('aria-live', 'polite');
    }
    panel.setAttribute('aria-busy', 'false');

    tabActionsEl.appendChild(panel);
    cliUpdatePanelEl = panel;
  }

  function toggle(visible: boolean): void {
    if (!cliUpdatePanelEl) return;
    cliUpdatePanelVisible = visible;
    cliUpdatePanelEl.classList.toggle('hidden', !visible);
    updateButtonEl.setAttribute('aria-expanded', visible ? 'true' : 'false');
  }

  function renderButton(cliState: CliUpdateCenterState): void {
    updateButtonEl.classList.remove('is-warning', 'is-success', 'is-cancelled', 'is-idle');

    if (cliState.phase === 'running') {
      updateButtonEl.classList.add('is-updating');
      updateButtonEl.disabled = false;
      updateButtonEl.textContent = CLI_UPDATE_BUTTON_GLYPHS.refresh;
      const progressLabel = cliState.totalProviders > 0
        ? `${cliState.completedProviders}/${cliState.totalProviders}`
        : 'running';
      updateButtonEl.title = `Updating CLI tools... (${progressLabel})`;
      updateButtonEl.setAttribute('aria-label', 'Updating CLI tools');
      return;
    }

    updateButtonEl.classList.remove('is-updating');
    updateButtonEl.disabled = false;

    if (cliState.phase === 'error') {
      updateButtonEl.classList.add('is-warning');
      updateButtonEl.textContent = CLI_UPDATE_BUTTON_GLYPHS.warning;
      updateButtonEl.title = 'CLI update failed.';
      updateButtonEl.setAttribute('aria-label', 'CLI update failed');
      return;
    }

    if (cliState.phase === 'cancelled') {
      updateButtonEl.classList.add('is-cancelled');
      updateButtonEl.textContent = CLI_UPDATE_BUTTON_GLYPHS.cancelled;
      updateButtonEl.title = 'CLI update cancelled.';
      updateButtonEl.setAttribute('aria-label', 'CLI update cancelled');
      return;
    }

    if (cliState.phase === 'completed' && cliState.lastSummary) {
      const counters = summarizeCliUpdateStatuses(cliState.lastSummary);
      if (counters.error > 0) {
        updateButtonEl.classList.add('is-warning');
        updateButtonEl.textContent = CLI_UPDATE_BUTTON_GLYPHS.warning;
        updateButtonEl.title = 'CLI update completed with errors';
        updateButtonEl.setAttribute('aria-label', 'CLI update completed with errors');
      } else if (counters.syncPending > 0) {
        updateButtonEl.classList.add('is-warning');
        updateButtonEl.textContent = CLI_UPDATE_BUTTON_GLYPHS.warning;
        updateButtonEl.title = 'CLI updates waiting for package sync';
        updateButtonEl.setAttribute('aria-label', 'CLI updates waiting for package sync');
      } else if (counters.updated > 0) {
        updateButtonEl.classList.add('is-success');
        updateButtonEl.textContent = CLI_UPDATE_BUTTON_GLYPHS.updated;
        updateButtonEl.title = 'CLI tools updated';
        updateButtonEl.setAttribute('aria-label', 'CLI tools updated');
      } else {
        updateButtonEl.classList.add('is-idle');
        updateButtonEl.textContent = CLI_UPDATE_BUTTON_GLYPHS.upToDate;
        updateButtonEl.title = 'CLI tools are already up to date.';
        updateButtonEl.setAttribute('aria-label', 'CLI tools are already up to date');
      }
      return;
    }

    updateButtonEl.classList.add('is-idle');
    updateButtonEl.textContent = CLI_UPDATE_BUTTON_GLYPHS.refresh;
    updateButtonEl.title = 'Update CLI Tools';
    updateButtonEl.setAttribute('aria-label', 'Update CLI tools');
  }

  function renderPanel(cliState: CliUpdateCenterState): void {
    if (
      !cliUpdatePanelStatusEl
      || !cliUpdatePanelMetaEl
      || !cliUpdatePanelProgressFillEl
      || !cliUpdatePanelListEl
      || !cliUpdatePanelProgressLabelEl
      || !cliUpdatePanelTimestampEl
    ) return;
    if (cliUpdatePanelEl) {
      cliUpdatePanelEl.setAttribute('aria-busy', cliState.phase === 'running' ? 'true' : 'false');
    }

    if (cliUpdatePanelCancelBtnEl) {
      const running = cliState.phase === 'running';
      cliUpdatePanelCancelBtnEl.classList.toggle('hidden', !running);
      cliUpdatePanelCancelBtnEl.disabled = !running || cliState.cancelRequested;
      cliUpdatePanelCancelBtnEl.textContent = cliState.cancelRequested ? 'Cancelling...' : 'Cancel';
    }

    const total = cliState.totalProviders > 0 ? cliState.totalProviders : Math.max(cliState.providers.length, 0);
    const completed = Math.min(cliState.completedProviders, total || cliState.completedProviders);
    const progressPercent = total > 0 ? Math.round((completed / total) * 100) : 0;
    const progressLabel = total > 0 ? `${completed}/${total}` : '0/0';
    cliUpdatePanelProgressLabelEl.textContent = `Progress: ${progressLabel} (${progressPercent}%)`;

    if (cliState.phase === 'running') {
      cliUpdatePanelTimestampEl.textContent = cliState.startedAt
        ? `Started: ${formatRelativeTimestamp(cliState.startedAt)}`
        : 'Started: just now';
    } else {
      const reference = cliState.finishedAt ?? cliState.startedAt;
      cliUpdatePanelTimestampEl.textContent = reference
        ? `Last run: ${formatRelativeTimestamp(reference)}`
        : 'Last run: No updates yet';
    }

    if (cliState.phase === 'running') {
      const activeProvider = cliState.providers.find((provider) => provider.providerId === cliState.activeProviderId);
      const activeLabel = cliState.cancelRequested
        ? 'Cancellation requested. Waiting for the active command to stop...'
        : activeProvider
          ? activeProvider.message
            ? `${activeProvider.providerName}: ${activeProvider.message}`
            : `${activeProvider.providerName} in progress.`
          : 'Waiting for provider progress...';
      cliUpdatePanelStatusEl.textContent = total > 0
        ? `${cliState.cancelRequested ? 'Cancelling CLI update' : 'Updating CLI tools'} (${completed}/${total})`
        : 'Updating CLI tools...';
      cliUpdatePanelMetaEl.textContent = activeLabel;
    } else if (cliState.phase === 'cancelled') {
      const processedLabel = total > 0
        ? `${completed}/${total} providers finished before cancellation.`
        : `${completed} provider${completed === 1 ? '' : 's'} finished before cancellation.`;
      cliUpdatePanelStatusEl.textContent = 'CLI update cancelled.';
      cliUpdatePanelMetaEl.textContent = `Cancelled ${formatRelativeTimestamp(cliState.finishedAt)}. ${processedLabel}`;
    } else if (cliState.phase === 'completed' && cliState.lastSummary) {
      const counters = summarizeCliUpdateStatuses(cliState.lastSummary);
      if (counters.error > 0) {
        cliUpdatePanelStatusEl.textContent = `Completed with ${counters.error} issue${counters.error === 1 ? '' : 's'}.`;
      } else if (counters.syncPending > 0) {
        cliUpdatePanelStatusEl.textContent = `${counters.syncPending} provider${counters.syncPending === 1 ? '' : 's'} waiting for package sync.`;
      } else if (counters.updated > 0) {
        cliUpdatePanelStatusEl.textContent = `${counters.updated} provider${counters.updated === 1 ? '' : 's'} updated.`;
      } else {
        cliUpdatePanelStatusEl.textContent = 'All providers are already up to date.';
      }
      const summaryParts = [
        `Updated ${counters.updated}`,
        `Up to date ${counters.upToDate}`,
        `Sync pending ${counters.syncPending}`,
        `Skipped ${counters.skipped}`,
        `Cancelled ${counters.cancelled}`,
      ];
      if (counters.error > 0) summaryParts.push(`Errors ${counters.error}`);
      cliUpdatePanelMetaEl.textContent = `Finished ${formatRelativeTimestamp(cliState.finishedAt)}. ${summaryParts.join(' · ')}`;
    } else if (cliState.phase === 'error') {
      cliUpdatePanelStatusEl.textContent = 'CLI update failed.';
      cliUpdatePanelMetaEl.textContent = cliState.errorMessage ?? 'An unknown error occurred.';
    } else {
      cliUpdatePanelStatusEl.textContent = 'No update run yet.';
      cliUpdatePanelMetaEl.textContent = 'Press the update button to start a provider refresh.';
    }

    cliUpdatePanelProgressFillEl.style.width = `${Math.max(progressPercent, cliState.phase === 'running' ? 8 : 0)}%`;
    cliUpdatePanelProgressFillEl.classList.toggle('is-running', cliState.phase === 'running');

    cliUpdatePanelListEl.innerHTML = '';
    const providers = cliState.providers;
    if (providers.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'cli-update-panel-empty';
      empty.textContent = 'Provider status will appear here as checks complete.';
      cliUpdatePanelListEl.appendChild(empty);
      return;
    }

    for (const provider of providers) {
      const row = document.createElement('div');
      row.className = 'cli-update-provider-row';
      row.classList.toggle('is-active', cliState.phase === 'running' && provider.providerId === cliState.activeProviderId);

      const top = document.createElement('div');
      top.className = 'cli-update-provider-head';

      const name = document.createElement('div');
      name.className = 'cli-update-provider-name';
      name.textContent = provider.providerName;

      const status = document.createElement('div');
      status.className = `cli-update-provider-status ${provider.status}`;
      status.textContent = getCliProviderStatusLabel(provider.status);

      top.appendChild(name);
      top.appendChild(status);

      const detail = document.createElement('div');
      detail.className = 'cli-update-provider-detail';
      const versionParts = [provider.beforeVersion, provider.afterVersion].filter(Boolean);
      if (provider.status === 'running' && provider.message) {
        detail.textContent = provider.message;
      } else if (provider.status === 'sync_pending' && provider.message) {
        detail.textContent = provider.message;
      } else if (versionParts.length === 2) {
        detail.textContent = `${versionParts[0]} → ${versionParts[1]}`;
      } else if (provider.latestVersion) {
        detail.textContent = `Latest: ${provider.latestVersion}`;
      } else if (provider.message) {
        detail.textContent = provider.message;
      } else {
        detail.textContent = provider.status === 'running' ? 'Running...' : 'Waiting...';
      }

      row.appendChild(top);
      row.appendChild(detail);
      cliUpdatePanelListEl.appendChild(row);
    }
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
