import type {
  CliSurfaceRuntimeState,
  ProjectBackgroundTaskState,
  ProjectCheckpointState,
  ProjectContextState,
  ProjectGovernanceState,
  ProjectLayoutState,
  ProjectRecord,
  ProjectReviewState,
  ProjectSurfaceRecord,
  ProjectTeamContextState,
  ProjectWorkflowDocument,
  ProjectWorkflowState,
} from '../shared/types.js';

export const DEFAULT_BROWSER_WIDTH_RATIO = 0.38;

export function normalizeProjectLayout(layout?: Partial<ProjectLayoutState>): ProjectLayoutState {
  const rawMode = layout?.mode;
  const mode = rawMode === 'tabs' ? rawMode : 'mosaic';
  return {
    mode,
    splitPanes: Array.isArray(layout?.splitPanes) ? [...layout.splitPanes] : [],
    splitDirection: layout?.splitDirection === 'vertical' ? 'vertical' : 'horizontal',
    browserWidthRatio: typeof layout?.browserWidthRatio === 'number' ? layout.browserWidthRatio : DEFAULT_BROWSER_WIDTH_RATIO,
    mosaicPreset: layout?.mosaicPreset,
    mosaicRatios: layout?.mosaicRatios ? { ...layout.mosaicRatios } : {},
  };
}

export function stripTransientRuntimeFields(runtime: CliSurfaceRuntimeState): CliSurfaceRuntimeState {
  const next = { ...runtime };
  delete next.runtimeId;
  delete next.startupTiming;
  return next;
}

export function normalizeProjectContextState(
  incoming: ProjectContextState,
  previous?: ProjectContextState,
): ProjectContextState {
  const previousEnabledById = new Map(
    (previous?.sources ?? []).map((source) => [source.id, source.enabled]),
  );

  const sources = incoming.sources.map((source) => ({
    ...source,
    enabled: source.enabled ?? previousEnabledById.get(source.id),
  }));

  return {
    ...incoming,
    sources,
    sharedRuleCount: sources.filter((source) => source.provider === 'shared' && source.kind === 'rules' && source.enabled !== false).length,
    providerSourceCount: sources.filter((source) => source.provider !== 'shared' && source.enabled !== false).length,
  };
}

export function normalizeProjectWorkflowState(
  incoming: ProjectWorkflowState,
): ProjectWorkflowState {
  return {
    ...incoming,
    workflows: [...incoming.workflows],
  };
}

export function normalizeProjectTeamContextState(
  incoming: ProjectTeamContextState,
): ProjectTeamContextState {
  return {
    ...incoming,
    spaces: [...incoming.spaces],
  };
}

export function normalizeProjectReviewState(
  incoming: ProjectReviewState,
): ProjectReviewState {
  return {
    ...incoming,
    reviews: [...incoming.reviews],
  };
}

export function normalizeProjectGovernanceState(
  incoming: ProjectGovernanceState,
): ProjectGovernanceState {
  return {
    ...incoming,
    policy: incoming.policy ? { ...incoming.policy } : undefined,
  };
}

export function normalizeProjectBackgroundTaskState(
  incoming: ProjectBackgroundTaskState,
): ProjectBackgroundTaskState {
  return {
    ...incoming,
    tasks: [...incoming.tasks],
  };
}

export function normalizeProjectCheckpointState(
  incoming: ProjectCheckpointState,
): ProjectCheckpointState {
  return {
    ...incoming,
    checkpoints: [...incoming.checkpoints],
  };
}

export function deriveBrowserSessionName(url?: string, fallbackName = 'Browser'): string {
  if (!url) return fallbackName;
  try {
    return new URL(url).hostname || fallbackName;
  } catch {
    return fallbackName;
  }
}

export function buildWorkflowLaunchPrompt(workflow: ProjectWorkflowDocument): string {
  const body = workflow.contents.trim();
  return [
    'Follow this reusable project workflow for the current task.',
    `Workflow: ${workflow.title}`,
    `Source: ${workflow.relativePath}`,
    body,
  ].filter(Boolean).join('\n\n');
}

export function normalizeProjectSurface(project: ProjectRecord): ProjectSurfaceRecord {
  const browserSession = [...project.sessions].reverse().find((session) => session.type === 'browser-tab');
  const existing = project.surface;
  const history = existing?.web?.history
    ?? (browserSession?.browserTabUrl ? [browserSession.browserTabUrl] : []);
  const kind = existing?.kind ?? (browserSession ? 'web' : 'cli');
  const active = existing?.active ?? Boolean(browserSession);
  const tabFocus = kind === 'cli'
    ? (existing?.tabFocus ?? (active ? 'cli' : 'session'))
    : kind === 'mobile'
      ? (existing?.tabFocus ?? (active ? 'mobile' : 'session'))
      : 'session';
  const tabPlacement = existing?.tabPlacement === 'start' ? 'start' : 'end';
  const tabOrder = Array.isArray(existing?.tabOrder)
    ? existing.tabOrder.filter((entry): entry is 'cli' | 'mobile' => entry === 'cli' || entry === 'mobile')
    : [];
  const normalizedTabOrder = (tabOrder.length === 2 && tabOrder.includes('cli') && tabOrder.includes('mobile'))
    ? tabOrder
    : ['cli', 'mobile'];

  return {
    kind,
    active,
    tabFocus,
    tabPlacement,
    tabOrder: normalizedTabOrder,
    targetSessionId: existing?.targetSessionId ?? browserSession?.browserTargetSessionId,
    web: {
      sessionId: existing?.web?.sessionId ?? browserSession?.id,
      url: existing?.web?.url ?? browserSession?.browserTabUrl,
      history: [...history],
    },
    cli: {
      selectedProfileId: existing?.cli?.selectedProfileId,
      profiles: existing?.cli?.profiles ? [...existing.cli.profiles] : [],
      runtime: existing?.cli?.runtime
        ? stripTransientRuntimeFields(existing.cli.runtime)
        : { status: 'idle' },
    },
  };
}
