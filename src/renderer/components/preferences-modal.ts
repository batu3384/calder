import { appState } from '../state.js';
import {
  closeModal,
  extendModalCleanup,
  prepareModalSurface,
  runModalCleanup,
} from './modal.js';
import type { CustomSelectInstance } from './custom-select.js';
import { shortcutManager } from '../shortcuts.js';
import {
  appendOverviewGrid as appendOverviewGridLayout,
  appendSectionCard as appendSectionCardLayout,
  appendSectionGroup as appendSectionGroupLayout,
  appendSectionIntro as appendSectionIntroLayout,
} from './preferences-layout.js';
import {
  resolveSetupBadgeHasIssue,
} from './preferences-provider-setup.js';
import { buildCheckpointRestoreConfirm } from './preferences-checkpoint-confirm.js';
import { renderShortcutsSection } from './preferences-shortcuts-section.js';
import {
  renderAboutPreferencesSection,
  renderGeneralPreferencesSection,
  renderLayoutPreferencesSection,
  renderProvidersPreferencesSection,
} from './preferences-modal-sections.js';
import type { ProviderId, UiLanguage } from '../../shared/types/provider.js';
import type { MobileDependencyId } from '../../shared/types/mobile.js';


const overlay = document.getElementById('modal-overlay')!;
const modal = document.getElementById('modal')!;
const titleEl = document.getElementById('modal-title')!;
const bodyEl = document.getElementById('modal-body')!;
const btnCancel = document.getElementById('modal-cancel') as HTMLButtonElement;
const btnConfirm = document.getElementById('modal-confirm') as HTMLButtonElement;

type Section = 'general' | 'layout' | 'providers' | 'shortcuts' | 'about';
function appendSectionIntro(container: HTMLElement, eyebrow: string, title: string, description: string): void {
  // preferences-section-intro
  appendSectionIntroLayout(container, eyebrow, title, description);
}

function appendSectionCard(container: HTMLElement, title: string, description?: string): HTMLElement {
  // preferences-section-card
  return appendSectionCardLayout(container, title, description);
}

function appendSectionGroup(
  container: HTMLElement,
  eyebrow: string,
  title: string,
  description: string,
): HTMLElement {
  // preferences-subsection + preferences-subsection-grid
  return appendSectionGroupLayout(container, eyebrow, title, description);
}

function appendOverviewGrid(
  container: HTMLElement,
  items: Array<{ label: string; value: string; note?: string }>,
): void {
  // preferences-overview-grid
  appendOverviewGridLayout(container, items);
}

export function showPreferencesModal(): void {
  renderPreferencesModalContent();
}

