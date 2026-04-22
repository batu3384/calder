import type { ProjectRecord } from '../../state.js';
import type { CliSurfaceProfile, ProjectSurfaceRecord, SurfaceKind } from '../../../shared/types/project.js';
import { createCustomSelect, type CustomSelectInstance } from '../custom-select.js';

interface CreateTabBarSurfaceControlsControllerOptions {
  surfaceModeSlotEl: HTMLElement;
  surfaceProfileSlotEl: HTMLElement;
  getActiveProject: () => ProjectRecord | null | undefined;
  buildSurfaceControlsSignature: (project: ProjectRecord) => string;
  getProjectSurface: (project: ProjectRecord) => ProjectSurfaceRecord;
  getCliSurfaceProfileLabel: (profile: CliSurfaceProfile) => string;
  selectCliSurfaceProfile: (project: ProjectRecord, profiles: CliSurfaceProfile[], selectedProfileId: string) => void;
  activateLiveViewSurface: (project: ProjectRecord) => void;
  activateCliSurface: (project: ProjectRecord) => void | Promise<void>;
  activateMobileSurface: (project: ProjectRecord) => void;
  promptCliSurfaceProfile: (
    project: ProjectRecord,
    existing?: CliSurfaceProfile,
    onReady?: (profile: CliSurfaceProfile) => void,
  ) => void;
  onProfileSelectOpenChange: (open: boolean) => void;
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
    surfaceProfileSlotEl,
    getActiveProject,
    buildSurfaceControlsSignature,
    getProjectSurface,
    getCliSurfaceProfileLabel,
    selectCliSurfaceProfile,
    activateLiveViewSurface,
    activateCliSurface,
    activateMobileSurface,
    promptCliSurfaceProfile,
    onProfileSelectOpenChange,
  } = options;
  let surfaceProfileSelect: CustomSelectInstance | null = null;
  let surfaceControlsSignature = '';

  function destroySurfaceProfileSelector(): void {
    if (surfaceProfileSelect) {
      surfaceProfileSelect.destroy();
      surfaceProfileSelect = null;
    }
    onProfileSelectOpenChange(false);
    surfaceControlsSignature = '';
    surfaceModeSlotEl.innerHTML = '';
    surfaceModeSlotEl.hidden = true;
    surfaceProfileSlotEl.innerHTML = '';
    surfaceProfileSlotEl.hidden = true;
  }

  function createModeButton(project: ProjectRecord, activeKind: SurfaceKind, kind: SurfaceKind, label: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'surface-mode-button';
    button.dataset.surfaceKind = kind;
    button.textContent = label;
    button.classList.toggle('active', activeKind === kind && getProjectSurface(project).active);
    button.addEventListener('click', () => {
      if (kind === 'web') activateLiveViewSurface(project);
      else if (kind === 'cli') void activateCliSurface(project);
      else activateMobileSurface(project);
    });
    return button;
  }

  function renderSurfaceControls(): void {
    const project = getActiveProject();
    if (!project) {
      if (surfaceControlsSignature || surfaceModeSlotEl.childElementCount > 0 || surfaceProfileSlotEl.childElementCount > 0) {
        destroySurfaceProfileSelector();
      }
      return;
    }

    const nextSignature = buildSurfaceControlsSignature(project);
    if (nextSignature === surfaceControlsSignature) return;

    destroySurfaceProfileSelector();
    surfaceControlsSignature = nextSignature;

    const surface = getProjectSurface(project);
    const switcher = document.createElement('div');
    switcher.className = 'surface-mode-switcher';

    ([
      { kind: 'web' as const, label: 'Live View' },
      { kind: 'cli' as const, label: 'CLI Surface' },
      { kind: 'mobile' as const, label: 'Mobile' },
    ]).forEach(({ kind, label }) => {
      switcher.appendChild(createModeButton(project, surface.kind, kind, label));
    });

    surfaceModeSlotEl.hidden = false;
    surfaceModeSlotEl.appendChild(switcher);

    if (surface.kind !== 'cli') return;

    const group = document.createElement('div');
    group.className = 'surface-profile-group';
    const profiles = surface.cli?.profiles ?? [];
    const selectedProfile = profiles.find((profile) => profile.id === surface.cli?.selectedProfileId) ?? profiles[0];

    if (profiles.length > 0) {
      const select = createCustomSelect(
        'command-deck-cli-profile',
        [
          ...profiles.map((profile) => ({ value: profile.id, label: getCliSurfaceProfileLabel(profile) })),
          { value: '__new__', label: '+ New profile\u2026' },
        ],
        selectedProfile?.id,
        {
          floating: {
            placement: 'bottom-end',
            offsetPx: 8,
            maxWidthPx: 320,
            maxHeightPx: 320,
            strategy: 'fixed',
          },
          onOpenChange: (open) => onProfileSelectOpenChange(open),
        },
      );
      select.element.classList.add('command-deck-cli-profile-select');
      const hiddenInput = select.element.querySelector('#command-deck-cli-profile') as HTMLInputElement | null;
      hiddenInput?.addEventListener('change', () => {
        const value = hiddenInput.value;
        if (value === '__new__') {
          promptCliSurfaceProfile(project);
          return;
        }
        selectCliSurfaceProfile(project, profiles, value);
      });
      group.appendChild(select.element);
      surfaceProfileSelect = select;
    }

    const configureButton = document.createElement('button');
    configureButton.type = 'button';
    configureButton.className = 'surface-profile-config';
    configureButton.dataset.role = profiles.length > 0 ? 'edit-profile' : 'setup-profile';
    configureButton.textContent = profiles.length > 0 ? 'Edit' : 'Set up';
    configureButton.addEventListener('click', () => {
      promptCliSurfaceProfile(project, selectedProfile);
    });
    group.appendChild(configureButton);

    surfaceProfileSlotEl.hidden = false;
    surfaceProfileSlotEl.appendChild(group);
  }

  return {
    renderSurfaceControls,
    destroySurfaceProfileSelector,
  };
}
