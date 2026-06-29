import type {
  ProjectGovernanceAutoApprovalState,
  ProjectGovernanceState,
  ProviderId,
} from '../../types.js';
import { getProviderDisplayName } from '../surface-services/provider-availability.js';
import {
  appendAutoApprovalControls,
  type AutoApprovalScopeSummary,
  createModeGuide,
  createModeSelect,
} from './config-sections-auto-approval-controls-helpers.js';
import {
  autoApprovalModeBehavior,
  autoApprovalModeLabel,
  autoApprovalModePlainLanguageDetails,
  autoApprovalSourceLabel,
  localizedText,
  projectInheritLabel,
  sessionInheritLabel,
} from './config-sections-auto-approval-i18n.js';

/*
 * Source contract markers kept in this orchestrator after helper extraction:
 * setAutoApprovalMode
 * setSessionAutoApprovalOverride
 * auto-approval-control
 * Full Auto (Unsafe)
 * Session policy is temporary and takes priority
 * Mode Guide
 * auto-approval-mode-guide-toggle
 * PROJECT_INHERIT_VALUE
 * SESSION_INHERIT_VALUE
 * projectSelect.value === PROJECT_INHERIT_VALUE
 * sessionSelect.value === SESSION_INHERIT_VALUE
 */

export { createModeGuide, createModeSelect };

export function describeAutoApprovalScopes(autoApproval: ProjectGovernanceAutoApprovalState): AutoApprovalScopeSummary {
  let effectiveExplanation = 'No explicit setting found; fallback Off applies.';
  if (autoApproval.policySource === 'session') {
    effectiveExplanation = localizedText(
      'Session override is active, so Session setting applies.',
      'Oturum geçersiz kılması aktif, bu yüzden Oturum ayarı uygulanır.',
    );
  } else if (autoApproval.policySource === 'project') {
    effectiveExplanation = localizedText(
      'Session follows Project, so Project setting applies.',
      'Oturum Projeyi izlediği için Proje ayarı uygulanır.',
    );
  } else if (autoApproval.policySource === 'global') {
    effectiveExplanation = localizedText(
      'Project and Session follow higher scope, so Global setting applies.',
      'Proje ve Oturum üst kapsamı izlediği için Global ayar uygulanır.',
    );
  }
  if (autoApproval.policySource === 'fallback') {
    effectiveExplanation = localizedText(
      'No explicit setting found; fallback Off applies.',
      'Açık bir ayar bulunamadı; yedek Kapalı modu uygulanır.',
    );
  }

  const effectiveDetails = autoApprovalModePlainLanguageDetails(autoApproval.effectiveMode);

  return {
    global: autoApprovalModeLabel(autoApproval.globalMode),
    project: autoApproval.projectMode
      ? autoApprovalModeLabel(autoApproval.projectMode)
      : projectInheritLabel(),
    session: autoApproval.sessionMode
      ? autoApprovalModeLabel(autoApproval.sessionMode)
      : sessionInheritLabel(),
    effectiveSource: autoApprovalSourceLabel(autoApproval.policySource),
    effectiveExplanation,
    effectiveBehavior: autoApprovalModeBehavior(autoApproval.effectiveMode),
    effectiveAutoRuns: effectiveDetails.autoRuns,
    effectiveStillAsks: effectiveDetails.stillAsks,
  };
}

type RenderSectionFn = (
  id: string,
  title: string,
  items: HTMLElement[],
  count: number,
  onAdd?: () => void,
  emptyText?: string,
) => HTMLElement;

export type RenderAutoApprovalSectionArgs = {
  projectId: string;
  projectPath: string;
  providerId: ProviderId;
  governanceState: ProjectGovernanceState | undefined;
  supportsPermissionHooks: boolean;
  sessionId: string | undefined;
  esc: (input: string) => string;
  refresh: () => Promise<void>;
  renderSection: RenderSectionFn;
};

