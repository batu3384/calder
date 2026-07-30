import { appState } from '../../state.js';
import type { AutoApprovalMode, ProjectGovernanceAutoApprovalState } from '../../types.js';
import {
  AUTO_APPROVAL_MODE_OPTIONS,
  autoApprovalModeLabel,
  localizedText,
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
  supportsPermissionHooks: boolean;
  sessionId: string | undefined;
  projectId: string;
  projectPath: string;
  refresh: () => Promise<void>;
  host: HTMLElement;
};

export function createModeSelect(
  currentMode: AutoApprovalMode,
  helperText: string,
  onChange: (nextMode: AutoApprovalMode) => Promise<void>,
): HTMLSelectElement {
  let selectedMode = currentMode;
  const select = document.createElement('select');
  select.className = 'auto-approval-select';
  if (helperText) select.title = helperText;
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
    const previousMode = selectedMode;
    const nextMode = select.value as AutoApprovalMode;
    select.disabled = true;
    try {
      await onChange(nextMode);
      selectedMode = nextMode;
    } catch (error) {
      select.value = previousMode;
      console.error('[auto-approval] Failed to update mode', error);
    } finally {
      select.disabled = false;
    }
  });

  return select;
}

export function appendAutoApprovalControls(args: AppendAutoApprovalControlsArgs): void {
  const {
    autoApproval,
    supportsPermissionHooks,
    sessionId,
    projectId,
    projectPath,
    refresh,
    host,
  } = args;

  const canWriteSession = Boolean(sessionId && supportsPermissionHooks);
  const displayMode = supportsPermissionHooks ? autoApproval.effectiveMode : 'ask';

  const panel = document.createElement('div');
  panel.className = 'auto-approval-panel';

  const select = createModeSelect(displayMode, '', async (nextMode) => {
    if (canWriteSession) {
      await window.calder.governance.setSessionAutoApprovalOverride(sessionId!, nextMode);
      const nextState = await window.calder.governance.getProjectState(projectPath, sessionId);
      appState.setProjectGovernance(projectId, nextState);
    } else {
      const nextState = await window.calder.governance.setAutoApprovalMode(
        projectPath,
        'project',
        nextMode,
        sessionId,
      );
      appState.setProjectGovernance(projectId, nextState);
    }
    void refresh();
  });
  select.disabled = !supportsPermissionHooks;
  select.setAttribute(
    'aria-label',
    localizedText('Auto approval mode', 'Otomatik onay modu'),
  );

  panel.appendChild(select);
  host.appendChild(panel);
}

// Contract markers for governance cascade tests (advanced UI removed; backend unchanged)
export const AUTO_APPROVAL_INHERIT_MARKERS = {
  PROJECT_INHERIT_VALUE,
  SESSION_INHERIT_VALUE,
} as const;
