import { isTrackingHealthy } from '../../../shared/tracking-health.js';
import type {
  MobileDependencyCheck,
  MobileDependencyId,
  MobileDependencyReport,
} from '../../../shared/types/mobile.js';
import type {
  CliProviderMeta,
  ProviderId,
  SettingsValidationResult,
} from '../../../shared/types/provider.js';
interface ProviderStatus {
  meta: CliProviderMeta;
  validation: SettingsValidationResult;
  binary: { ok: boolean; message: string };
}

interface RenderCheckItemOptions {
  label: string;
  description: string;
  ok: boolean;
  statusText: string;
  helpText?: string;
  onFix?: () => Promise<void>;
  actionLabel?: string;
}

function renderCheckItem(parent: HTMLElement, opts: RenderCheckItemOptions): void {
  const row = document.createElement('div');
  row.className = 'setup-check-row';

  const icon = document.createElement('span');
  icon.className = opts.ok ? 'setup-check-icon ok' : 'setup-check-icon error';
  icon.textContent = opts.ok ? '\u2713' : '\u2717';

  const info = document.createElement('div');
  info.className = 'setup-check-info';

  const title = document.createElement('div');
  title.className = 'setup-check-label';
  title.textContent = opts.label;

  const desc = document.createElement('div');
  desc.className = 'setup-check-desc';
  desc.textContent = opts.description;

  info.appendChild(title);
  info.appendChild(desc);

  if (!opts.ok && opts.helpText) {
    const help = document.createElement('div');
    help.className = 'setup-check-help';
    help.textContent = opts.helpText;
    info.appendChild(help);
  }

  const status = document.createElement('div');
  status.className = opts.ok
    ? 'setup-check-status setup-check-status-pill ok'
    : 'setup-check-status setup-check-status-pill error';
  status.textContent = opts.statusText;

  row.appendChild(icon);
  row.appendChild(info);
  row.appendChild(status);

  const { onFix } = opts;
  if (onFix) {
    const btn = document.createElement('button');
    btn.className = 'setup-fix-btn';
    btn.textContent = opts.actionLabel ?? 'Fix';
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = opts.actionLabel ? 'Installing\u2026' : 'Fixing\u2026';
      try {
        await onFix();
      } catch {
        btn.disabled = false;
        btn.textContent = opts.actionLabel ?? 'Fix';
      }
    });
    row.appendChild(btn);
  }

  parent.appendChild(row);
}

function renderProviderHeader(parent: HTMLElement, displayName: string, hasIssue: boolean): void {
  const header = document.createElement('div');
  header.className = 'setup-provider-header';

  const row = document.createElement('div');
  row.className = 'setup-provider-header-row';

  const name = document.createElement('div');
  name.className = 'setup-provider-name';
  name.textContent = displayName;

  const status = document.createElement('div');
  status.className = hasIssue ? 'setup-provider-status error' : 'setup-provider-status ok';
  status.textContent = hasIssue ? 'Needs attention' : 'Ready';

  row.appendChild(name);
  row.appendChild(status);
  header.appendChild(row);
  parent.appendChild(header);
}

function hasMobileRequiredIssue(report: MobileDependencyReport): boolean {
  return report.checks.some(
    (check) => check.required && (check.status === 'missing' || check.status === 'warning'),
  );
}

function getMobileStatusText(check: MobileDependencyCheck): string {
  if (check.status === 'ready') return 'Ready';
  if (check.status === 'warning') return 'Needs attention';
  if (check.status === 'unsupported') return 'Unsupported';
  return 'Not found';
}

function getMobileHelpText(check: MobileDependencyCheck): string {
  const segments: string[] = [];
  if (check.message) segments.push(check.message);
  if (check.installHint) segments.push(check.installHint);
  if (check.installCommand) segments.push(`Command: ${check.installCommand}`);
  return segments.join(' ');
}

