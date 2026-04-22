import type {
  CliSurfaceRuntimeState,
  CliSurfaceStartupTiming,
} from '../../../shared/types/project.js';
import { appState } from '../../state.js';
import { detectCliAdapter } from './adapters/registry.js';
import { getCliSurfaceProfileLabel } from './profile.js';
import type { CliTargetMenuController } from './target-menu.js';

interface CliSurfaceProfileLike {
  id?: string;
  name?: string;
  command?: string;
  args?: string[];
}

interface CliSurfaceMetaInstance {
  projectId: string;
  metaEl: HTMLDivElement;
  routeEl: HTMLDivElement;
  adapterMetaEl: HTMLDivElement;
  emptyEl: HTMLDivElement;
  viewportLines: string[];
  targetMenuController?: CliTargetMenuController;
}

interface RenderCliSurfaceRuntimeMetaParams {
  instance: CliSurfaceMetaInstance;
  getRuntimeState(projectId: string): CliSurfaceRuntimeState | undefined;
  resolveSelectedProfile(projectId: string): CliSurfaceProfileLike | undefined;
  adapterHint?: string;
}

function showElement(element: HTMLElement, visible: boolean): void {
  if (visible) {
    element.classList.remove('hidden');
  } else {
    element.classList.add('hidden');
  }
}

function formatDurationMs(value: number): string {
  if (value < 1_000) return `${Math.round(value)}ms`;
  const seconds = value / 1_000;
  return seconds < 10 ? `${seconds.toFixed(1)}s` : `${Math.round(seconds)}s`;
}

export function formatCliSurfaceTiming(timing?: Partial<CliSurfaceStartupTiming>): string {
  if (!timing) return '';

  const parts: string[] = [];
  if (typeof timing.spawnLatencyMs === 'number') {
    parts.push(`spawn ${formatDurationMs(timing.spawnLatencyMs)}`);
  }
  if (typeof timing.firstOutputLatencyMs === 'number') {
    parts.push(`first output ${formatDurationMs(timing.firstOutputLatencyMs)}`);
  }
  return parts.join(' · ');
}

function formatRuntimeStatus(status: CliSurfaceRuntimeState['status'] | undefined): string {
  switch (status) {
    case 'running':
      return 'live';
    case 'starting':
      return 'starting';
    case 'stopped':
      return 'stopped';
    case 'error':
      return 'error';
    default:
      return 'idle';
  }
}

function buildSurfaceRouteCopy(projectId: string): string {
  const targetSession = appState.resolveSurfaceTargetSession(projectId);
  return targetSession ? `Routing to ${targetSession.name}` : 'Routing is not set';
}

export function renderCliSurfaceRuntimeMeta(params: RenderCliSurfaceRuntimeMetaParams): void {
  const { instance, getRuntimeState, resolveSelectedProfile, adapterHint } = params;
  const runtime = getRuntimeState(instance.projectId);
  const profile = resolveSelectedProfile(instance.projectId);
  const label = profile ? getCliSurfaceProfileLabel(profile) : (runtime?.command ?? 'No profile');
  const status = formatRuntimeStatus(runtime?.status);
  const timingLabel = formatCliSurfaceTiming(runtime?.startupTiming);
  instance.metaEl.textContent = `${label} · ${status}${timingLabel ? ` · ${timingLabel}` : ''}`;
  instance.routeEl.textContent = buildSurfaceRouteCopy(instance.projectId);

  const adapter = detectCliAdapter({
    command: runtime?.command ?? profile?.command,
    args: runtime?.args ?? profile?.args,
    title: profile?.name ?? runtime?.command,
    adapterHint,
  });
  instance.adapterMetaEl.innerHTML = '';
  showElement(instance.adapterMetaEl, Boolean(adapter));
  if (adapter) {
    const badges = [adapter.displayName, ...adapter.capabilityBadges];
    for (const badgeLabel of badges) {
      const badge = document.createElement('span');
      badge.className = 'cli-surface-adapter-badge';
      badge.textContent = badgeLabel;
      instance.adapterMetaEl.appendChild(badge);
    }
  }

  instance.targetMenuController?.syncControls();

  if (runtime?.status === 'running') {
    instance.emptyEl.textContent = 'Runtime is live. Select text or capture the viewport to send context.';
    showElement(instance.emptyEl, instance.viewportLines.length === 0);
    return;
  }

  if (runtime?.status === 'starting') {
    instance.emptyEl.textContent = timingLabel
      ? `Starting CLI surface runtime. ${timingLabel}. Waiting for first output.`
      : 'Starting CLI surface runtime…';
    showElement(instance.emptyEl, true);
    return;
  }

  if (runtime?.status === 'error') {
    instance.emptyEl.textContent = runtime?.lastError || 'CLI surface failed to start. Edit the command or try another suggestion.';
    showElement(instance.emptyEl, true);
    return;
  }

  instance.emptyEl.textContent = 'Calder can run a detected CLI or TUI command here. If startup fails, edit the command or try another suggestion.';
  showElement(instance.emptyEl, true);
}
