import { getProviderDisplayName } from '../../provider-availability.js';
import type {
  AutoApprovalMode,
  ProjectGovernanceAutoApprovalState,
  ProjectGovernanceState,
  ProviderId,
} from '../../types.js';
import {
  AUTO_APPROVAL_MODE_OPTIONS,
  autoApprovalModeBehavior,
  autoApprovalModeGuideSummary,
  autoApprovalModeLabel,
  autoApprovalScopeHelp,
  autoApprovalSourceLabel,
  localizedText,
  projectInheritLabel,
  sessionInheritLabel,
} from './config-sections-auto-approval-i18n.js';

const PROJECT_INHERIT_VALUE = '__inherit_global__';
const SESSION_INHERIT_VALUE = '';

export function describeAutoApprovalScopes(autoApproval: ProjectGovernanceAutoApprovalState): {
  global: string;
  project: string;
  session: string;
  effectiveSource: string;
  effectiveExplanation: string;
  effectiveBehavior: string;
} {
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
  };
}

function createAutoApprovalScopeCard(
  title: string,
  helperText: string,
  select: HTMLSelectElement,
): HTMLDivElement {
  const card = document.createElement('div');
  card.className = 'auto-approval-control auto-approval-scope-card';
  card.title = helperText;

  const row = document.createElement('div');
  row.className = 'auto-approval-scope-row';

  const titleEl = document.createElement('div');
  titleEl.className = 'auto-approval-scope-title';
  titleEl.textContent = title;

  const control = document.createElement('div');
  control.className = 'auto-approval-scope-control';
  control.appendChild(select);
  row.appendChild(titleEl);
  row.appendChild(control);

  const helper = document.createElement('div');
  helper.className = 'auto-approval-scope-helper';
  helper.textContent = helperText;

  card.appendChild(row);
  card.appendChild(helper);
  return card;
}

export function createModeSelect(
  currentMode: AutoApprovalMode,
  helperText: string,
  onChange: (nextMode: AutoApprovalMode) => Promise<void>,
): HTMLSelectElement {
  const select = document.createElement('select');
  select.className = 'auto-approval-select';
  select.title = helperText;
  for (const option of AUTO_APPROVAL_MODE_OPTIONS) {
    const el = document.createElement('option');
    el.value = option.value;
    el.textContent = autoApprovalModeLabel(option.value);
    if (option.value === currentMode) {
      el.selected = true;
    }
    select.appendChild(el);
  }

  select.addEventListener('change', async () => {
    const nextMode = select.value as AutoApprovalMode;
    select.disabled = true;
    try {
      await onChange(nextMode);
    } finally {
      select.disabled = false;
    }
  });

  return select;
}

type AutoApprovalControlsArgs = {
  autoApproval: ProjectGovernanceAutoApprovalState;
  scopeSummary: ReturnType<typeof describeAutoApprovalScopes>;
  globalPolicyLabel: string;
  projectPolicyLabel: string;
  sessionPolicyLabel: string;
  supportsPermissionHooks: boolean;
  sessionId: string | undefined;
  projectId: string;
  projectPath: string;
  refresh: () => Promise<void>;
  details: HTMLElement;
  esc: (input: string) => string;
};

export function createModeGuide(esc: (input: string) => string): HTMLDivElement {
  const modeGuide = document.createElement('div');
  modeGuide.className = 'auto-approval-mode-guide';
  const modeGuideToggle = document.createElement('button');
  modeGuideToggle.type = 'button';
  modeGuideToggle.className = 'auto-approval-mode-guide-toggle';
  modeGuideToggle.textContent = localizedText('Mode Guide', 'Mod Rehberi');
  modeGuideToggle.setAttribute('aria-expanded', 'false');

  const modeGuideBody = document.createElement('div');
  modeGuideBody.className = 'auto-approval-mode-guide-body hidden';
  for (const option of AUTO_APPROVAL_MODE_OPTIONS) {
    const row = document.createElement('div');
    row.className = 'auto-approval-mode-guide-row';
    row.innerHTML = `
      <span class="auto-approval-mode-guide-row-label">${esc(option.label)}</span>
      <span class="auto-approval-mode-guide-row-detail">${esc(autoApprovalModeGuideSummary(option.value))}</span>
    `;
    modeGuideBody.appendChild(row);
  }

  modeGuideToggle.addEventListener('click', () => {
    const expanded = modeGuideToggle.getAttribute('aria-expanded') === 'true';
    modeGuideToggle.setAttribute('aria-expanded', expanded ? 'false' : 'true');
    modeGuideBody.classList.toggle('hidden', expanded);
  });

  modeGuide.appendChild(modeGuideToggle);
  modeGuide.appendChild(modeGuideBody);
  return modeGuide;
}