async function fetchProviderStatuses(): Promise<ProviderStatus[]> {
  const providers = await window.calder.provider.listProviders();
  return Promise.all(
    providers.map((meta) =>
      Promise.all([
        window.calder.settings.validate(meta.id),
        window.calder.provider.checkBinary(meta.id),
      ]).then(([validation, binary]) => ({ meta, validation, binary })),
    ),
  );
}

function hasProviderIssue({ meta, validation, binary }: ProviderStatus): boolean {
  if (!binary.ok) return true;
  return !isTrackingHealthy(meta, validation);
}

export async function resolveSetupBadgeHasIssue(): Promise<boolean> {
  const [providerResults, mobileReport] = await Promise.all([
    fetchProviderStatuses(),
    window.calder.mobileSetup.checkDependencies(),
  ]);
  return providerResults.some(hasProviderIssue) || hasMobileRequiredIssue(mobileReport);
}

export interface RenderSetupSectionArgs {
  container: HTMLElement;
  isProvidersSectionActive: () => boolean;
  onApplySetupBadge: (hasIssue: boolean) => void;
  onFixProvider: (providerId?: ProviderId) => Promise<void>;
}

export async function renderSetupSection(args: RenderSetupSectionArgs): Promise<void> {
  const section = document.createElement('div');
  section.className = 'setup-section';

  const loading = document.createElement('div');
  loading.className = 'setup-loading';
  loading.textContent = 'Checking configuration\u2026';
  section.appendChild(loading);
  args.container.appendChild(section);

  const [results, mobileReport] = await Promise.all([
    fetchProviderStatuses(),
    window.calder.mobileSetup.checkDependencies(),
  ]);

  if (!args.isProvidersSectionActive()) return;

  args.onApplySetupBadge(results.some(hasProviderIssue) || hasMobileRequiredIssue(mobileReport));

  section.innerHTML = '';

  for (const { meta, validation, binary } of results) {
    const providerShell = document.createElement('div');
    providerShell.className = 'setup-provider-shell';
    section.appendChild(providerShell);

    renderProviderHeader(
      providerShell,
      meta.displayName,
      hasProviderIssue({ meta, validation, binary }),
    );

    renderCheckItem(providerShell, {
      label: meta.displayName,
      description: `The ${meta.binaryName} binary must be installed for sessions to work.`,
      ok: binary.ok,
      statusText: binary.ok ? 'Installed' : 'Not found',
      helpText: binary.ok ? undefined : binary.message,
    });

    if (!binary.ok) continue;

    const { capabilities } = meta;

    if (capabilities.costTracking || capabilities.contextWindow) {
      const slOk = validation.statusLine === 'calder';
      let slStatus = 'Configured';
      if (validation.statusLine === 'missing') slStatus = 'Not configured';
      else if (validation.statusLine === 'foreign') slStatus = 'Overwritten by another tool';

      renderCheckItem(providerShell, {
        label: 'Status Line',
        description: 'Required for cost tracking and context window monitoring.',
        ok: slOk,
        statusText: slStatus,
        onFix: slOk ? undefined : () => args.onFixProvider(meta.id),
      });
    }

    if (capabilities.hookStatus) {
      const hooksOk = validation.hooks === 'complete';
      let hooksStatus = 'All hooks installed';
      if (validation.hooks === 'missing') hooksStatus = 'No hooks installed';
      else if (validation.hooks === 'partial') hooksStatus = 'Some hooks missing';

      renderCheckItem(providerShell, {
        label: 'Session Hooks',
        description: 'Required for session activity tracking.',
        ok: hooksOk,
        statusText: hooksStatus,
        onFix: hooksOk ? undefined : () => args.onFixProvider(meta.id),
      });

      const hookList = document.createElement('div');
      hookList.className = 'setup-hook-details';
      for (const [event, installed] of Object.entries(validation.hookDetails)) {
        const item = document.createElement('div');
        item.className = 'setup-hook-item';
        const icon = document.createElement('span');
        icon.className = installed ? 'setup-check-icon ok' : 'setup-check-icon error';
        icon.textContent = installed ? '\u2713' : '\u2717';
        const name = document.createElement('span');
        name.className = 'setup-hook-name';
        name.textContent = event;
        item.appendChild(icon);
        item.appendChild(name);
        hookList.appendChild(item);
      }
      providerShell.appendChild(hookList);

      if (capabilities.costTracking && validation.statusLine !== 'calder' && !hooksOk) {
        const fixAllRow = document.createElement('div');
        fixAllRow.className = 'setup-fix-all-row';

        const fixAllBtn = document.createElement('button');
        fixAllBtn.className = 'setup-fix-btn';
        fixAllBtn.textContent = 'Fix All';
        fixAllBtn.addEventListener('click', async () => {
          fixAllBtn.disabled = true;
          fixAllBtn.textContent = 'Fixing\u2026';
          try {
            await args.onFixProvider(meta.id);
          } catch {
            fixAllBtn.disabled = false;
            fixAllBtn.textContent = 'Fix All';
          }
        });

        fixAllRow.appendChild(fixAllBtn);
        providerShell.appendChild(fixAllRow);
      }
    }
  }
}

