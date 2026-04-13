import type { SurfacePromptPayload } from '../../../shared/types.js';
import { appendAppliedContextToPrompt } from '../../project-context-prompt.js';
import {
  deliverSurfacePrompt,
  queueSurfacePromptInCustomSession,
  queueSurfacePromptInNewSession,
} from '../surface-routing.js';

function buildCliInspectPrompt(payload: SurfacePromptPayload): string {
  const contextMode = payload.contextMode
    ?? (payload.selectionSource === 'inferred' || payload.selectionSource === 'semantic'
      ? 'selection-nearby'
      : 'selection-only');
  const selectionKind = payload.selectionSource === 'inferred'
    ? 'inferred panel'
    : payload.selectionSource === 'semantic'
      ? 'semantic target'
      : `exact ${payload.selection.mode}`;
  const semanticTarget = payload.semanticNodeId
    ? payload.semanticLabel && payload.semanticLabel !== payload.semanticNodeId
      ? `${payload.semanticLabel} (${payload.semanticNodeId})`
      : payload.semanticNodeId
    : null;
  const adapterMeta = payload.adapterMeta ?? {};
  const framework = typeof adapterMeta.framework === 'string' ? adapterMeta.framework : null;
  const widgetName = typeof adapterMeta.widgetName === 'string' ? adapterMeta.widgetName : null;
  const focusPath = Array.isArray(adapterMeta.focusPath)
    ? adapterMeta.focusPath.filter((value): value is string => typeof value === 'string').join(' > ')
    : null;
  const stateSummary = typeof adapterMeta.stateSummary === 'string' ? adapterMeta.stateSummary : null;
  const contextSummary = contextMode === 'selection-nearby-viewport'
    ? 'selection + nearby context + visible viewport'
    : contextMode === 'selection-nearby'
      ? 'selection + nearby context'
      : 'selection only';
  const prompt = [
    'Terminal capture from CLI surface:',
    '',
    `Project: ${payload.projectPath}`,
    `Command: ${payload.command ?? 'unknown'}`,
    `Selection: ${selectionKind}`,
    `Context: ${contextSummary}`,
    payload.inferredLabel ? `Inferred panel: ${payload.inferredLabel}` : null,
    semanticTarget ? `Semantic target: ${semanticTarget}` : null,
    payload.sourceFile ? `Source file: ${payload.sourceFile}` : null,
    framework ? `Framework: ${framework}` : null,
    widgetName ? `Widget: ${widgetName}` : null,
    focusPath ? `Focus path: ${focusPath}` : null,
    stateSummary ? `State: ${stateSummary}` : null,
    '',
    'Selected terminal output:',
    payload.selectedText,
    ...(contextMode === 'selection-nearby' || contextMode === 'selection-nearby-viewport'
      ? [
          '',
          'Nearby terminal context:',
          payload.nearbyText,
        ]
      : []),
    ...(contextMode === 'selection-nearby-viewport'
      ? [
          '',
          'Visible terminal viewport:',
          payload.viewportText,
        ]
      : []),
  ]
    .filter((line): line is string => Boolean(line))
    .join('\n');
  return appendAppliedContextToPrompt(prompt, payload.appliedContext);
}

export async function sendCliSelectionToSelectedSession(payload: SurfacePromptPayload) {
  return deliverSurfacePrompt(payload.projectId, buildCliInspectPrompt(payload));
}

export function sendCliSelectionToNewSession(payload: SurfacePromptPayload, sessionName: string) {
  return queueSurfacePromptInNewSession(payload.projectId, sessionName, buildCliInspectPrompt(payload));
}

export function sendCliSelectionToCustomSession(payload: SurfacePromptPayload, onReady: () => void) {
  return queueSurfacePromptInCustomSession(buildCliInspectPrompt(payload), onReady);
}