function appendAutoApprovalControls(args: AutoApprovalControlsArgs): void {
  const {
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
  } = args;
  const controls = document.createElement('div');
  controls.className = 'auto-approval-controls';

  const controlsIntro = document.createElement('div');
  controlsIntro.className = 'auto-approval-controls-intro';
  controlsIntro.textContent = localizedText(
    'Session policy is temporary and takes priority (Session > Project > Global).',
    'Oturum politikası geçicidir ve en yüksek önceliğe sahiptir (Oturum > Proje > Global).',
  );
  controls.appendChild(controlsIntro);

  const controlsHint = document.createElement('div');
  controlsHint.className = 'auto-approval-controls-hint';
  controlsHint.textContent = localizedText(
    'Recommended: set Global once, keep Project for repo defaults, then use Session only when needed.',
    'Öneri: Globali bir kez ayarlayın, Projeyi depo varsayılanı için kullanın, Oturumu yalnızca gerektiğinde açın.',
  );
  controls.appendChild(controlsHint);

  const scopeHelp = autoApprovalScopeHelp();
  const globalSelect = createModeSelect(autoApproval.globalMode, scopeHelp.global, async (nextMode) => {
    const nextState = await window.calder.governance.setAutoApprovalMode(
      projectPath,
      'global',
      nextMode,
      sessionId,
    );
    appState.setProjectGovernance(projectId, nextState);
    void refresh();
  });
  controls.appendChild(createAutoApprovalScopeCard(
    globalPolicyLabel,
    localizedText(
      `${scopeHelp.global} Current: ${scopeSummary.global}.`,
      `${scopeHelp.global} Şu an: ${scopeSummary.global}.`,
    ),
    globalSelect,
  ));

  const projectSelect = document.createElement('select');
  projectSelect.className = 'auto-approval-select';
  projectSelect.title = scopeHelp.project;
  const projectInheritOption = document.createElement('option');
  projectInheritOption.value = PROJECT_INHERIT_VALUE;
  projectInheritOption.textContent = projectInheritLabel();
  if (autoApproval.projectMode === undefined) {
    projectInheritOption.selected = true;
  }
  projectSelect.appendChild(projectInheritOption);
  for (const option of AUTO_APPROVAL_MODE_OPTIONS) {
    const el = document.createElement('option');
    el.value = option.value;
    el.textContent = autoApprovalModeLabel(option.value);
    if (autoApproval.projectMode === option.value) {
      el.selected = true;
    }
    projectSelect.appendChild(el);
  }
  projectSelect.addEventListener('change', async () => {
    const selectedMode = projectSelect.value === PROJECT_INHERIT_VALUE
      ? null
      : (projectSelect.value as AutoApprovalMode);
    projectSelect.disabled = true;
    try {
      const nextState = await window.calder.governance.setAutoApprovalMode(
        projectPath,
        'project',
        selectedMode,
        sessionId,
      );
      appState.setProjectGovernance(projectId, nextState);
      void refresh();
    } finally {
      projectSelect.disabled = false;
    }
  });
  controls.appendChild(createAutoApprovalScopeCard(
    projectPolicyLabel,
    localizedText(
      `${scopeHelp.project} Current: ${scopeSummary.project}.`,
      `${scopeHelp.project} Şu an: ${scopeSummary.project}.`,
    ),
    projectSelect,
  ));

  const sessionSelect = document.createElement('select');
  sessionSelect.className = 'auto-approval-select';
  sessionSelect.title = supportsPermissionHooks
    ? scopeHelp.session
    : localizedText('Auto approval unavailable', 'Otomatik onay kullanılamıyor');
  const inheritOption = document.createElement('option');
  inheritOption.value = SESSION_INHERIT_VALUE;
  inheritOption.textContent = sessionInheritLabel();
  sessionSelect.appendChild(inheritOption);
  for (const option of AUTO_APPROVAL_MODE_OPTIONS) {
    const el = document.createElement('option');
    el.value = option.value;
    el.textContent = autoApprovalModeLabel(option.value);
    if (autoApproval.sessionMode === option.value) {
      el.selected = true;
    }
    sessionSelect.appendChild(el);
  }
  if (autoApproval.sessionMode === undefined) {
    inheritOption.selected = true;
  }
  sessionSelect.disabled = !sessionId || !supportsPermissionHooks;
  sessionSelect.addEventListener('change', async () => {
    if (!sessionId) return;
    const selectedMode = sessionSelect.value === SESSION_INHERIT_VALUE
      ? null
      : (sessionSelect.value as AutoApprovalMode);
    sessionSelect.disabled = true;
    try {
      await window.calder.governance.setSessionAutoApprovalOverride(sessionId, selectedMode);
      const nextState = await window.calder.governance.getProjectState(projectPath, sessionId);
      appState.setProjectGovernance(projectId, nextState);
      void refresh();
    } finally {
      sessionSelect.disabled = false;
    }
  });
  controls.appendChild(createAutoApprovalScopeCard(
    sessionPolicyLabel,
    !supportsPermissionHooks
      ? localizedText(
        'Active provider does not support permission hooks, so session auto-approval cannot run.',
        'Aktif sağlayıcı izin hooklarını desteklemediği için oturum otomatik onayı çalışmaz.',
      )
      : (sessionId
        ? localizedText(
          `${scopeHelp.session} Current: ${scopeSummary.session}.`,
          `${scopeHelp.session} Şu an: ${scopeSummary.session}.`,
        )
        : localizedText(
          'Open a CLI session to apply a temporary session override.',
          'Geçici oturum politikası uygulamak için bir CLI oturumu açın.',
        )),
    sessionSelect,
  ));

  controls.appendChild(createModeGuide(esc));
  details.appendChild(controls);
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
