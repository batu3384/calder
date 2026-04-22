import { closeModal } from '../modal.js';
import { shortcutManager } from '../../shortcuts.js';
import type { ProviderId } from '../../../shared/types/provider.js';
import type { MobileDependencyId } from '../../../shared/types/mobile.js';
import { buildCheckpointRestoreConfirm } from './preferences-checkpoint-confirm.js';
import {
  renderProvidersPreferencesSection,
} from './preferences-modal-sections.js';
import { renderShortcutsSection } from './preferences-shortcuts-section.js';

export type PreferencesSection = 'general' | 'layout' | 'providers' | 'shortcuts' | 'about';

function countCustomizedShortcuts(shortcutOverridesDraft: Record<string, string>): number {
  let count = 0;
  for (const [, shortcuts] of shortcutManager.getAll(shortcutOverridesDraft)) {
    for (const shortcut of shortcuts) {
      if (shortcutManager.hasOverride(shortcut.id, shortcutOverridesDraft)) count += 1;
    }
  }
  return count;
}

export function bindPreferencesMenuNavigation(
  menu: HTMLElement,
  renderSection: (section: PreferencesSection) => void,
): void {
  menu.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement).closest('.preferences-menu-item') as HTMLElement | null;
    if (target && target.dataset.section) {
      renderSection(target.dataset.section as PreferencesSection);
    }
  });
}

export function renderShortcutPreferencesContent(args: {
  content: HTMLElement;
  shortcutOverridesDraft: Record<string, string>;
  cleanupRecorder: () => void;
  setActiveRecorder: (cleanup: () => void) => void;
  clearActiveRecorder: () => void;
  rerenderShortcuts: () => void;
  appendSectionIntro: (container: HTMLElement, eyebrow: string, title: string, description: string) => void;
  appendOverviewGrid: (
    container: HTMLElement,
    items: Array<{ label: string; value: string; note?: string }>,
  ) => void;
}): void {
  args.appendSectionIntro(
    args.content,
    'Keyboard',
    'Working keys',
    'Keep the shortcuts you use every day close to hand and override only the ones that really help.',
  );
  args.appendOverviewGrid(args.content, [
    {
      label: 'Customized',
      value: `${countCustomizedShortcuts(args.shortcutOverridesDraft)}`,
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
    container: args.content,
    shortcutOverridesDraft: args.shortcutOverridesDraft,
    cleanupRecorder: args.cleanupRecorder,
    setActiveRecorder: args.setActiveRecorder,
    clearActiveRecorder: args.clearActiveRecorder,
    rerenderShortcuts: args.rerenderShortcuts,
  });
}

export function renderProvidersPreferencesContent(args: {
  content: HTMLElement;
  modalBody: HTMLElement;
  confirmButton: HTMLButtonElement;
  cancelButton: HTMLButtonElement;
  registerModalCleanup: (cleanup: () => void) => void;
  currentSection: () => PreferencesSection;
  rerenderProviders: () => void;
  applySetupBadge: (hasIssue: boolean) => void;
  onFixProvider: (providerId?: ProviderId) => Promise<void>;
  onInstallMobileDependency: (dependencyId: MobileDependencyId) => Promise<void>;
  appendSectionIntro: (container: HTMLElement, eyebrow: string, title: string, description: string) => void;
  appendOverviewGrid: (
    container: HTMLElement,
    items: Array<{ label: string; value: string; note?: string }>,
  ) => void;
  appendSectionGroup: (
    container: HTMLElement,
    eyebrow: string,
    title: string,
    description: string,
  ) => HTMLElement;
  appendSectionCard: (container: HTMLElement, title: string, description?: string) => HTMLElement;
  modalElement: HTMLElement;
}): void {
  renderProvidersPreferencesSection({
    content: args.content,
    appendSectionIntro: args.appendSectionIntro,
    appendOverviewGrid: args.appendOverviewGrid,
    appendSectionGroup: args.appendSectionGroup,
    appendSectionCard: args.appendSectionCard,
    closeWideModal: () => {
      closeModal();
      args.modalElement.classList.remove('modal-wide');
    },
    rerenderProviders: args.rerenderProviders,
    modalBody: args.modalBody,
    confirmButton: args.confirmButton,
    cancelButton: args.cancelButton,
    registerModalCleanup: args.registerModalCleanup,
    buildCheckpointRestoreConfirm,
    isProvidersSectionActive: () => args.currentSection() === 'providers',
    onApplySetupBadge: args.applySetupBadge,
    onFixProvider: args.onFixProvider,
    onInstallMobileDependency: args.onInstallMobileDependency,
  });
}