function renderPreferencesModalContent(): void {
  prepareModalSurface();
  titleEl.textContent = 'Workspace Center';
  bodyEl.innerHTML = '';
  modal.classList.add('modal-wide');
  bodyEl.classList.add('preferences-body');

  // Build two-pane layout
  const layout = document.createElement('div');
  layout.className = 'preferences-layout preferences-shell';

  // Side menu
  const menu = document.createElement('div');
  menu.className = 'preferences-menu';

  const menuHeader = document.createElement('div');
  menuHeader.className = 'preferences-menu-header';
  menuHeader.innerHTML = `
    <div class="preferences-menu-kicker shell-kicker">Calder</div>
    <div class="preferences-menu-title">Calder workspace</div>
    <div class="preferences-menu-caption">Defaults, layout, integrations, and the rules that shape every session.</div>
  `;
  menu.appendChild(menuHeader);

  const sections: { id: Section; label: string; caption: string }[] = [
    { id: 'general', label: 'Session', caption: 'How Calder starts and remembers work' },
    { id: 'layout', label: 'Layout', caption: 'Surface and rail visibility defaults' },
    { id: 'shortcuts', label: 'Keys', caption: 'Command bindings and overrides' },
    { id: 'providers', label: 'Integrations', caption: 'Tool health, orchestration phases, and tracking' },
    { id: 'about', label: 'About', caption: 'Version, updates, and project links' },
  ];

  const menuItems: Map<Section, HTMLButtonElement> = new Map();
  for (const section of sections) {
    const item = document.createElement('button');
    item.className = 'preferences-menu-item';
    item.type = 'button';
    item.dataset.section = section.id;
    item.innerHTML = `
      <span class="preferences-menu-item-label">${section.label}</span>
      <span class="preferences-menu-item-caption">${section.caption}</span>
    `;
    menu.appendChild(item);
    menuItems.set(section.id, item);
  }

  // Content area
  const contentShell = document.createElement('div');
  contentShell.className = 'preferences-content-shell';

  const content = document.createElement('div');
  content.className = 'preferences-content preferences-section';

  layout.appendChild(menu);
  contentShell.appendChild(content);
  layout.appendChild(contentShell);
  bodyEl.appendChild(layout);

  // Build section content
  let currentSection: Section = 'general';
  let defaultProviderSelect: CustomSelectInstance | null = null;
  let languageSelect: CustomSelectInstance | null = null;
  let activeRecorder: { cleanup: () => void } | null = null;
  let aboutUpdateCleanup: (() => void) | null = null;
  const preferenceDraft: {
    soundOnSessionWaiting: boolean;
    notificationsDesktop: boolean;
    sessionHistoryEnabled: boolean;
    insightsEnabled: boolean;
    autoTitleEnabled: boolean;
    defaultProvider: ProviderId;
    language: UiLanguage;
    debugMode: boolean;
    sidebarViews: {
      configSections: boolean;
      gitPanel: boolean;
      sessionHistory: boolean;
      costFooter: boolean;
    };
  } = {
    soundOnSessionWaiting: appState.preferences.soundOnSessionWaiting,
    notificationsDesktop: appState.preferences.notificationsDesktop,
    sessionHistoryEnabled: appState.preferences.sessionHistoryEnabled,
    insightsEnabled: appState.preferences.insightsEnabled,
    autoTitleEnabled: appState.preferences.autoTitleEnabled,
    defaultProvider: appState.preferences.defaultProvider ?? 'claude',
    language: appState.preferences.language ?? 'en',
    debugMode: appState.preferences.debugMode,
    sidebarViews: {
      configSections: appState.preferences.sidebarViews?.configSections ?? true,
      gitPanel: appState.preferences.sidebarViews?.gitPanel ?? true,
      sessionHistory: appState.preferences.sidebarViews?.sessionHistory ?? true,
      costFooter: appState.preferences.sidebarViews?.costFooter ?? true,
    },
  };
  const shortcutOverridesDraft: Record<string, string> = { ...(appState.preferences.keybindings ?? {}) };

  function formatRelativeTimestamp(timestamp?: string): string {
    if (!timestamp) return 'No sync yet';
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return 'No sync yet';
    const diffMs = Date.now() - date.getTime();
    if (diffMs < 0) {
      return `Updated ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
    if (diffMs < 60_000) return 'Updated just now';
    const diffMinutes = Math.floor(diffMs / 60_000);
    if (diffMinutes < 60) return `Updated ${diffMinutes}m ago`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `Updated ${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `Updated ${diffDays}d ago`;
    return `Updated ${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
  }

  function countCustomizedShortcuts(): number {
    let count = 0;
    for (const [, shortcuts] of shortcutManager.getAll(shortcutOverridesDraft)) {
      for (const shortcut of shortcuts) {
        if (shortcutManager.hasOverride(shortcut.id, shortcutOverridesDraft)) count += 1;
      }
    }
    return count;
  }

  function cleanupRecorder() {
    if (activeRecorder) {
      activeRecorder.cleanup();
      activeRecorder = null;
    }
  }

  function cleanupAboutUpdateListeners() {
    if (aboutUpdateCleanup) {
      aboutUpdateCleanup();
      aboutUpdateCleanup = null;
    }
  }

  function replaceDefaultProviderSelect(select: CustomSelectInstance): void {
    if (defaultProviderSelect && defaultProviderSelect !== select) {
      defaultProviderSelect.destroy();
    }
    defaultProviderSelect = select;
  }

  function replaceLanguageSelect(select: CustomSelectInstance): void {
    if (languageSelect && languageSelect !== select) {
      languageSelect.destroy();
    }
    languageSelect = select;
  }

  function renderSection(section: Section) {
    cleanupRecorder();
    cleanupAboutUpdateListeners();
    currentSection = section;
    content.innerHTML = '';
    content.scrollTop = 0;

    // Update active menu item
    for (const [id, item] of menuItems) {
      item.classList.toggle('active', id === section);
    }

    if (section === 'general') {
      renderGeneralPreferencesSection({
        content,
        preferenceDraft,
        appendSectionIntro,
        appendOverviewGrid,
        isGeneralSectionActive: () => currentSection === 'general',
        getDefaultProviderSelect: () => defaultProviderSelect,
        replaceDefaultProviderSelect,
        replaceLanguageSelect,
      });

    } else if (section === 'layout') {
      renderLayoutPreferencesSection({
        content,
        preferenceDraft,
        appendSectionIntro,
        appendOverviewGrid,
        appendSectionCard,
      });

    } else if (section === 'shortcuts') {
      appendSectionIntro(
        content,
        'Keyboard',
        'Working keys',
        'Keep the shortcuts you use every day close to hand and override only the ones that really help.',
      );
      appendOverviewGrid(content, [
        {
          label: 'Customized',
          value: `${countCustomizedShortcuts()}`,
          note: 'Only explicit overrides are tracked here.',
        },
        {
          label: 'Focus',
          value: 'Session + surface',
          note: 'Bindings cover sessions, the left stage, and shell navigation.',
        },
        {
          label: 'Style',
          value: 'Command-first',
          note: 'Record a new combo directly from the keyboard when you need one.',
        },
      ]);
      renderShortcutsSection({
        container: content,
        shortcutOverridesDraft,
        cleanupRecorder,
        setActiveRecorder: (cleanup) => {
          activeRecorder = { cleanup };
        },
        clearActiveRecorder: () => {
          activeRecorder = null;
        },
        rerenderShortcuts: () => renderSection('shortcuts'),
      });

    } else if (section === 'providers') {
      renderProvidersPreferencesSection({
        content,
        appendSectionIntro,
        appendOverviewGrid,
        appendSectionGroup,
        appendSectionCard,
        closeWideModal: () => {
          closeModal();
          modal.classList.remove('modal-wide');
        },
        rerenderProviders: () => renderSection('providers'),
        modalBody: bodyEl,
        confirmButton: btnConfirm,
        cancelButton: btnCancel,
        registerModalCleanup: extendModalCleanup,
        buildCheckpointRestoreConfirm,
        isProvidersSectionActive: () => currentSection === 'providers',
        onApplySetupBadge: applySetupBadge,
        onFixProvider: fixAndRerender,
        onInstallMobileDependency: installMobileDependencyAndRerender,
      });

    } else if (section === 'about') {
      aboutUpdateCleanup = renderAboutPreferencesSection({
        content,
        preferenceDraft,
        appendSectionIntro,
        appendOverviewGrid,
        formatRelativeTimestamp,
      });
    }
  }

  async function fixAndRerender(providerId?: ProviderId) {
    await window.calder.settings.reinstall(providerId);
    renderSection('providers');
  }

  async function installMobileDependencyAndRerender(dependencyId: MobileDependencyId): Promise<void> {
    const result = await window.calder.mobileSetup.installDependency(dependencyId);
    if (!result.success) {
      throw new Error(result.message || 'Install command failed.');
    }
    renderSection('providers');
  }

  function applySetupBadge(hasIssue: boolean) {
    const setupItem = menuItems.get('providers');
    if (setupItem) {
      setupItem.classList.toggle('has-badge', hasIssue);
    }
  }

  async function updateSetupBadge() {
    applySetupBadge(await resolveSetupBadgeHasIssue());
  }
  updateSetupBadge();

  // Menu click handler
  menu.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement).closest('.preferences-menu-item') as HTMLElement | null;
    if (target && target.dataset.section) {
      renderSection(target.dataset.section as Section);
    }
  });

  // Show initial section
  renderSection('general');

  btnConfirm.textContent = 'Done';
  overlay.classList.remove('hidden');

  // Clean up previous listeners
  runModalCleanup();
  extendModalCleanup(() => {
    bodyEl.classList.remove('preferences-body');
    modal.classList.remove('modal-wide');
    btnConfirm.textContent = 'Create';
  });

  const save = () => {
    appState.setPreference('soundOnSessionWaiting', preferenceDraft.soundOnSessionWaiting);
    appState.setPreference('notificationsDesktop', preferenceDraft.notificationsDesktop);
    appState.setPreference('sessionHistoryEnabled', preferenceDraft.sessionHistoryEnabled);
    appState.setPreference('insightsEnabled', preferenceDraft.insightsEnabled);
    appState.setPreference('autoTitleEnabled', preferenceDraft.autoTitleEnabled);
    appState.setPreference('defaultProvider', preferenceDraft.defaultProvider);
    appState.setPreference('sidebarViews', {
      configSections: preferenceDraft.sidebarViews.configSections,
      gitPanel: preferenceDraft.sidebarViews.gitPanel,
      sessionHistory: preferenceDraft.sidebarViews.sessionHistory,
      costFooter: preferenceDraft.sidebarViews.costFooter,
    });
    appState.setPreference('keybindings', { ...shortcutOverridesDraft });
    appState.setPreference('language', preferenceDraft.language);
    if (preferenceDraft.debugMode !== appState.preferences.debugMode) {
      appState.setPreference('debugMode', preferenceDraft.debugMode);
      window.calder.menu.rebuild(preferenceDraft.debugMode);
    }
  };

  const handleConfirm = () => {
    cleanupRecorder();
    save();
    closeModal();
    modal.classList.remove('modal-wide');
    btnConfirm.textContent = 'Create';
  };

  const handleCancel = () => {
    cleanupRecorder();
    closeModal();
    modal.classList.remove('modal-wide');
    btnConfirm.textContent = 'Create';
  };

  const handleKeydown = (e: KeyboardEvent) => {
    // Don't intercept if we're recording a shortcut
    if (activeRecorder) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      handleConfirm();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    }
  };

  btnConfirm.addEventListener('click', handleConfirm);
  btnCancel.addEventListener('click', handleCancel);
  document.addEventListener('keydown', handleKeydown);

  extendModalCleanup(() => {
    cleanupRecorder();
    cleanupAboutUpdateListeners();
    if (defaultProviderSelect) defaultProviderSelect.destroy();
    if (languageSelect) languageSelect.destroy();
    btnConfirm.removeEventListener('click', handleConfirm);
    btnCancel.removeEventListener('click', handleCancel);
    document.removeEventListener('keydown', handleKeydown);
  });
}
