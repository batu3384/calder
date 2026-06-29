import type {
  MobileDependencyId,
  MobileDependencyInstallProgressEvent,
} from '../../../shared/types/mobile.js';

const MAX_INSTALL_LOG_LINES = 8;

export interface MobileSurfaceInstallState {
  installId: string;
  dependencyId: MobileDependencyId;
  dependencyLabel: string;
  phase: 'running' | 'success' | 'failed';
  startedAt: string;
  finishedAt?: string;
  percent: number;
  stepIndex?: number;
  totalSteps?: number;
  stepPercent?: number;
  downloadedBytes?: number;
  totalBytes?: number;
  remainingBytes?: number;
  command?: string;
  message?: string;
  detail?: string;
  logs: string[];
}

export function createInstallId(projectId: string, dependencyId: MobileDependencyId): string {
  return `mobile-surface-${projectId}-${dependencyId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function formatPercent(value: number): string {
  return `${Math.round(clampPercent(value))}%`;
}

function formatMegabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function isInstallRunning(state: MobileSurfaceInstallState | null | undefined): boolean {
  return state?.phase === 'running';
}

export function pushInstallLog(state: MobileSurfaceInstallState, line: string): void {
  const trimmed = line.trim();
  if (!trimmed) return;
  if (state.logs[state.logs.length - 1] === trimmed) return;
  state.logs.push(trimmed);
  while (state.logs.length > MAX_INSTALL_LOG_LINES) {
    state.logs.shift();
  }
}

export function renderInstallProgress(
  progressEl: HTMLDivElement,
  state: MobileSurfaceInstallState | null,
): void {
  progressEl.innerHTML = '';
  if (!state) {
    progressEl.classList.add('hidden');
    return;
  }
  progressEl.classList.remove('hidden');

  const panel = document.createElement('section');
  panel.className = `mobile-surface-install-panel phase-${state.phase}`;

  const header = document.createElement('div');
  header.className = 'mobile-surface-install-header';

  const titleWrap = document.createElement('div');
  titleWrap.className = 'mobile-surface-install-title-wrap';
  const title = document.createElement('div');
  title.className = 'mobile-surface-install-title';
  title.textContent = `${state.dependencyLabel} · Install progress`;
  const subtitle = document.createElement('div');
  subtitle.className = 'mobile-surface-install-subtitle';
  subtitle.textContent =
    state.phase === 'running'
      ? 'Installing dependency and collecting diagnostics…'
      : state.phase === 'success'
        ? 'Install completed.'
        : 'Install failed.';
  titleWrap.append(title, subtitle);

  const phasePill = document.createElement('span');
  phasePill.className = `mobile-surface-install-phase is-${state.phase}`;
  phasePill.textContent =
    state.phase === 'running' ? 'RUNNING' : state.phase === 'success' ? 'DONE' : 'FAILED';

  header.append(titleWrap, phasePill);
  panel.appendChild(header);

  const barWrap = document.createElement('div');
  barWrap.className = 'mobile-surface-install-bar';
  const barFill = document.createElement('span');
  barFill.className = 'mobile-surface-install-bar-fill';
  barFill.style.width = `${clampPercent(state.percent)}%`;
  barWrap.appendChild(barFill);
  panel.appendChild(barWrap);

  const metrics = document.createElement('div');
  metrics.className = 'mobile-surface-install-metrics';

  const progressPill = document.createElement('span');
  progressPill.className = 'mobile-surface-install-metric';
  progressPill.textContent = `Progress: ${formatPercent(state.percent)}`;
  metrics.appendChild(progressPill);

  if (typeof state.stepIndex === 'number' && typeof state.totalSteps === 'number') {
    const stepPill = document.createElement('span');
    stepPill.className = 'mobile-surface-install-metric';
    stepPill.textContent = `Step: ${state.stepIndex}/${state.totalSteps}`;
    metrics.appendChild(stepPill);
  }

  if (typeof state.downloadedBytes === 'number') {
    const downloaded = document.createElement('span');
    downloaded.className = 'mobile-surface-install-metric';
    downloaded.textContent = `Downloaded: ${formatMegabytes(state.downloadedBytes)}`;
    metrics.appendChild(downloaded);
  }

  if (typeof state.remainingBytes === 'number') {
    const remaining = document.createElement('span');
    remaining.className = 'mobile-surface-install-metric';
    remaining.textContent = `Remaining: ${formatMegabytes(state.remainingBytes)}`;
    metrics.appendChild(remaining);
  }

  if (typeof state.stepPercent === 'number') {
    const stepPercent = document.createElement('span');
    stepPercent.className = 'mobile-surface-install-metric';
    stepPercent.textContent = `Step progress: ${formatPercent(state.stepPercent)}`;
    metrics.appendChild(stepPercent);
  }

  panel.appendChild(metrics);

  if (state.command) {
    const command = document.createElement('div');
    command.className = 'mobile-surface-install-command';
    command.textContent = `Command: ${state.command}`;
    panel.appendChild(command);
  }

  if (state.message) {
    const message = document.createElement('div');
    message.className = 'mobile-surface-install-message';
    message.textContent = state.message;
    panel.appendChild(message);
  }

  if (state.detail && state.detail.trim().length > 0) {
    const detail = document.createElement('div');
    detail.className = 'mobile-surface-install-detail';
    detail.textContent = state.detail;
    panel.appendChild(detail);
  }

  if (state.logs.length > 0) {
    const logList = document.createElement('ul');
    logList.className = 'mobile-surface-install-log-list';
    for (const logLine of state.logs) {
      const item = document.createElement('li');
      item.className = 'mobile-surface-install-log-item';
      item.textContent = logLine;
      logList.appendChild(item);
    }
    panel.appendChild(logList);
  }

  progressEl.appendChild(panel);
}

export function applyInstallProgressEvent(
  state: MobileSurfaceInstallState | null,
  event: MobileDependencyInstallProgressEvent,
): boolean {
  if (!state || state.installId !== event.installId) return false;

  if (typeof event.percent === 'number') state.percent = clampPercent(event.percent);
  if (typeof event.stepIndex === 'number') state.stepIndex = event.stepIndex;
  if (typeof event.totalSteps === 'number') state.totalSteps = event.totalSteps;
  if (typeof event.stepPercent === 'number') state.stepPercent = clampPercent(event.stepPercent);
  if (typeof event.downloadedBytes === 'number')
    state.downloadedBytes = Math.max(0, event.downloadedBytes);
  if (typeof event.totalBytes === 'number') state.totalBytes = Math.max(0, event.totalBytes);
  if (typeof event.remainingBytes === 'number')
    state.remainingBytes = Math.max(0, event.remainingBytes);
  if (event.command) state.command = event.command;
  if (event.message) state.message = event.message;
  if (event.detail) {
    state.detail = event.detail;
    pushInstallLog(state, event.detail);
  }

  if (event.phase === 'finished') {
    state.phase = 'success';
    state.percent = 100;
    state.finishedAt = event.finishedAt || new Date().toISOString();
  } else if (event.phase === 'failed') {
    state.phase = 'failed';
    state.finishedAt = event.finishedAt || new Date().toISOString();
  } else if (
    event.phase === 'started' ||
    event.phase === 'step_started' ||
    event.phase === 'step_progress' ||
    event.phase === 'step_finished'
  ) {
    state.phase = 'running';
  }

  return true;
}
