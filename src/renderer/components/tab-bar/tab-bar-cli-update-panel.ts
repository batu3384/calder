import type { ProviderId } from '../../../shared/types/provider.js';
import { t } from '../../i18n.js';
import { applyTabularNums } from '../surface-services/dom-utils.js';
import type { CliUpdateCenterState } from '../surface-services/update-center.js';
import { reloadCliProviderCatalog } from '../surface-services/update-center.js';
import { showErrorToast } from '../toast.js';
import {
  renderCliUpdateButton,
  renderCliUpdatePanelContent,
} from './tab-bar-cli-update-panel-render.js';

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
      void onRunAllUpdates().catch(() => {
        showErrorToast(t('CLI update failed.'));
      });
    });
    cancelBtn?.addEventListener('click', () => {
      if (cancelBtn.disabled) return;
      void onCancelUpdate().catch(() => {
        showErrorToast(t('CLI update failed.'));
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
    if (cliUpdatePanelProgressLabelEl) {
      applyTabularNums(cliUpdatePanelProgressLabelEl);
    }
    if (cliUpdatePanelTimestampEl) {
      applyTabularNums(cliUpdatePanelTimestampEl);
    }
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
