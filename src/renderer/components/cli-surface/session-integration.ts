import type { SurfacePromptPayload } from '../../../shared/types.js';
import {
  deliverSurfacePrompt,
  queueSurfacePromptInCustomSession,
  queueSurfacePromptInNewSession,
} from '../surface-routing.js';

function buildCliInspectPrompt(payload: SurfacePromptPayload): string {
  return [
    'CLI surface selection:',
    '',
    `Project: ${payload.projectPath}`,
    `Command: ${payload.command ?? 'unknown'}`,
    `Selection mode: ${payload.selection.mode}`,
    payload.inferredLabel ? `Inferred region: ${payload.inferredLabel}` : null,
    '',
    'Selected region:',
    payload.selectedText,
    '',
    'Nearby context:',
    payload.nearbyText,
    '',
    'Visible viewport:',
    payload.viewportText,
  ]
    .filter((line): line is string => Boolean(line))
    .join('\n');
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
