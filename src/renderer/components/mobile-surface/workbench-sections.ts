import type {
  MobileDependencyCheck,
  MobileDependencyId,
  MobileInspectPlatform,
} from '../../../shared/types/mobile.js';
import {
  applyInstallProgressEvent,
  createInstallId,
  isInstallRunning,
  pushInstallLog,
  renderInstallProgress,
  type MobileSurfaceInstallState,
} from './install-progress.js';
import {
  getMobileInspectCapabilities,
  getStatusLabel,
  isInstallable,
} from './dependency-scoping.js';

type StatusTone = 'default' | 'success' | 'error';

export interface MobileSurfaceInstallHost {
  projectId: string;
  installState: MobileSurfaceInstallState | null;
  installProgressCleanup?: () => void;
  progressEl: HTMLDivElement;
}

interface BuildMobileDependencyCheckRowOptions {
  instance: MobileSurfaceInstallHost;
  check: MobileDependencyCheck;
  isInspectBusy(instance: MobileSurfaceInstallHost): boolean;
  setPaneStatus(instance: MobileSurfaceInstallHost, text: string, tone?: StatusTone): void;
  setActionAvailability(instance: MobileSurfaceInstallHost): void;
  refreshMobileSurfacePane(projectId: string, force?: boolean): Promise<void>;
}

interface AppendMobileDependencyGroupOptions {
  container: HTMLElement;
  title: string;
  checks: MobileDependencyCheck[];
  renderCheckRow(check: MobileDependencyCheck): HTMLElement;
  options?: {
    collapsible?: boolean;
    open?: boolean;
    description?: string;
  };
}

interface RenderMobileScopedSummaryPanelOptions {
  scopeLabel: string;
  summary: {
    ready: number;
    warnings: number;
    requiredMissing: number;
  };
}

interface AppendMobileDependencyChecklistSectionOptions {
  container: HTMLElement;
  checks: MobileDependencyCheck[];
  renderCheckRow(check: MobileDependencyCheck): HTMLElement;
}

export function renderInspectCapabilityPanel(
  platform: MobileInspectPlatform,
  platformLabels: Record<MobileInspectPlatform, string>,
): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'mobile-surface-inspect-capabilities';

  const title = document.createElement('div');
  title.className = 'mobile-surface-inspect-capabilities-title';
  title.textContent = `${platformLabels[platform]} capabilities`;

  const list = document.createElement('div');
  list.className = 'mobile-surface-inspect-capabilities-list';

  for (const capability of getMobileInspectCapabilities(platform)) {
    const row = document.createElement('div');
    row.className = `mobile-surface-inspect-capability is-${capability.tone}`;

    const main = document.createElement('div');
    main.className = 'mobile-surface-inspect-capability-main';

    const label = document.createElement('span');
    label.className = 'mobile-surface-inspect-capability-label';
    label.textContent = capability.label;

    const detail = document.createElement('span');
    detail.className = 'mobile-surface-inspect-capability-detail';
    detail.textContent = capability.detail;

    const status = document.createElement('span');
    status.className = 'mobile-surface-inspect-capability-status';
    status.textContent = capability.status;

    main.append(label, detail);
    row.append(main, status);
    list.appendChild(row);
  }

  panel.append(title, list);
  return panel;
}

