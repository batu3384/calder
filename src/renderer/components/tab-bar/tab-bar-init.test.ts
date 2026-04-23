import { beforeEach, describe, expect, it, vi } from 'vitest';

const wireTabBarActionHandlers = vi.hoisted(() => vi.fn());
const wireTabBarDismissHandlers = vi.hoisted(() => vi.fn());
const wireTabBarStateSubscriptions = vi.hoisted(() => vi.fn());
const bootstrapTabBarProviderAvailability = vi.hoisted(() => vi.fn());

const renderGitStatusBlock = vi.hoisted(() => vi.fn());
const syncMobileControlButton = vi.hoisted(() => vi.fn());

const cliUpdatePanelController = vi.hoisted(() => ({
  setup: vi.fn(),
  isVisible: vi.fn(() => false),
  containsTarget: vi.fn(() => false),
  toggle: vi.fn(),
  renderButton: vi.fn(),
  renderPanel: vi.fn(),
}));

const providerSelectorController = vi.hoisted(() => ({
  syncSessionProviderSelector: vi.fn(),
}));

const surfaceControlsController = vi.hoisted(() => ({
  renderSurfaceControls: vi.fn(),
}));

const branchMenuController = vi.hoisted(() => ({
  showBranchContextMenu: vi.fn(async () => undefined),
}));

const sessionMenuController = vi.hoisted(() => ({
  quickNewSession: vi.fn(),
  showAddSessionContextMenu: vi.fn(),
  promptNewSession: vi.fn(async () => undefined),
}));

const updateCenterSnapshot = vi.hoisted(() => ({
  cli: { phase: 'idle' as const },
}));

const appStateMock = vi.hoisted(() => ({
  on: vi.fn(),
  preferences: { defaultProvider: 'claude' },
  activeProject: null,
  activeProjectId: 'project-1',
  addBrowserTabSession: vi.fn(),
  renameSession: vi.fn(),
  setPreference: vi.fn(),
  focusCliSurfaceTab: vi.fn(),
  closeCliSurface: vi.fn(),
  focusMobileSurfaceTab: vi.fn(),
  closeMobileSurface: vi.fn(),
}));

class FakeClassList {
  private values = new Set<string>();

  add(...tokens: string[]): void {
    for (const token of tokens) this.values.add(token);
  }

  remove(...tokens: string[]): void {
    for (const token of tokens) this.values.delete(token);
  }

  contains(token: string): boolean {
    return this.values.has(token);
  }
}

class FakeElement {
  className = '';
  classList = new FakeClassList();
  dataset: Record<string, string> = {};
  textContent = '';

  constructor(public id: string) {}

  addEventListener(): void {}
  appendChild(): void {}
  querySelector(): null { return null; }
  contains(): boolean { return false; }
  scrollIntoView(): void {}
}

class FakeDocument {
  private elements = new Map<string, FakeElement>();

  body = new FakeElement('body');

  register(id: string): FakeElement {
    const element = new FakeElement(id);
    this.elements.set(id, element);
    return element;
  }

  getElementById(id: string): FakeElement | null {
    return this.elements.get(id) ?? null;
  }

  createElement(tag: string): FakeElement {
    return new FakeElement(tag);
  }

  addEventListener(): void {}
}

vi.mock('../../state.js', () => ({
  appState: appStateMock,
  MAX_SESSION_NAME_LENGTH: 80,
}));

vi.mock('../../git-status.js', () => ({
  getGitStatus: vi.fn(() => null),
  refreshGitStatus: vi.fn(),
}));

vi.mock('../cli-surface/setup.js', () => ({
  openCliSurfaceWithSetup: vi.fn(async () => undefined),
}));

vi.mock('../cli-surface/quick-setup.js', () => ({
  showCliSurfaceQuickSetup: vi.fn(),
}));

vi.mock('../cli-surface/profile.js', () => ({
  createDiscoveredCliSurfaceProfile: vi.fn((candidate) => candidate),
  getCliSurfaceProfileLabel: vi.fn(() => 'Default'),
}));

vi.mock('./tab-bar-surface-state.js', () => ({
  getProjectSurface: vi.fn(() => ({ cli: { profiles: [], selectedProfileId: null } })),
  persistAndLaunchCliSurfaceProfile: vi.fn(),
  selectCliSurfaceProfile: vi.fn(),
  upsertCliSurfaceProfile: vi.fn(() => []),
}));

vi.mock('./tab-bar-mobile-control.js', () => ({
  syncMobileControlButton,
}));

vi.mock('./tab-bar-session-titles.js', () => ({
  buildSessionTooltip: vi.fn(() => 'tooltip'),
}));

