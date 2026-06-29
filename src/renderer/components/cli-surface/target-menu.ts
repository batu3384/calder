import { appState } from '../../state.js';
import { anchorFloatingSurface } from '../floating-surface.js';
import { renderCliTargetMenuList, syncCliTargetControls } from './target-menu-render-helpers.js';

interface CliTargetMenuElements {
  composerEl: HTMLDivElement;
  selectedButton: HTMLButtonElement;
  newButton: HTMLButtonElement;
  customButton: HTMLButtonElement;
  targetMenuEl: HTMLDivElement;
  targetMenuListEl: HTMLDivElement;
}

interface CliTargetMenuControllerOptions {
  projectId: string;
  elements: CliTargetMenuElements;
  hasPayload: () => boolean;
  onSendToNew: () => void;
  onSendToCustom: () => void;
}

export interface CliTargetMenuController {
  closeMenu: () => void;
  openMenu: () => void;
  syncControls: () => void;
}

export function createCliTargetMenuController(
  options: CliTargetMenuControllerOptions,
): CliTargetMenuController {
  const { projectId, elements, hasPayload, onSendToNew, onSendToCustom } = options;
  const { composerEl, selectedButton, newButton, customButton, targetMenuEl, targetMenuListEl } =
    elements;
  let targetMenuCleanup: (() => void) | undefined;

  const closeMenu = (): void => {
    targetMenuCleanup?.();
    targetMenuCleanup = undefined;
    targetMenuEl.style.display = 'none';
  };

  const renderMenu = (): void => {
    const targetSessions = appState.listSurfaceTargetSessions(projectId);
    const selectedTarget = appState.resolveSurfaceTargetSession(projectId);
    const payloadReady = hasPayload();
    renderCliTargetMenuList({
      targetMenuListEl,
      targetSessions,
      selectedTargetId: selectedTarget?.id,
      activeSessionId: appState.activeProject?.activeSessionId,
      payloadReady,
      onSelectSession: (sessionId) => {
        appState.setSurfaceTargetSession(projectId, sessionId);
        controller.syncControls();
      },
      onSendToNew,
      onSendToCustom,
      closeMenu: controller.closeMenu,
    });
  };

  const openMenu = (): void => {
    if (targetMenuEl.style.display !== 'none') {
      closeMenu();
      return;
    }

    renderMenu();
    targetMenuEl.style.display = 'flex';
    targetMenuCleanup?.();
    try {
      targetMenuCleanup = anchorFloatingSurface(customButton, targetMenuEl, {
        placement: 'bottom-end',
        offsetPx: 6,
        maxWidthPx: 300,
        maxHeightPx: 360,
      });
    } catch {
      targetMenuCleanup = undefined;
    }
  };

  const syncControls = (): void => {
    const selectedTarget = appState.resolveSurfaceTargetSession(projectId);
    const payloadReady = hasPayload();
    syncCliTargetControls({
      composerEl,
      selectedButton,
      newButton,
      customButton,
      selectedTarget: selectedTarget ?? null,
      payloadReady,
    });

    if (targetMenuEl.style.display !== 'none') {
      renderMenu();
    }
  };

  const controller: CliTargetMenuController = {
    closeMenu,
    openMenu,
    syncControls,
  };

  return controller;
}
