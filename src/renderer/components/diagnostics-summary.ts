import { describeProviderRoute } from '../../shared/provider-route.js';
import type { AutoApprovalMode } from '../../shared/types/governance.js';
import type { ProviderId, UiLanguage } from '../../shared/types/provider.js';
import { appState, type ProjectRecord, type SessionRecord } from '../state.js';
import { getGitStatus, type GitStatus } from './surface-services/git-status.js';
import { getProviderDisplayName } from './surface-services/provider-availability.js';

type DiagnosticsTone = 'default' | 'active' | 'warning';

export interface DiagnosticsSummaryCard {
  label: string;
  value: string;
  detail: string;
  tone: DiagnosticsTone;
}

export interface DiagnosticsSummaryModel {
  title: string;
  subtitle: string;
  tone: DiagnosticsTone;
  cards: DiagnosticsSummaryCard[];
}

export interface DiagnosticsSummaryInput {
  project: ProjectRecord | undefined;
  activeSession: SessionRecord | undefined;
  gitStatus: GitStatus | undefined;
  language: UiLanguage;
  providerLabel?: string;
}

const PROVIDER_BACKEND_LABELS: Record<string, string> = {
  anthropic: 'Anthropic',
  zai: 'Z.ai',
  minimax: 'MiniMax',
  qwen: 'Qwen',
};

const AUTO_APPROVAL_MODE_LABELS: Record<AutoApprovalMode, { en: string; tr: string }> = {
  off: { en: 'Manual', tr: 'Manuel' },
  edit_only: { en: 'Edits only', tr: 'Sadece düzenleme' },
  edit_plus_safe_tools: { en: 'Edits + safe tools', tr: 'Düzenleme + güvenli araçlar' },
  full_auto: { en: 'Autonomous', tr: 'Otonom' },
  full_auto_unsafe: { en: 'Unsafe autonomous', tr: 'Tehlikeli otonom' },
};

function localized(language: UiLanguage, english: string, turkish: string): string {
  return language === 'tr' ? turkish : english;
}

function pickCliSession(
  project: ProjectRecord | undefined,
  activeSession: SessionRecord | undefined,
): SessionRecord | undefined {
  if (activeSession && !activeSession.type) return activeSession;
  return [...(project?.sessions ?? [])].reverse().find((session) => !session.type);
}

function summarizeGitStatus(
  status: GitStatus | undefined,
  language: UiLanguage,
): DiagnosticsSummaryCard {
  if (!status || !status.isGitRepo) {
    return {
      label: localized(language, 'Git', 'Git'),
      value: localized(language, 'Not detected', 'Algılanmadı'),
      detail: localized(
        language,
        'No worktree signal for this project yet.',
        'Bu proje için henüz worktree sinyali yok.',
      ),
      tone: 'default',
    };
  }
  if (status.conflicted > 0) {
    return {
      label: localized(language, 'Git', 'Git'),
      value: localized(language, 'Conflicts', 'Çakışma'),
      detail: localized(
        language,
        `${status.conflicted} conflicted file(s).`,
        `${status.conflicted} çakışmalı dosya.`,
      ),
      tone: 'warning',
    };
  }
  const changed = status.staged + status.modified + status.untracked;
  if (changed > 0) {
    return {
      label: localized(language, 'Git', 'Git'),
      value: localized(language, 'Changed', 'Değişiklik var'),
      detail: localized(
        language,
        `${changed} file(s) need attention.`,
        `${changed} dosya dikkat istiyor.`,
      ),
      tone: 'active',
    };
  }
  return {
    label: localized(language, 'Git', 'Git'),
    value: localized(language, 'Clean', 'Temiz'),
    detail: localized(
      language,
      status.branch ? `On ${status.branch}.` : 'Worktree is clean.',
      status.branch ? `${status.branch} dalında.` : 'Worktree temiz.',
    ),
    tone: 'default',
  };
}

