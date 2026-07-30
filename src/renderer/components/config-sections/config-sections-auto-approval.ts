import type {
  ProjectGovernanceAutoApprovalState,
  ProjectGovernanceState,
  ProviderId,
} from '../../types.js';
import {
  appendAutoApprovalControls,
  type AutoApprovalScopeSummary,
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

export { createModeSelect } from './config-sections-auto-approval-controls-helpers.js';

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
    refresh,
    renderSection,
  } = args;
  const autoApproval = governanceState?.autoApproval;
  if (!autoApproval) return null;

  const item = document.createElement('div');
  item.className = 'config-item auto-approval-item';

  appendAutoApprovalControls({
    autoApproval,
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
    0,
    undefined,
    localizedText('Auto approval unavailable', 'Otomatik onay kullanılamıyor'),
  );
}
