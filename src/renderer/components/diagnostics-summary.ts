import { describeProviderRoute } from '../../shared/provider-route.js';
import type { AutoApprovalMode } from '../../shared/types/governance.js';
import type { ProviderId, UiLanguage } from '../../shared/types/provider.js';
import { appState, type ProjectRecord, type SessionRecord } from '../state.js';
import { applyTabularNums } from './surface-services/dom-utils.js';
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
};

const AUTO_APPROVAL_MODE_LABELS: Record<AutoApprovalMode, { en: string; tr: string }> = {
  ask: { en: 'Ask every time', tr: 'Her seferinde sor' },
  project_edits: { en: 'Project edits', tr: 'Proje düzenlemeleri' },
  session_safe: { en: 'Session safe', tr: 'Oturum güvenli' },
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
      detail: '',
      tone: 'default',
    };
  }
  if (status.conflicted > 0) {
    return {
      label: localized(language, 'Git', 'Git'),
      value: localized(language, 'Conflicts', 'Çakışma'),
      detail: localized(language, `${status.conflicted} file(s)`, `${status.conflicted} dosya`),
      tone: 'warning',
    };
  }
  const changed = status.staged + status.modified + status.untracked;
  if (changed > 0) {
    return {
      label: localized(language, 'Git', 'Git'),
      value: localized(language, 'Changed', 'Değişiklik'),
      detail: localized(language, `${changed} file(s)`, `${changed} dosya`),
      tone: 'active',
    };
  }
  return {
    label: localized(language, 'Git', 'Git'),
    value: localized(language, 'Clean', 'Temiz'),
    detail: status.branch ?? '',
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
      detail: '',
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
      detail: '',
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
    detail: isGateway ? `${displayName} · ${backendLabel}` : `${displayName} · ${model}`,
    tone: isGateway ? 'active' : 'default',
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
      detail: '',
      tone: 'default',
    };
  }
  const label = AUTO_APPROVAL_MODE_LABELS[mode][language];
  return {
    label: localized(language, 'Approval', 'Onay'),
    value: label,
    detail: '',
    tone: mode === 'session_safe' ? 'warning' : mode === 'ask' ? 'default' : 'active',
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
    summarizeAutoApproval(project, language),
    summarizeGitStatus(gitStatus, language),
  ];
  return {
    title: localized(language, 'Workspace Trust', 'Çalışma Güveni'),
    subtitle: '',
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
  applyTabularNums(value);
  value.textContent = card.value;
  value.title = card.value;

  el.appendChild(label);
  el.appendChild(value);
  if (card.detail) {
    const detail = document.createElement('span');
    detail.className = 'diagnostics-summary-detail';
    applyTabularNums(detail);
    detail.textContent = card.detail;
    detail.title = card.detail;
    el.appendChild(detail);
  }
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
  header.appendChild(title);

  const grid = document.createElement('div');
  grid.className = 'diagnostics-summary-grid';
  for (const card of model.cards) {
    grid.appendChild(createCard(card));
  }

  root.appendChild(header);
  root.appendChild(grid);
}