function summarizeProviderRoute(
  session: SessionRecord | undefined,
  language: UiLanguage,
  providerLabel: string | undefined,
): DiagnosticsSummaryCard {
  if (!session) {
    return {
      label: localized(language, 'Route', 'Rota'),
      value: localized(language, 'No CLI', 'CLI yok'),
      detail: localized(
        language,
        'Open a CLI session to see model routing.',
        'Model rotasını görmek için bir CLI oturumu aç.',
      ),
      tone: 'default',
    };
  }

  const providerId = (session.providerId ?? 'claude') as ProviderId;
  const displayName = providerLabel ?? getProviderDisplayName(providerId);
  const model = session.cost?.model?.trim();
  if (!model) {
    return {
      label: localized(language, 'Route', 'Rota'),
      value: displayName,
      detail: localized(language, 'Waiting for model signal.', 'Model sinyali bekleniyor.'),
      tone: 'default',
    };
  }

  const route = describeProviderRoute({
    nativeProviderId: providerId,
    model,
  });
  const backendLabel = PROVIDER_BACKEND_LABELS[route.backendProviderId] ?? route.backendProviderId;
  const isGateway = route.routeKind === 'gateway';
  return {
    label: localized(language, 'Route', 'Rota'),
    value: isGateway
      ? localized(language, 'Gateway', 'Gateway')
      : localized(language, 'Native', 'Yerel'),
    detail: isGateway
      ? localized(
          language,
          `${displayName} -> ${backendLabel} · ${model}`,
          `${displayName} -> ${backendLabel} · ${model}`,
        )
      : localized(language, `${displayName} native · ${model}`, `${displayName} yerel · ${model}`),
    tone: isGateway ? 'active' : 'default',
  };
}

function summarizeTracking(
  session: SessionRecord | undefined,
  language: UiLanguage,
): DiagnosticsSummaryCard {
  if (!session) {
    return {
      label: localized(language, 'Tracking', 'İzleme'),
      value: localized(language, 'Idle', 'Boşta'),
      detail: localized(
        language,
        'No active CLI telemetry yet.',
        'Henüz aktif CLI telemetrisi yok.',
      ),
      tone: 'default',
    };
  }
  const hasCost = Boolean(session.cost);
  const hasContext = Boolean(session.contextWindow);
  if (hasCost && hasContext) {
    return {
      label: localized(language, 'Tracking', 'İzleme'),
      value: localized(language, 'Live', 'Canlı'),
      detail: localized(
        language,
        `Cost + context at ${Math.round(session.contextWindow?.usedPercentage ?? 0)}%.`,
        `Maliyet + bağlam %${Math.round(session.contextWindow?.usedPercentage ?? 0)}.`,
      ),
      tone: 'default',
    };
  }
  if (hasCost || hasContext) {
    return {
      label: localized(language, 'Tracking', 'İzleme'),
      value: localized(language, 'Partial', 'Kısmi'),
      detail: localized(
        language,
        hasCost ? 'Cost is visible; context is pending.' : 'Context is visible; cost is pending.',
        hasCost ? 'Maliyet görünüyor; bağlam bekleniyor.' : 'Bağlam görünüyor; maliyet bekleniyor.',
      ),
      tone: 'active',
    };
  }
  return {
    label: localized(language, 'Tracking', 'İzleme'),
    value: localized(language, 'Limited', 'Sınırlı'),
    detail: localized(
      language,
      'Waiting for statusline telemetry.',
      'Statusline telemetrisi bekleniyor.',
    ),
    tone: 'active',
  };
}

