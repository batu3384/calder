import type { ProjectSurfaceRecord } from '../../../shared/types/project-surface.js';
import type { ProjectRecord } from '../../state.js';

interface CreateTabBarSurfaceControlsControllerOptions {
  surfaceModeSlotEl: HTMLElement;
  getActiveProject: () => ProjectRecord | null | undefined;
  buildSurfaceControlsSignature: (project: ProjectRecord) => string;
  getProjectSurface: (project: ProjectRecord) => ProjectSurfaceRecord;
  activateLiveViewSurface: (project: ProjectRecord) => void;
}

export interface TabBarSurfaceControlsController {
  renderSurfaceControls: () => void;
  destroySurfaceProfileSelector: () => void;
}

export function createTabBarSurfaceControlsController(
  options: CreateTabBarSurfaceControlsControllerOptions,
): TabBarSurfaceControlsController {
  const {
    surfaceModeSlotEl,
    getActiveProject,
    buildSurfaceControlsSignature,
    getProjectSurface,
    activateLiveViewSurface,
  } = options;
  let surfaceControlsSignature = '';

  function destroySurfaceProfileSelector(): void {
    surfaceControlsSignature = '';
    surfaceModeSlotEl.innerHTML = '';
    surfaceModeSlotEl.hidden = true;
  }

  function renderSurfaceControls(): void {
    const project = getActiveProject();
    if (!project) {
      if (surfaceControlsSignature || surfaceModeSlotEl.childElementCount > 0) {
        destroySurfaceProfileSelector();
      }
      return;
    }

    const nextSignature = buildSurfaceControlsSignature(project);
    if (nextSignature === surfaceControlsSignature) return;

    destroySurfaceProfileSelector();
    surfaceControlsSignature = nextSignature;

    const surface = getProjectSurface(project);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'surface-live-view-btn';
    button.dataset.surfaceKind = 'web';
    button.textContent = 'Live View';
    button.setAttribute('aria-pressed', String(surface.kind === 'web' && surface.active));
    button.classList.toggle('active', surface.kind === 'web' && surface.active);
    button.addEventListener('click', () => activateLiveViewSurface(project));

    surfaceModeSlotEl.hidden = false;
    surfaceModeSlotEl.appendChild(button);
  }

  return {
    renderSurfaceControls,
    destroySurfaceProfileSelector,
  };
}
