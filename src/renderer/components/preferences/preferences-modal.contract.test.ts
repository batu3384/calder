import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'fs';

const mockRenderGeneralPreferencesSectionContent = vi.hoisted(() => vi.fn());
const mockRenderLayoutPreferencesSectionContent = vi.hoisted(() => vi.fn());

vi.mock('./preferences-modal-sections-general-content.js', () => ({
  renderGeneralPreferencesSectionContent: mockRenderGeneralPreferencesSectionContent,
}));

vi.mock('./preferences-modal-sections-layout-content.js', () => ({
  renderLayoutPreferencesSectionContent: mockRenderLayoutPreferencesSectionContent,
}));

vi.mock('../../state.js', () => ({
  appState: {
    activeProject: null,
    setProjectContext: vi.fn(),
    setProjectWorkflows: vi.fn(),
    setProjectTeamContext: vi.fn(),
    setProjectGovernance: vi.fn(),
  },
}));

vi.mock('./preferences-background-task-discovery.js', () => ({
  renderProjectBackgroundTaskSection: vi.fn(),
}));

vi.mock('./preferences-checkpoint-discovery.js', () => ({
  renderProjectCheckpointSection: vi.fn(),
}));

vi.mock('./preferences-context-discovery.js', () => ({
  renderProjectContextSection: vi.fn(),
}));

vi.mock('./preferences-governance-discovery.js', () => ({
  renderProjectGovernanceSection: vi.fn(),
}));

vi.mock('./preferences-orchestration-overview.js', () => ({
  renderOrchestrationOverviewSection: vi.fn(),
}));

vi.mock('./preferences-preview-discovery.js', () => ({
  renderProjectPreviewCenterSection: vi.fn(),
}));

vi.mock('./preferences-provider-setup.js', () => ({
  renderSetupSection: vi.fn(),
  renderMobileSetupSection: vi.fn(),
}));

vi.mock('./preferences-review-discovery.js', () => ({
  renderProjectReviewSection: vi.fn(),
}));

vi.mock('./preferences-team-context-discovery.js', () => ({
  renderProjectTeamContextSection: vi.fn(),
}));

vi.mock('./preferences-workflow-discovery.js', () => ({
  renderProjectWorkflowSection: vi.fn(),
}));

vi.mock('./preferences-modal-sections-about.js', () => ({
  renderAboutPreferencesSection: vi.fn(),
}));

import {
  renderGeneralPreferencesSection,
  renderLayoutPreferencesSection,
} from './preferences-modal-sections.js';

const modalSourceFile = readFileSync(new URL('./preferences-modal.ts', import.meta.url), 'utf-8');
const modalSectionsSource = readFileSync(new URL('./preferences-modal-sections.ts', import.meta.url), 'utf-8');
const modalActionsSource = readFileSync(new URL('./preferences-modal-actions.ts', import.meta.url), 'utf-8');
const modalShellSource = readFileSync(new URL('./preferences-modal-shell.ts', import.meta.url), 'utf-8');
const source = [modalSourceFile, modalSectionsSource, modalActionsSource, modalShellSource].join('\n');
const providerSetupSource = readFileSync(new URL('./preferences-provider-setup.ts', import.meta.url), 'utf-8');
const shortcutsSource = readFileSync(new URL('./preferences-shortcuts-section.ts', import.meta.url), 'utf-8');
const modalSource = readFileSync(new URL('../modal.ts', import.meta.url), 'utf-8');
const styles = readFileSync(new URL('../../styles/preferences.css', import.meta.url), 'utf-8');
const modalStyles = readFileSync(new URL('../../styles/modals.css', import.meta.url), 'utf-8');