export function buildMobileDependencyCheckRow(options: BuildMobileDependencyCheckRowOptions): HTMLDivElement {
  const {
    instance,
    check,
    isInspectBusy,
    setPaneStatus,
    setActionAvailability,
    refreshMobileSurfacePane,
  } = options;
  const row = document.createElement('div');
  row.className = 'mobile-surface-check-row';

  const left = document.createElement('div');
  left.className = 'mobile-surface-check-main';

  const title = document.createElement('div');
  title.className = 'mobile-surface-check-title';
  title.textContent = check.label;

  const desc = document.createElement('div');
  desc.className = 'mobile-surface-check-desc';
  desc.textContent = check.description;

  left.appendChild(title);
  left.appendChild(desc);

  if (check.message || check.installHint) {
    const detail = document.createElement('div');
    detail.className = 'mobile-surface-check-detail';
    detail.textContent = [check.message, check.installHint].filter(Boolean).join(' ');
    left.appendChild(detail);
  }

  const right = document.createElement('div');
  right.className = 'mobile-surface-check-side';

  const status = document.createElement('span');
  status.className = `mobile-surface-check-status is-${check.status}`;
  status.textContent = getStatusLabel(check);
  right.appendChild(status);

  if (isInstallable(check)) {
    const installBtn = document.createElement('button');
    installBtn.type = 'button';
    installBtn.className = 'mobile-surface-install-btn';
    const runningState = instance.installState;
    const isActive = runningState?.phase === 'running' && runningState.dependencyId === check.id;
    installBtn.textContent = isActive ? 'Installing…' : 'Install';
    installBtn.disabled = isInstallRunning(instance.installState) || isInspectBusy(instance);
    installBtn.addEventListener('click', async () => {
      if (isInstallRunning(instance.installState) || isInspectBusy(instance)) return;
      const api = window.calder?.mobileSetup;
      if (!api) {
        setPaneStatus(instance, 'Mobile setup API is unavailable in this build.', 'error');
        return;
      }

      const installId = createInstallId(instance.projectId, check.id);
      instance.installProgressCleanup?.();
      instance.installState = {
        installId,
        dependencyId: check.id,
        dependencyLabel: check.label,
        phase: 'running',
        startedAt: new Date().toISOString(),
        percent: 0,
        stepPercent: 0,
        logs: [],
      };
      renderInstallProgress(instance.progressEl, instance.installState);
      setActionAvailability(instance);
      setPaneStatus(instance, `${check.label} installation started…`);

      instance.installProgressCleanup = api.onInstallProgress((event) => {
        if (event.installId !== installId) return;
        if (!applyInstallProgressEvent(instance.installState, event)) return;
        renderInstallProgress(instance.progressEl, instance.installState);
        setActionAvailability(instance);
      });

      try {
        const result = await api.installDependency(check.id as MobileDependencyId, installId);
        const installState = instance.installState;
        if (!result.success) {
          if (installState && installState.installId === installId) {
            installState.phase = 'failed';
            installState.finishedAt = new Date().toISOString();
            installState.message = result.message || 'Install command failed.';
            installState.detail = result.stderr || result.stdout || result.message;
            if (result.command) installState.command = result.command;
            if (result.stderr) pushInstallLog(installState, result.stderr);
            if (result.stdout) pushInstallLog(installState, result.stdout);
            installState.percent = Math.min(99, installState.percent);
            renderInstallProgress(instance.progressEl, instance.installState);
          }
          setPaneStatus(instance, result.message || 'Install command failed.', 'error');
        } else {
          if (installState && installState.installId === installId) {
            installState.phase = 'success';
            installState.finishedAt = new Date().toISOString();
            installState.percent = 100;
            installState.message = result.message || `${check.label} installed successfully.`;
            if (result.command) installState.command = result.command;
            renderInstallProgress(instance.progressEl, instance.installState);
          }
          setPaneStatus(instance, result.message || `${check.label} installed successfully.`, 'success');
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Install command failed.';
        const installState = instance.installState;
        if (installState && installState.installId === installId) {
          installState.phase = 'failed';
          installState.finishedAt = new Date().toISOString();
          installState.message = message;
          installState.detail = message;
          pushInstallLog(installState, message);
          installState.percent = Math.min(99, installState.percent);
          renderInstallProgress(instance.progressEl, instance.installState);
        }
        setPaneStatus(instance, message, 'error');
      } finally {
        instance.installProgressCleanup?.();
        instance.installProgressCleanup = undefined;
        setActionAvailability(instance);
        await refreshMobileSurfacePane(instance.projectId, true);
      }
    });
    right.appendChild(installBtn);
  }

  row.appendChild(left);
  row.appendChild(right);
  return row;
}

export function appendMobileDependencyGroup(params: AppendMobileDependencyGroupOptions): void {
  const { container, title, checks, renderCheckRow, options } = params;
  if (checks.length === 0) return;

  const section = options?.collapsible
    ? document.createElement('details')
    : document.createElement('section');
  section.className = 'mobile-surface-group';

  if (options?.collapsible) {
    section.classList.add('mobile-surface-group-collapsible');
    (section as HTMLDetailsElement).open = Boolean(options.open);
    const summary = document.createElement('summary');
    summary.className = 'mobile-surface-group-summary';
    summary.textContent = title;
    section.appendChild(summary);
    if (options.description) {
      const desc = document.createElement('div');
      desc.className = 'mobile-surface-group-summary-desc';
      desc.textContent = options.description;
      section.appendChild(desc);
    }
  } else {
    const heading = document.createElement('h3');
    heading.className = 'mobile-surface-group-title';
    heading.textContent = title;
    section.appendChild(heading);
  }

  for (const check of checks) {
    section.appendChild(renderCheckRow(check));
  }

  container.appendChild(section);
}

export function renderMobileScopedSummaryPanel(
  options: RenderMobileScopedSummaryPanelOptions,
): HTMLDivElement {
  const summary = document.createElement('div');
  summary.className = 'mobile-surface-summary';
  summary.innerHTML = `
    <span class="mobile-surface-summary-pill">Scope: ${options.scopeLabel}</span>
    <span class="mobile-surface-summary-pill">Ready: ${options.summary.ready}</span>
    <span class="mobile-surface-summary-pill">Warnings: ${options.summary.warnings}</span>
    <span class="mobile-surface-summary-pill">Required missing: ${options.summary.requiredMissing}</span>
  `;
  return summary;
}

export function appendMobileDependencyChecklistSection(
  options: AppendMobileDependencyChecklistSectionOptions,
): void {
  appendMobileDependencyGroup({
    container: options.container,
    title: 'Dependency checklist',
    checks: options.checks,
    renderCheckRow: options.renderCheckRow,
    options: {
      collapsible: true,
      open: false,
      description: 'Install and verify prerequisites relevant to the current project profile.',
    },
  });
}