vi.mock('./tab-bar-surface-signature.js', () => ({
  buildSurfaceControlsSignatureForProject: vi.fn(() => 'sig'),
}));

vi.mock('./tab-bar-rename-controller.js', () => ({
  startInlineTabRename: vi.fn(),
}));

vi.mock('./tab-bar-cli-profile-modal.js', () => ({
  promptTabBarCliSurfaceProfile: vi.fn(),
}));

vi.mock('./tab-bar-session-context-menu.js', () => ({
  showSessionTabContextMenu: vi.fn(),
}));

vi.mock('./tab-bar-tab-list-renderer.js', () => ({
  renderTabList: vi.fn(),
}));

vi.mock('./tab-bar-surface-controls.js', () => ({
  createTabBarSurfaceControlsController: vi.fn(() => surfaceControlsController),
}));

vi.mock('../../update-center.js', () => ({
  cancelCliProviderUpdates: vi.fn(),
  getUpdateCenterState: vi.fn(() => updateCenterSnapshot),
  onUpdateCenterChange: vi.fn(() => () => undefined),
  runCliProviderUpdates: vi.fn(async () => undefined),
  initUpdateCenter: vi.fn(),
}));

vi.mock('./tab-bar-cli-update-panel.js', () => ({
  createTabBarCliUpdatePanel: vi.fn(() => cliUpdatePanelController),
}));

vi.mock('./tab-bar-provider-selector-controller.js', () => ({
  createTabBarProviderSelectorController: vi.fn(() => providerSelectorController),
}));

vi.mock('./tab-bar-branch-menu-controller.js', () => ({
  createTabBarBranchMenuController: vi.fn(() => branchMenuController),
}));

vi.mock('./tab-bar-session-menu-controller.js', () => ({
  createTabBarSessionMenuController: vi.fn(() => sessionMenuController),
}));

vi.mock('./tab-bar-context-menu-wiring.js', () => ({
  createTabBarContextMenuWiring: vi.fn(() => ({
    getActiveContextMenu: vi.fn(),
    setActiveContextMenu: vi.fn(),
    applyContextMenuSemantics: vi.fn(),
    hideTabContextMenu: vi.fn(),
  })),
}));

vi.mock('./tab-bar-control-handlers.js', () => ({
  activateLiveViewSurface: vi.fn(),
  activateMobileSurface: vi.fn(),
  handleMobileControlClick: vi.fn(),
}));

vi.mock('./tab-bar-render-blocks.js', () => ({
  buildActiveTabRailKey: vi.fn(() => 'active-key'),
  buildTabBarRenderSurfaceState: vi.fn(() => ({ cliSurfaceTabActive: false, mobileSurfaceTabActive: false })),
  renderGitStatusBlock,
  shouldSkipTabListRender: vi.fn(() => true),
}));

vi.mock('./tab-bar-event-wiring.js', () => ({
  wireTabBarActionHandlers,
  wireTabBarDismissHandlers,
  wireTabBarStateSubscriptions,
  bootstrapTabBarProviderAvailability,
}));

describe('tab-bar init orchestration', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    const documentMock = new FakeDocument();
    documentMock.register('tab-list');
    documentMock.register('git-status');
    documentMock.register('btn-add-session');
    documentMock.register('btn-update-cli-tools');
    documentMock.register('btn-mobile-control');
    documentMock.register('mobile-control-presence');
    documentMock.register('tab-actions');
    documentMock.register('surface-mode-slot');
    documentMock.register('surface-profile-slot');
    documentMock.register('session-provider-slot');
    documentMock.register('session-launcher');

    vi.stubGlobal('document', documentMock as unknown as Document);
    vi.stubGlobal('window', { calder: {} } as unknown as Window & typeof globalThis);
  });

  it('calls extracted wiring helpers while preserving boot side effects', async () => {
    const { initTabBar } = await import('./tab-bar.js');
    initTabBar();

    expect(wireTabBarActionHandlers).toHaveBeenCalledTimes(1);
    expect(wireTabBarDismissHandlers).toHaveBeenCalledTimes(1);
    expect(wireTabBarStateSubscriptions).toHaveBeenCalledTimes(1);
    expect(bootstrapTabBarProviderAvailability).toHaveBeenCalledTimes(1);
    expect(cliUpdatePanelController.setup).toHaveBeenCalledTimes(1);
    expect(providerSelectorController.syncSessionProviderSelector).toHaveBeenCalledWith('claude');
    expect(renderGitStatusBlock).toHaveBeenCalledTimes(1);
    expect(syncMobileControlButton).toHaveBeenCalledTimes(1);
    expect(document.getElementById('btn-add-session')?.classList.contains('tab-action-primary')).toBe(true);
  });
});
