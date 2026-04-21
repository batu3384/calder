import { appState, type SessionRecord } from '../state.js';
import type { ProviderId } from '../../shared/types.js';
import { closeModal, showModal, type FieldDef } from './modal.js';
import { showJoinDialog } from './join-dialog.js';
import {
  getProviderAvailabilitySnapshot,
  loadProviderAvailability,
  resolvePreferredProviderForLaunch,
} from '../provider-availability.js';

interface CreateTabBarSessionMenuControllerOptions {
  hideTabContextMenu: () => void;
  setActiveContextMenu: (menu: HTMLElement | null) => void;
  applyContextMenuSemantics: (menu: HTMLElement, label: string, focusFirstItem?: boolean) => void;
}

export interface TabBarSessionMenuController {
  quickNewSession: () => void;
  showAddSessionContextMenu: (x: number, y: number) => void;
  promptNewSession: (onCreated?: (session: SessionRecord) => void) => Promise<void>;
}

export function createTabBarSessionMenuController(
  options: CreateTabBarSessionMenuControllerOptions,
): TabBarSessionMenuController {
  const { hideTabContextMenu, setActiveContextMenu, applyContextMenuSemantics } = options;

  function quickNewSession(): void {
    const project = appState.activeProject;
    if (!project) return;
    (document.activeElement as HTMLElement)?.blur?.();
    void (async () => {
      let providerSnapshot = getProviderAvailabilitySnapshot();
      if (!providerSnapshot) {
        try {
          await loadProviderAvailability();
          providerSnapshot = getProviderAvailabilitySnapshot();
        } catch (error) {
          console.warn('[tab-bar] Failed to refresh provider availability for quick session launch', error);
        }
      }
      const refreshedProject = appState.projects.find((entry) => entry.id === project.id);
      if (!refreshedProject) return;
      const sessionNum = refreshedProject.sessions.length + 1;
      const providerId = resolvePreferredProviderForLaunch(
        appState.preferences.defaultProvider,
        providerSnapshot,
      );
      appState.addSession(refreshedProject.id, `Session ${sessionNum}`, undefined, providerId);
    })();
  }

  async function promptNewSession(onCreated?: (session: SessionRecord) => void): Promise<void> {
    const project = appState.activeProject;
    if (!project) return;

    const sessionNum = project.sessions.length + 1;

    let providerSnapshot = getProviderAvailabilitySnapshot();
    if (!providerSnapshot) {
      await loadProviderAvailability();
      providerSnapshot = getProviderAvailabilitySnapshot();
    }
    const providers = providerSnapshot?.providers ?? [];
    const availabilityMap = providerSnapshot?.availability ?? new Map();

    const fields: FieldDef[] = [
      { label: 'Name', id: 'session-name', placeholder: `Session ${sessionNum}`, defaultValue: `Session ${sessionNum}` },
      { label: 'Arguments', id: 'session-args', placeholder: 'e.g. --model sonnet', defaultValue: project.defaultArgs ?? '' },
      {
        label: 'Keep args for future sessions',
        id: 'keep-args',
        type: 'checkbox',
        defaultValue: project.defaultArgs ? 'true' : undefined,
      },
    ];

    if (providers.length > 1) {
      const preferred = resolvePreferredProviderForLaunch(appState.preferences.defaultProvider, providerSnapshot);
      fields.unshift({
        label: 'Provider',
        id: 'provider',
        type: 'select',
        defaultValue: preferred,
        options: providers.map((provider) => {
          const available = availabilityMap.get(provider.id);
          return {
            value: provider.id,
            label: available ? provider.displayName : `${provider.displayName} (not installed)`,
            disabled: !available,
          };
        }),
      });
    }

    showModal('New Session', fields, (values) => {
      const name = values['session-name']?.trim();
      if (name) {
        closeModal();
        const args = values['session-args']?.trim() || undefined;
        const keepArgs = values['keep-args'] === 'true';
        project.defaultArgs = keepArgs ? (args || undefined) : undefined;
        const providerId = (values['provider'] || 'claude') as ProviderId;
        const session = appState.addSession(project.id, name, args, providerId);
        if (session && onCreated) onCreated(session);
      }
    });
  }

  function showAddSessionContextMenu(x: number, y: number): void {
    hideTabContextMenu();

    const menu = document.createElement('div');
    menu.className = 'tab-context-menu calder-floating-list';
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    menu.addEventListener('click', (event) => event.stopPropagation());

    const quickItem = document.createElement('div');
    quickItem.className = 'tab-context-menu-item';
    quickItem.textContent = 'New Session';
    quickItem.addEventListener('click', (event) => {
      event.stopPropagation();
      hideTabContextMenu();
      quickNewSession();
    });

    const customItem = document.createElement('div');
    customItem.className = 'tab-context-menu-item';
    customItem.textContent = 'New Custom Session\u2026';
    customItem.addEventListener('click', (event) => {
      event.stopPropagation();
      hideTabContextMenu();
      void promptNewSession();
    });

    const joinSeparator = document.createElement('div');
    joinSeparator.className = 'tab-context-menu-separator';

    const joinItem = document.createElement('div');
    joinItem.className = 'tab-context-menu-item';
    joinItem.textContent = 'Join Remote Session\u2026';
    joinItem.addEventListener('click', (event) => {
      event.stopPropagation();
      hideTabContextMenu();
      showJoinDialog();
    });

    const browserItem = document.createElement('div');
    browserItem.className = 'tab-context-menu-item';
    browserItem.textContent = 'New Browser Tab';
    browserItem.addEventListener('click', (event) => {
      event.stopPropagation();
      hideTabContextMenu();
      const project = appState.activeProject;
      if (project) appState.addBrowserTabSession(project.id);
    });

    menu.appendChild(quickItem);
    menu.appendChild(customItem);
    menu.appendChild(browserItem);
    menu.appendChild(joinSeparator);
    menu.appendChild(joinItem);
    document.body.appendChild(menu);
    setActiveContextMenu(menu);

    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) menu.style.left = `${window.innerWidth - rect.width - 4}px`;
    if (rect.bottom > window.innerHeight) menu.style.top = `${window.innerHeight - rect.height - 4}px`;
    applyContextMenuSemantics(menu, 'New session actions');
  }

  return {
    quickNewSession,
    showAddSessionContextMenu,
    promptNewSession,
  };
}
