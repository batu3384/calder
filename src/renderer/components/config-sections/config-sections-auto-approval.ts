import type {
  ProjectGovernanceAutoApprovalState,
  ProjectGovernanceState,
  ProviderId,
} from '../../types.js';
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
 * PROJECT_INHERIT_VALUE
 * SESSION_INHERIT_VALUE
 * projectSelect.value === PROJECT_INHERIT_VALUE
 * sessionSelect.value === SESSION_INHERIT_VALUE
 */

export { createModeGuide, createModeSelect };

export function describeAutoApprovalScopes(
  autoApproval: ProjectGovernanceAutoApprovalState,
): AutoApprovalScopeSummary {
  let effectiveExplanation = 'No explicit setting found; fallback Ask every time applies.';
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
      'No explicit setting found; fallback Ask every time applies.',
      'Açık bir ayar bulunamadı; yedek Her seferinde sor modu uygulanır.',
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

  const scopeSummary = describeAutoApprovalScopes(autoApproval);
  if (!supportsPermissionHooks) {
    scopeSummary.effectiveBehavior = localizedText(
      'Manual approval only — this provider has no permission-hook auto-approval path.',
      'Yalnızca manuel onay — bu sağlayıcıda izin-hook otomatik onay yolu yok.',
    );
    scopeSummary.effectiveAutoRuns = localizedText(
      'None (provider unsupported)',
      'Yok (sağlayıcı desteklemiyor)',
    );
    scopeSummary.effectiveStillAsks = localizedText('Everything', 'Her şey');
    scopeSummary.effectiveExplanation = localizedText(
      'Policy may say otherwise, but this provider cannot auto-approve; Calder always asks.',
      'Politika farklı dese de bu sağlayıcı otomatik onaylayamaz; Calder her zaman sorar.',
    );
  }
  const displayEffectiveMode = supportsPermissionHooks ? autoApproval.effectiveMode : 'ask';
  const effectiveModeLabel = localizedText('Effective mode', 'Etkin mod');
  const globalPolicyLabel = localizedText('Global', 'Global');
  const projectPolicyLabel = localizedText('Project', 'Proje');
  const sessionPolicyLabel = localizedText('Session', 'Oturum');

  const summary = document.createElement('div');
  summary.className = 'auto-approval-summary';
  const effectiveSourceLabel = localizedText('Source', 'Kaynak');
  const riskNote =
    displayEffectiveMode === 'session_safe'
      ? localizedText(
          'Session safe auto-approves project edits and read-only tools. Destructive and outside-project actions still ask.',
          'Oturum güvenli: proje düzenlemeleri ve salt-okunur araçlar otomatik onaylanır. Yıkıcı ve proje-dışı işlemler hâlâ sorar.',
        )
      : null;
  summary.innerHTML = `
    <div class="auto-approval-summary-header auto-approval-current-card">
      <span class="config-item-name">${esc(effectiveModeLabel)}</span>
      <span class="auto-approval-effective-value">${esc(autoApprovalModeLabel(displayEffectiveMode))}</span>
    </div>
    <div class="auto-approval-summary-source">${esc(effectiveSourceLabel)}: ${esc(scopeSummary.effectiveSource)}</div>
    ${
      riskNote
        ? `<div class="auto-approval-risk-note" data-tone="warning">${esc(riskNote)}</div>`
        : ''
    }
  `;
  item.appendChild(summary);

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
    host: item,
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
