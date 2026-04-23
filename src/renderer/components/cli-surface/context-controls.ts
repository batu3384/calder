import type { AppliedContextSummary } from '../../../shared/types/project-context.js';
import type { CliSurfacePromptContextMode } from '../../../shared/types/project-core.js';
import { formatAppliedContextTrace } from '../../project-context-prompt.js';

type CliSelectionSource = 'exact' | 'inferred' | 'semantic';

export function getContextModeForSelection(
  contextModeOverride: CliSurfacePromptContextMode | null,
  selectionSource: CliSelectionSource,
): CliSurfacePromptContextMode {
  if (contextModeOverride) {
    return contextModeOverride;
  }
  return selectionSource === 'exact' ? 'selection-only' : 'selection-nearby';
}

function describeContextMode(mode: CliSurfacePromptContextMode): string {
  switch (mode) {
    case 'selection-nearby':
      return 'Selection + nearby lines';
    case 'selection-nearby-viewport':
      return 'Selection + visible viewport';
    default:
      return 'Selection only';
  }
}

export function syncComposerContextControl(
  contextModeOverride: CliSurfacePromptContextMode | null,
  composerContextSelectEl: HTMLSelectElement,
  composerScopeEl: HTMLDivElement,
  mode: CliSurfacePromptContextMode,
): void {
  composerContextSelectEl.value = contextModeOverride ?? 'auto';
  composerScopeEl.textContent = `Will send: ${describeContextMode(mode)}`;
}

export function syncComposerContextTrace(
  composerContextTraceEl: HTMLDivElement,
  appliedContext?: AppliedContextSummary,
): void {
  if (!appliedContext) {
    composerContextTraceEl.textContent = '';
    composerContextTraceEl.style.display = 'none';
    return;
  }
  const lines = formatAppliedContextTrace(appliedContext);
  composerContextTraceEl.textContent = `Applied context:\n${lines.join('\n')}`;
  composerContextTraceEl.style.display = 'block';
}