describe('preferences modal contract', () => {
  it('builds a branded menu header and section intros', () => {
    expect(source).toContain('preferences-menu-header');
    expect(source).toContain('preferences-section-intro');
  });

  it('uses shell language for layout controls', () => {
    expect(source).toContain('Workspace Center');
    expect(source).toContain('Workspace settings');
    expect(source).toContain('Interface');
    expect(source).toContain('Tools');
    expect(source).toContain('Automation');
    expect(source).toContain('Safety');
    expect(source).not.toContain('Control Center');
    expect(source).not.toContain('System controls');
  });

  it('uses control-center sections and layout groups', () => {
    expect(source).toContain("type Section = 'general' | 'interface' | 'tools' | 'automation' | 'safety' | 'shortcuts' | 'about'");
    expect(source).toContain("id: 'interface', label: 'Interface'");
    expect(source).toContain("id: 'tools', label: 'Tools'");
    expect(source).toContain("id: 'automation', label: 'Automation'");
    expect(source).toContain("id: 'safety', label: 'Safety'");
    expect(source).toContain('Ops Rail modules');
    expect(source).toContain('Live View behavior');
    expect(source).toContain('Session Deck defaults');
  });

  it('uses native modal and preferences shell hooks', () => {
    expect(source).toContain("titleEl.textContent = 'Workspace Center'");
    expect(source).toContain("bodyEl.classList.add('preferences-body');");
    expect(source).toContain('content.scrollTop = 0;');
    expect(source).toContain('Provider');
    expect(source).toContain('CLI health and mobile readiness');
    expect(source).toContain('Project workflow system');
    expect(source).toContain('Memory, policy, and recovery');
    expect(source).toContain('preferences-overview-grid');
    expect(source).toContain('(not installed)');
    expect(source).toContain('Calder will fall back to the next installed tool');
    expect(source).not.toContain("titleEl.textContent = 'Control Center'");
    expect(styles).toContain('.preferences-shell');
    expect(styles).toContain('.preferences-section');
    expect(styles).toContain('.preferences-control-note');
    expect(modalStyles).toContain('.modal-surface');
    expect(modalSource).toContain('restoreFocusAfterClose');
  });

  it('styles the control center like a control sheet instead of a pill-heavy settings page', () => {
    expect(styles).toContain('.preferences-menu-item');
    expect(styles).toContain('.preferences-menu-item::before');
    expect(styles).toContain('.preferences-menu-item.active::before');
    expect(styles).toContain('grid-template-columns: 228px minmax(0, 1fr);');
    expect(styles).toContain('.preferences-menu-item-label');
    expect(styles).toContain('.preferences-overview-grid');
    expect(styles).toContain('.preferences-section-card');
    expect(source).toContain('preferences-content-shell');
    expect(providerSetupSource).toContain('setup-provider-shell');
    expect(shortcutsSource).toContain('shortcut-group-shell');
    expect(source).toContain('about-hero');
    expect(source).toContain('about-link-grid');
    expect(styles).toContain('#modal-body.preferences-body');
    expect(styles).toContain('.preferences-content-shell');
    expect(styles).toContain('display: flex;');
    expect(styles).toContain('.modal-toggle-field');
    expect(styles).toContain('.modal-toggle-field .custom-select');
    expect(styles).toContain('.setup-provider-shell');
    expect(styles).toContain('.setup-provider-status');
    expect(styles).toContain('.shortcut-group-shell');
    expect(styles).toContain('.shortcut-row-actions');
    expect(styles).toContain('.shortcut-key-btn');
    expect(styles).toContain('.shortcut-reset-btn');
    expect(styles).toContain('.about-hero');
    expect(styles).toContain('.about-link-grid');
    expect(styles).toContain('.about-update-btn');
    expect(styles).toContain('.setup-fix-btn');
    expect(styles).toContain('var(--shadow-card-strong);');
    expect(modalStyles).toContain('#modal-actions, .modal-actions');
    expect(modalStyles).toContain('justify-content: flex-end;');
    expect(modalStyles).toContain('.modal-btn.primary');
    expect(modalStyles).toContain('min-width: 112px;');
    expect(styles).not.toContain('border-left: 1px solid var(--border-subtle);');
    expect(modalStyles).toContain('#modal, .modal-box');
    expect(modalStyles).toContain('border-radius: 16px;');
  });

  it('keeps the settings rail scrollable and anchored on short viewports', () => {
    expect(styles).toContain('.preferences-menu {');
    expect(styles).toContain('overflow-y: auto;');
    expect(styles).toContain('overscroll-behavior: contain;');
    expect(styles).not.toContain('transform: translateX(1px);');
  });

  it('groups dense settings content into subsection shells instead of one flat stack', () => {
    expect(source).toContain('function appendSectionGroup');
    expect(source).toContain('preferences-subsection');
    expect(source).toContain('Provider health');
    expect(source).toContain('Orchestration phases');
    expect(source).toContain('Context and team knowledge');
    expect(source).toContain('Governance and review');
    expect(source).toContain('Checkpoints');
    expect(styles).toContain('.preferences-subsection');
    expect(styles).toContain('.preferences-subsection-grid');
  });

  it('shows mobile readiness setup group and install actions in tools', () => {
    expect(source).toContain('Mobile automation readiness');
    expect(source).toContain('Checks iOS/Android simulator requirements and provides guided installs for missing dependencies.');
    expect(source).toContain('renderMobileSetupSection');
    expect(providerSetupSource).toContain('Mobile Dependency Doctor');
    expect(providerSetupSource).toContain('iOS simulator inspect');
    expect(providerSetupSource).toContain('Android emulator inspect');
    expect(providerSetupSource).toContain('Optional tools');
    expect(providerSetupSource).toContain("opts.actionLabel ? 'Installing");
    expect(providerSetupSource).toContain("actionLabel: check.autoFixAvailable && !isReady ? 'Install' : undefined");
  });

  it('stages shortcut overrides until Done and applies modal cleanup extensions safely', () => {
    expect(source).toContain('const shortcutOverridesDraft');
    expect(source).toContain("appState.setPreference('keybindings', { ...shortcutOverridesDraft });");
    expect(source).not.toContain('shortcutManager.setOverride(');
    expect(source).not.toContain('shortcutManager.resetOverride(');
    expect(source).toContain('extendModalCleanup(() => {');
    expect(modalSourceFile).not.toContain('registerModalCleanup(() => {');
  });
});

