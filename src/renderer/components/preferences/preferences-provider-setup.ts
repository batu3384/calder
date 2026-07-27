import type { CliProviderMeta } from '../../../shared/types/provider.js';

interface ProviderStatus {
  meta: CliProviderMeta;
  binary: { ok: boolean; message: string };
}

interface RenderCheckItemOptions {
  label: string;
  description: string;
  ok: boolean;
  statusText: string;
  helpText?: string;
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

async function fetchProviderStatuses(): Promise<ProviderStatus[]> {
  const providers = await window.calder.provider.listProviders();
  return Promise.all(
    providers.map((meta) =>
      window.calder.provider.checkBinary(meta.id).then((binary) => ({ meta, binary })),
    ),
  );
}

function hasProviderIssue({ binary }: ProviderStatus): boolean {
  return !binary.ok;
}

export async function resolveSetupBadgeHasIssue(): Promise<boolean> {
  const providerResults = await fetchProviderStatuses();
  return providerResults.some(hasProviderIssue);
}

export interface RenderSetupSectionArgs {
  container: HTMLElement;
  isProvidersSectionActive: () => boolean;
  onApplySetupBadge: (hasIssue: boolean) => void;
}

export async function renderSetupSection(args: RenderSetupSectionArgs): Promise<void> {
  const section = document.createElement('div');
  section.className = 'setup-section';

  const loading = document.createElement('div');
  loading.className = 'setup-loading';
  loading.textContent = 'Checking configuration\u2026';
  section.appendChild(loading);
  args.container.appendChild(section);

  const results = await fetchProviderStatuses();

  if (!args.isProvidersSectionActive()) return;

  args.onApplySetupBadge(results.some(hasProviderIssue));

  section.innerHTML = '';

  for (const { meta, binary } of results) {
    const providerShell = document.createElement('div');
    providerShell.className = 'setup-provider-shell';
    section.appendChild(providerShell);

    renderProviderHeader(providerShell, meta.displayName, hasProviderIssue({ meta, binary }));

    renderCheckItem(providerShell, {
      label: meta.displayName,
      description: `The ${meta.binaryName} binary must be installed for sessions to work.`,
      ok: binary.ok,
      statusText: binary.ok ? 'Installed' : 'Not found',
      helpText: binary.ok ? undefined : binary.message,
    });
  }
}