export interface RenderMobileSetupSectionArgs {
  container: HTMLElement;
  isProvidersSectionActive: () => boolean;
  onInstallMobileDependency: (dependencyId: MobileDependencyId) => Promise<void>;
}

export async function renderMobileSetupSection(args: RenderMobileSetupSectionArgs): Promise<void> {
  const section = document.createElement('div');
  section.className = 'setup-section';

  const loading = document.createElement('div');
  loading.className = 'setup-loading';
  loading.textContent = 'Checking mobile automation requirements…';
  section.appendChild(loading);
  args.container.appendChild(section);

  const report = await window.calder.mobileSetup.checkDependencies();
  if (!args.isProvidersSectionActive()) return;

  section.innerHTML = '';

  const summary = document.createElement('div');
  summary.className = 'setup-provider-shell';
  summary.innerHTML = `
      <div class="setup-provider-header">
        <div class="setup-provider-header-row">
          <div class="setup-provider-name">Mobile Dependency Doctor</div>
          <div class="${hasMobileRequiredIssue(report) ? 'setup-provider-status error' : 'setup-provider-status ok'}">
            ${hasMobileRequiredIssue(report) ? 'Needs attention' : 'Ready'}
          </div>
        </div>
      </div>
      <div class="setup-check-desc">
        Ready: ${report.summary.ready} · Warnings: ${report.summary.warnings} · Required missing: ${report.summary.requiredMissing}
      </div>
    `;
  section.appendChild(summary);

  const groups: Array<{ title: string; checks: MobileDependencyCheck[] }> = [
    {
      title: 'iOS simulator inspect',
      checks: report.checks.filter((check) => check.requiredFor.includes('ios')),
    },
    {
      title: 'Android emulator inspect',
      checks: report.checks.filter((check) => check.requiredFor.includes('android')),
    },
    {
      title: 'Optional tools',
      checks: report.checks.filter((check) => check.requiredFor.length === 0),
    },
  ];

  for (const group of groups) {
    if (group.checks.length === 0) continue;
    const groupShell = document.createElement('div');
    groupShell.className = 'setup-provider-shell';
    section.appendChild(groupShell);

    renderProviderHeader(
      groupShell,
      group.title,
      group.checks.some((check) => check.status === 'missing' || check.status === 'warning'),
    );

    for (const check of group.checks) {
      const isReady = check.status === 'ready' || check.status === 'unsupported';
      renderCheckItem(groupShell, {
        label: check.label,
        description: check.description,
        ok: isReady,
        statusText: getMobileStatusText(check),
        helpText: isReady ? undefined : getMobileHelpText(check),
        onFix:
          check.autoFixAvailable && !isReady
            ? () => args.onInstallMobileDependency(check.id)
            : undefined,
        actionLabel: check.autoFixAvailable && !isReady ? 'Install' : undefined,
      });
    }
  }
}