function createGeneralSectionArgs() {
  return {
    content: {} as HTMLElement,
    preferenceDraft: {
      soundOnSessionWaiting: true,
      notificationsDesktop: true,
      sessionHistoryEnabled: true,
      insightsEnabled: true,
      autoTitleEnabled: true,
      defaultProvider: 'codex' as const,
      language: 'en' as const,
    },
    appendSectionIntro: () => {},
    appendOverviewGrid: () => {},
    isGeneralSectionActive: () => true,
    getDefaultProviderSelect: () => null,
    replaceDefaultProviderSelect: () => {},
    replaceLanguageSelect: () => {},
  };
}

function createLayoutSectionArgs() {
  return {
    content: {} as HTMLElement,
    preferenceDraft: {
      sidebarViews: {
        configSections: true,
        gitPanel: true,
        sessionHistory: true,
        costFooter: true,
      },
    },
    appendSectionIntro: () => {},
    appendOverviewGrid: () => {},
    appendSectionCard: () => ({} as HTMLElement),
  };
}

describe('preferences section wrappers', () => {
  beforeEach(() => {
    mockRenderGeneralPreferencesSectionContent.mockReset();
    mockRenderLayoutPreferencesSectionContent.mockReset();
  });

  it('passes provider copy constants into renderGeneralPreferencesSectionContent', () => {
    const args = createGeneralSectionArgs();

    renderGeneralPreferencesSection(args);

    expect(mockRenderGeneralPreferencesSectionContent).toHaveBeenCalledTimes(1);
    expect(mockRenderGeneralPreferencesSectionContent).toHaveBeenCalledWith(expect.objectContaining({
      content: args.content,
      preferenceDraft: args.preferenceDraft,
      providerCopy: {
        unavailableSuffix: ' (not installed)',
        defaultMissingMessage: 'Calder falls back to the next installed tool if this one is missing.',
        defaultInstalledMessage: 'New sessions use this tool unless a workflow picks a different one.',
        defaultUnavailableMessage: 'This default is not installed on this Mac. Calder will fall back to the next installed tool until you install it.',
      },
    }));
  });

  it('passes layout copy constants into renderLayoutPreferencesSectionContent', () => {
    const args = createLayoutSectionArgs();

    renderLayoutPreferencesSection(args);

    expect(mockRenderLayoutPreferencesSectionContent).toHaveBeenCalledTimes(1);
    expect(mockRenderLayoutPreferencesSectionContent).toHaveBeenCalledWith(expect.objectContaining({
      content: args.content,
      preferenceDraft: args.preferenceDraft,
      copy: {
        opsRailTitle: 'Ops Rail modules',
        liveViewTitle: 'Live View behavior',
        sessionDeckTitle: 'Session Deck defaults',
      },
    }));
  });
});
