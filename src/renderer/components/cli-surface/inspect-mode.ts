import type { SurfacePromptPayload, SurfaceSelectionRange } from '../../../shared/types.js';

export interface CliInspectState {
  active: boolean;
  selection: SurfaceSelectionRange | null;
  payload: SurfacePromptPayload | null;
}

export function createInitialInspectState(): CliInspectState {
  return {
    active: false,
    selection: null,
    payload: null,
  };
}

export function openInspect(state: CliInspectState): CliInspectState {
  return {
    ...state,
    active: true,
  };
}

export function closeInspect(state: CliInspectState): CliInspectState {
  return {
    ...state,
    active: false,
    selection: null,
    payload: null,
  };
}

export function setInspectPayload(
  state: CliInspectState,
  selection: SurfaceSelectionRange,
  payload: SurfacePromptPayload,
): CliInspectState {
  return {
    ...state,
    active: true,
    selection,
    payload,
  };
}
