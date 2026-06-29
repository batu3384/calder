import { appState } from '../../state.js';
import type { AutoApprovalMode, ProjectGovernanceAutoApprovalState } from '../../types.js';
import {
  AUTO_APPROVAL_MODE_OPTIONS,
  autoApprovalModeGuideSummary,
  autoApprovalModeLabel,
  autoApprovalScopeHelp,
  localizedText,
  projectInheritLabel,
  sessionInheritLabel,
} from './config-sections-auto-approval-i18n.js';

const PROJECT_INHERIT_VALUE = '__inherit_global__';
const SESSION_INHERIT_VALUE = '';

export type AutoApprovalScopeSummary = {
  global: string;
  project: string;
  session: string;
  effectiveSource: string;
  effectiveExplanation: string;
  effectiveBehavior: string;
  effectiveAutoRuns: string;
  effectiveStillAsks: string;
};

type AppendAutoApprovalControlsArgs = {
  autoApproval: ProjectGovernanceAutoApprovalState;
  scopeSummary: AutoApprovalScopeSummary;
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

  const titleElement = document.createElement('div');
  titleElement.className = 'auto-approval-scope-title';
  titleElement.textContent = title;

  const control = document.createElement('div');
  control.className = 'auto-approval-scope-control';
  control.appendChild(select);
  row.appendChild(titleElement);
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
    const optionElement = document.createElement('option');
    optionElement.value = option.value;
    optionElement.textContent = autoApprovalModeLabel(option.value);
    if (option.value === currentMode) {
      optionElement.selected = true;
    }
    select.appendChild(optionElement);
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
      <span class="auto-approval-mode-guide-row-label">${esc(autoApprovalModeLabel(option.value))}</span>
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

export function appendAutoApprovalControls(args: AppendAutoApprovalControlsArgs): void {
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
  const globalSelect = createModeSelect(
    autoApproval.globalMode,
    scopeHelp.global,
    async (nextMode) => {
      const nextState = await window.calder.governance.setAutoApprovalMode(
        projectPath,
        'global',
        nextMode,
        sessionId,
      );
      appState.setProjectGovernance(projectId, nextState);
      void refresh();
    },
  );
  controls.appendChild(
    createAutoApprovalScopeCard(
      globalPolicyLabel,
      localizedText(
        `${scopeHelp.global} Current: ${scopeSummary.global}.`,
        `${scopeHelp.global} Şu an: ${scopeSummary.global}.`,
      ),
      globalSelect,
    ),
  );

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
    const optionElement = document.createElement('option');
    optionElement.value = option.value;
    optionElement.textContent = autoApprovalModeLabel(option.value);
    if (autoApproval.projectMode === option.value) {
      optionElement.selected = true;
    }
    projectSelect.appendChild(optionElement);
  }

  projectSelect.addEventListener('change', async () => {
    const selectedMode =
      projectSelect.value === PROJECT_INHERIT_VALUE
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

  controls.appendChild(
    createAutoApprovalScopeCard(
      projectPolicyLabel,
      localizedText(
        `${scopeHelp.project} Current: ${scopeSummary.project}.`,
        `${scopeHelp.project} Şu an: ${scopeSummary.project}.`,
      ),
      projectSelect,
    ),
  );

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
    const optionElement = document.createElement('option');
    optionElement.value = option.value;
    optionElement.textContent = autoApprovalModeLabel(option.value);
    if (autoApproval.sessionMode === option.value) {
      optionElement.selected = true;
    }
    sessionSelect.appendChild(optionElement);
  }

  if (autoApproval.sessionMode === undefined) {
    inheritOption.selected = true;
  }
  sessionSelect.disabled = !sessionId || !supportsPermissionHooks;
  sessionSelect.addEventListener('change', async () => {
    if (!sessionId) return;
    const selectedMode =
      sessionSelect.value === SESSION_INHERIT_VALUE
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

  controls.appendChild(
    createAutoApprovalScopeCard(
      sessionPolicyLabel,
      !supportsPermissionHooks
        ? localizedText(
            'Active provider does not support permission hooks, so session auto-approval cannot run.',
            'Aktif sağlayıcı izin hooklarını desteklemediği için oturum otomatik onayı çalışmaz.',
          )
        : sessionId
          ? localizedText(
              `${scopeHelp.session} Current: ${scopeSummary.session}.`,
              `${scopeHelp.session} Şu an: ${scopeSummary.session}.`,
            )
          : localizedText(
              'Open a CLI session to apply a temporary session override.',
              'Geçici oturum politikası uygulamak için bir CLI oturumu açın.',
            ),
      sessionSelect,
    ),
  );

  controls.appendChild(createModeGuide(esc));
  details.appendChild(controls);
}