function summarizeAutoApproval(
  project: ProjectRecord | undefined,
  language: UiLanguage,
): DiagnosticsSummaryCard {
  const mode = project?.projectGovernance?.autoApproval?.effectiveMode;
  if (!mode) {
    return {
      label: localized(language, 'Approval', 'Onay'),
      value: localized(language, 'Unset', 'Ayarsız'),
      detail: localized(
        language,
        'Fallback policy will ask before actions.',
        'Yedek politika işlemlerden önce sorar.',
      ),
      tone: 'default',
    };
  }
  const label = AUTO_APPROVAL_MODE_LABELS[mode][language];
  if (mode === 'full_auto_unsafe') {
    return {
      label: localized(language, 'Approval', 'Onay'),
      value: label,
      detail: localized(
        language,
        'Destructive actions can be auto-approved.',
        'Yıkıcı işlemler otomatik onaylanabilir.',
      ),
      tone: 'warning',
    };
  }
  if (mode === 'full_auto') {
    return {
      label: localized(language, 'Approval', 'Onay'),
      value: label,
      detail: localized(language, 'Destructive actions still ask.', 'Yıkıcı işlemler yine sorar.'),
      tone: 'active',
    };
  }
  return {
    label: localized(language, 'Approval', 'Onay'),
    value: label,
    detail: localized(
      language,
      'Risky actions still require confirmation.',
      'Riskli işlemler hâlâ onay ister.',
    ),
    tone: 'default',
  };
}

function strongestTone(cards: DiagnosticsSummaryCard[]): DiagnosticsTone {
  if (cards.some((card) => card.tone === 'warning')) return 'warning';
  if (cards.some((card) => card.tone === 'active')) return 'active';
  return 'default';
}

export function buildDiagnosticsSummaryModel(
  input: DiagnosticsSummaryInput,
): DiagnosticsSummaryModel {
  const { project, activeSession, gitStatus, language, providerLabel } = input;
  const cliSession = pickCliSession(project, activeSession);
  const cards = [
    summarizeProviderRoute(cliSession, language, providerLabel),
    summarizeTracking(cliSession, language),
    summarizeAutoApproval(project, language),
    summarizeGitStatus(gitStatus, language),
  ];
  return {
    title: localized(language, 'Workspace Trust', 'Çalışma Güveni'),
    subtitle: localized(
      language,
      'Route, telemetry, approvals, and git risk at a glance.',
      'Rota, telemetri, onay ve git riskini tek bakışta gösterir.',
    ),
    tone: strongestTone(cards),
    cards,
  };
}

function createCard(card: DiagnosticsSummaryCard): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'diagnostics-summary-card';
  el.dataset.tone = card.tone;

  const label = document.createElement('span');
  label.className = 'diagnostics-summary-label';
  label.textContent = card.label;

  const value = document.createElement('strong');
  value.className = 'diagnostics-summary-value';
  value.textContent = card.value;

  const detail = document.createElement('span');
  detail.className = 'diagnostics-summary-detail';
  detail.textContent = card.detail;

  el.appendChild(label);
  el.appendChild(value);
  el.appendChild(detail);
  return el;
}

export function renderDiagnosticsSummary(): void {
  const root = document.getElementById('diagnostics-summary');
  if (!(root instanceof HTMLElement)) return;

  const project = appState.activeProject;
  root.innerHTML = '';
  root.toggleAttribute('hidden', !project);
  if (!project) return;

  const language = appState.preferences.language === 'tr' ? 'tr' : 'en';
  const activeSession = appState.activeSession;
  const providerId = (pickCliSession(project, activeSession)?.providerId ?? 'claude') as ProviderId;
  const model = buildDiagnosticsSummaryModel({
    project,
    activeSession,
    gitStatus: getGitStatus(project.id),
    language,
    providerLabel: getProviderDisplayName(providerId),
  });

  root.className = 'diagnostics-summary';
  root.dataset.tone = model.tone;

  const header = document.createElement('div');
  header.className = 'diagnostics-summary-header';

  const title = document.createElement('span');
  title.className = 'diagnostics-summary-title';
  title.textContent = model.title;

  const subtitle = document.createElement('span');
  subtitle.className = 'diagnostics-summary-subtitle';
  subtitle.textContent = model.subtitle;

  header.appendChild(title);
  header.appendChild(subtitle);

  const grid = document.createElement('div');
  grid.className = 'diagnostics-summary-grid';
  for (const card of model.cards) {
    grid.appendChild(createCard(card));
  }

  root.appendChild(header);
  root.appendChild(grid);
}
