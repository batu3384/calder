import type {
  MobileDependencyCheck,
  MobileDependencyId,
  MobileDependencyInstallResult,
  MobileDependencyReport,
} from '../../../shared/types.js';

interface MobileSurfacePaneInstance {
  projectId: string;
  el: HTMLDivElement;
  statusEl: HTMLDivElement;
  summaryEl: HTMLDivElement;
  bodyEl: HTMLDivElement;
  refreshBtn: HTMLButtonElement;
  loadToken: number;
  loading: boolean;
}

const panes = new Map<string, MobileSurfacePaneInstance>();

function getStatusLabel(check: MobileDependencyCheck): string {
  if (check.status === 'ready') return 'Ready';
  if (check.status === 'warning') return 'Needs attention';
  if (check.status === 'unsupported') return 'Unsupported';
  return 'Not found';
}

function isInstallable(check: MobileDependencyCheck): boolean {
  return check.autoFixAvailable && check.status !== 'ready' && check.status !== 'unsupported';
}

function setPaneStatus(instance: MobileSurfacePaneInstance, text: string, tone: 'default' | 'success' | 'error' = 'default'): void {
  instance.statusEl.textContent = text;
  instance.statusEl.dataset.tone = tone;
}

function buildCheckRow(instance: MobileSurfacePaneInstance, check: MobileDependencyCheck): HTMLDivElement {
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
    installBtn.textContent = 'Install';
    installBtn.addEventListener('click', async () => {
      installBtn.disabled = true;
      installBtn.textContent = 'Installing…';
      try {
        const result = await window.calder.mobileSetup.installDependency(check.id as MobileDependencyId);
        if (!result.success) {
          throw new Error(result.message || 'Install command failed.');
        }
        setPaneStatus(instance, `${check.label} installed successfully.`, 'success');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Install command failed.';
        setPaneStatus(instance, message, 'error');
      } finally {
        await refreshMobileSurfacePane(instance.projectId, true);
      }
    });
    right.appendChild(installBtn);
  }

  row.appendChild(left);
  row.appendChild(right);
  return row;
}

function renderGroup(
  instance: MobileSurfacePaneInstance,
  title: string,
  checks: MobileDependencyCheck[],
): void {
  if (checks.length === 0) return;

  const section = document.createElement('section');
  section.className = 'mobile-surface-group';

  const heading = document.createElement('h3');
  heading.className = 'mobile-surface-group-title';
  heading.textContent = title;
  section.appendChild(heading);

  for (const check of checks) {
    section.appendChild(buildCheckRow(instance, check));
  }

  instance.bodyEl.appendChild(section);
}

function renderReport(instance: MobileSurfacePaneInstance, report: MobileDependencyReport): void {
  instance.summaryEl.innerHTML = '';
  instance.bodyEl.innerHTML = '';

  const summary = document.createElement('div');
  summary.className = 'mobile-surface-summary';
  summary.innerHTML = `
    <span class="mobile-surface-summary-pill">Ready: ${report.summary.ready}</span>
    <span class="mobile-surface-summary-pill">Warnings: ${report.summary.warnings}</span>
    <span class="mobile-surface-summary-pill">Required missing: ${report.summary.requiredMissing}</span>
  `;
  instance.summaryEl.appendChild(summary);

  const iosChecks = report.checks.filter((entry) => entry.requiredFor.includes('ios'));
  const androidChecks = report.checks.filter((entry) => entry.requiredFor.includes('android'));
  const optionalChecks = report.checks.filter((entry) => entry.requiredFor.length === 0);

  renderGroup(instance, 'iOS simulator inspect', iosChecks);
  renderGroup(instance, 'Android emulator inspect', androidChecks);
  renderGroup(instance, 'Optional tools', optionalChecks);
}

function ensureMobileSurfacePane(projectId: string): MobileSurfacePaneInstance {
  const existing = panes.get(projectId);
  if (existing) return existing;

  const el = document.createElement('div');
  el.className = 'mobile-surface-pane hidden';
  el.dataset.projectId = projectId;

  const header = document.createElement('header');
  header.className = 'mobile-surface-header';

  const titleWrap = document.createElement('div');
  titleWrap.className = 'mobile-surface-title-wrap';

  const title = document.createElement('h2');
  title.className = 'mobile-surface-title';
  title.textContent = 'Mobile Surface';

  const subtitle = document.createElement('p');
  subtitle.className = 'mobile-surface-subtitle';
  subtitle.textContent = 'iOS + Android simulator readiness and install actions.';

  titleWrap.appendChild(title);
  titleWrap.appendChild(subtitle);

  const actions = document.createElement('div');
  actions.className = 'mobile-surface-actions';

  const refreshBtn = document.createElement('button');
  refreshBtn.type = 'button';
  refreshBtn.className = 'mobile-surface-refresh-btn';
  refreshBtn.textContent = 'Refresh checks';
  actions.appendChild(refreshBtn);

  header.appendChild(titleWrap);
  header.appendChild(actions);

  const statusEl = document.createElement('div');
  statusEl.className = 'mobile-surface-status';
  statusEl.textContent = 'Checking mobile automation requirements…';

  const summaryEl = document.createElement('div');
  summaryEl.className = 'mobile-surface-summary-wrap';

  const bodyEl = document.createElement('div');
  bodyEl.className = 'mobile-surface-body';

  el.appendChild(header);
  el.appendChild(statusEl);
  el.appendChild(summaryEl);
  el.appendChild(bodyEl);

  const instance: MobileSurfacePaneInstance = {
    projectId,
    el,
    statusEl,
    summaryEl,
    bodyEl,
    refreshBtn,
    loadToken: 0,
    loading: false,
  };

  refreshBtn.addEventListener('click', () => {
    void refreshMobileSurfacePane(projectId, true);
  });

  panes.set(projectId, instance);
  return instance;
}

export async function refreshMobileSurfacePane(projectId: string, force = false): Promise<void> {
  const instance = ensureMobileSurfacePane(projectId);
  if (instance.loading && !force) return;
  const api = window.calder?.mobileSetup;
  if (!api) {
    setPaneStatus(instance, 'Mobile setup API is unavailable in this build.', 'error');
    return;
  }

  instance.loading = true;
  const token = ++instance.loadToken;
  instance.refreshBtn.disabled = true;
  setPaneStatus(instance, 'Checking mobile automation requirements…');

  try {
    const report = await api.checkDependencies();
    if (token !== instance.loadToken) return;
    renderReport(instance, report);
    if (report.summary.requiredMissing === 0 && report.summary.warnings === 0) {
      setPaneStatus(instance, 'Mobile surface is ready.', 'success');
    } else {
      setPaneStatus(instance, 'Mobile surface needs attention before inspect flows.', 'error');
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Mobile checks failed.';
    setPaneStatus(instance, message, 'error');
  } finally {
    if (token === instance.loadToken) {
      instance.loading = false;
      instance.refreshBtn.disabled = false;
    }
  }
}

export function attachMobileSurfacePane(projectId: string, container: HTMLElement): void {
  const instance = ensureMobileSurfacePane(projectId);
  if (instance.el.parentElement !== container) {
    container.appendChild(instance.el);
  }
}

export function hideAllMobileSurfacePanes(): void {
  for (const instance of panes.values()) {
    instance.el.classList.add('hidden');
    instance.el.classList.remove('split');
  }
}

export function showMobileSurfacePane(projectId: string): void {
  const instance = ensureMobileSurfacePane(projectId);
  hideAllMobileSurfacePanes();
  instance.el.classList.remove('hidden');
  instance.el.classList.add('split');
  void refreshMobileSurfacePane(projectId);
}