export function renderAutoApprovalSection(args: RenderAutoApprovalSectionArgs): HTMLElement | null {
  const {
    projectId,
    projectPath,
    providerId,
    governanceState,
    supportsPermissionHooks,
    sessionId,
    esc,
    refresh,
    renderSection,
  } = args;
  const autoApproval = governanceState?.autoApproval;
  if (!autoApproval) return null;

  const item = document.createElement('div');
  item.className = 'config-item auto-approval-item';

  const summary = document.createElement('div');
  summary.className = 'auto-approval-summary';
  const scopeSummary = describeAutoApprovalScopes(autoApproval);
  const providerName = getProviderDisplayName(providerId);
  const priorityRule = localizedText(
    'Priority: Session > Project > Global.',
    'Öncelik sırası: Oturum > Proje > Global.',
  );
  const effectiveModeLabel = localizedText('Effective Mode', 'Etkin Mod');
  const effectiveSourceLabel = localizedText('Effective Source', 'Etkin Kaynak');
  const currentBehaviorLabel = localizedText('Current Behavior', 'Mevcut Davranış');
  const autoRunsLabel = localizedText('Auto-runs', 'Otomatik çalışır');
  const stillAsksLabel = localizedText('Still asks', 'Yine sorar');
  const providerLabelText = localizedText('Provider', 'Sağlayıcı');
  const policyStackLabel = localizedText('Policy Stack', 'Politika Katmanı');
  const globalPolicyLabel = localizedText('Global Default', 'Global Varsayılan');
  const projectPolicyLabel = localizedText('Project Policy', 'Proje Politikası');
  const sessionPolicyLabel = localizedText('Session Policy', 'Oturum Politikası');
  const effectiveShortLabel = localizedText('Effective', 'Etkin');
  const fullAutoWarning = localizedText(
    'Note: Full Auto still requires manual approval for destructive operations.',
    'Not: Tam Otomatik modda yıkıcı işlemler için manuel onay gerekir.',
  );
  const fullAutoUnsafeWarning = localizedText(
    'Warning: Full Auto (Unsafe) auto-approves destructive operations.',
    'Uyarı: Tam Otomatik (Tehlikeli) modu yıkıcı işlemleri otomatik onaylar.',
  );
  const priorityMapLabel = localizedText(
    'Applied order: Global -> Project -> Session -> Effective.',
    'Uygulama sırası: Global -> Proje -> Oturum -> Etkin.',
  );
  const showPolicyDetailsLabel = localizedText('Show policy details', 'Politika detaylarını göster');
  const hidePolicyDetailsLabel = localizedText('Hide policy details', 'Politika detaylarını gizle');
  const quickSummaryLabel = localizedText('Quick summary', 'Hızlı özet');
  const modeRiskNote = autoApproval.effectiveMode === 'full_auto_unsafe'
    ? fullAutoUnsafeWarning
    : (autoApproval.effectiveMode === 'full_auto' ? fullAutoWarning : null);

  summary.innerHTML = `
    <div class="auto-approval-summary-header auto-approval-current-card">
      <span class="config-item-name">${esc(effectiveModeLabel)}</span>
      <span class="scope-badge control-chip">${esc(autoApprovalModeLabel(autoApproval.effectiveMode))}</span>
    </div>
    <div class="auto-approval-priority-note ops-rail-note" data-tone="default">
      ${esc(priorityRule)}
    </div>
    <div class="auto-approval-meta-inline" aria-label="${esc(quickSummaryLabel)}">
      <div class="auto-approval-meta-inline-item">
        <span class="auto-approval-meta-inline-label">${esc(effectiveSourceLabel)}</span>
        <span class="auto-approval-meta-inline-value">${esc(scopeSummary.effectiveSource)}</span>
      </div>
      <div class="auto-approval-meta-inline-item">
        <span class="auto-approval-meta-inline-label">${esc(currentBehaviorLabel)}</span>
        <span class="auto-approval-meta-inline-value">${esc(scopeSummary.effectiveBehavior)}</span>
      </div>
      <div class="auto-approval-meta-inline-item">
        <span class="auto-approval-meta-inline-label">${esc(autoRunsLabel)}</span>
        <span class="auto-approval-meta-inline-value">${esc(scopeSummary.effectiveAutoRuns)}</span>
      </div>
      <div class="auto-approval-meta-inline-item">
        <span class="auto-approval-meta-inline-label">${esc(stillAsksLabel)}</span>
        <span class="auto-approval-meta-inline-value">${esc(scopeSummary.effectiveStillAsks)}</span>
      </div>
    </div>
  `;
  item.appendChild(summary);

  const detailsToggle = document.createElement('button');
  detailsToggle.type = 'button';
  detailsToggle.className = 'auto-approval-details-toggle';
  detailsToggle.textContent = showPolicyDetailsLabel;
  detailsToggle.setAttribute('aria-expanded', 'false');

  const details = document.createElement('div');
  details.className = 'auto-approval-details hidden';
  details.id = `auto-approval-details-${projectId}`;
  detailsToggle.setAttribute('aria-controls', details.id);
  details.innerHTML = `
    <div class="auto-approval-priority-map">${esc(priorityMapLabel)}</div>
    <div class="auto-approval-meta-card">
      <div class="auto-approval-meta-row">
        <span class="auto-approval-meta-label">${esc(providerLabelText)}</span>
        <span class="auto-approval-meta-value">${esc(providerName)}</span>
      </div>
      <div class="auto-approval-meta-row">
        <span class="auto-approval-meta-label">${esc(localizedText('Why this applies', 'Neden bu uygulanıyor'))}</span>
        <span class="auto-approval-meta-value">${esc(scopeSummary.effectiveExplanation)}</span>
      </div>
    </div>
    <div class="auto-approval-policy-stack" aria-label="${esc(policyStackLabel)}">
      <div class="auto-approval-policy-row">
        <span class="auto-approval-policy-name">${esc(globalPolicyLabel)}</span>
        <span class="scope-badge control-chip">${esc(scopeSummary.global)}</span>
      </div>
      <div class="auto-approval-policy-row">
        <span class="auto-approval-policy-name">${esc(projectPolicyLabel)}</span>
        <span class="scope-badge control-chip">${esc(scopeSummary.project)}</span>
      </div>
      <div class="auto-approval-policy-row">
        <span class="auto-approval-policy-name">${esc(sessionPolicyLabel)}</span>
        <span class="scope-badge control-chip">${esc(scopeSummary.session)}</span>
      </div>
      <div class="auto-approval-policy-row is-effective">
        <span class="auto-approval-policy-name">${esc(effectiveShortLabel)}</span>
        <span class="scope-badge control-chip">${esc(autoApprovalModeLabel(autoApproval.effectiveMode))}</span>
      </div>
    </div>
    ${modeRiskNote
      ? `<div class="auto-approval-risk-note">${esc(modeRiskNote)}</div>`
      : ''}
  `;

  detailsToggle.addEventListener('click', () => {
    const expanded = detailsToggle.getAttribute('aria-expanded') === 'true';
    detailsToggle.setAttribute('aria-expanded', expanded ? 'false' : 'true');
    detailsToggle.textContent = expanded ? showPolicyDetailsLabel : hidePolicyDetailsLabel;
    details.classList.toggle('hidden', expanded);
  });

  item.appendChild(detailsToggle);
  item.appendChild(details);

  appendAutoApprovalControls({
    autoApproval,
    scopeSummary,
    globalPolicyLabel,
    projectPolicyLabel,
    sessionPolicyLabel,
    supportsPermissionHooks,
    sessionId,
    projectId,
    projectPath,
    refresh,
    details,
    esc,
  });
  return renderSection(
    'auto-approval',
    localizedText('Auto Approval', 'Otomatik Onay'),
    [item],
    1,
    undefined,
    localizedText('Auto approval unavailable', 'Otomatik onay kullanılamıyor'),
  );
}
