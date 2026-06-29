import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockCreateBrowserTabPaneLayout,
  mockCreateBrowserPaneCaptureArtifacts,
  mockCreateBrowserAuthPanelArtifacts,
  mockCreateBrowserTabInstance,
  mockCreateBrowserViewportMenuController,
  mockCreateBrowserTabShellArtifacts,
  mockInitializeBrowserTabRuntimeBindings,
  sharedInstances,
} = vi.hoisted(() => {
  const instances = new Map<string, any>();
  return {
    mockCreateBrowserTabPaneLayout: vi.fn(),
    mockCreateBrowserPaneCaptureArtifacts: vi.fn(),
    mockCreateBrowserAuthPanelArtifacts: vi.fn(),
    mockCreateBrowserTabInstance: vi.fn(),
    mockCreateBrowserViewportMenuController: vi.fn(),
    mockCreateBrowserTabShellArtifacts: vi.fn(),
    mockInitializeBrowserTabRuntimeBindings: vi.fn(),
    sharedInstances: instances,
  };
});

vi.mock('./instance.js', () => ({
  instances: sharedInstances,
}));

vi.mock('./pane-layout.js', () => ({
  createBrowserTabPaneLayout: (...args: unknown[]) => mockCreateBrowserTabPaneLayout(...args),
}));

vi.mock('./pane-artifacts.js', () => ({
  createBrowserPaneCaptureArtifacts: (...args: unknown[]) =>
    mockCreateBrowserPaneCaptureArtifacts(...args),
  createBrowserAuthPanelArtifacts: (...args: unknown[]) =>
    mockCreateBrowserAuthPanelArtifacts(...args),
}));

vi.mock('./pane-runtime.js', () => ({
  createBrowserTabInstance: (...args: unknown[]) => mockCreateBrowserTabInstance(...args),
  attachBrowserWebviewBindings: vi.fn(),
}));

vi.mock('./pane-viewport-menu.js', () => ({
  createBrowserViewportMenuController: (...args: unknown[]) =>
    mockCreateBrowserViewportMenuController(...args),
}));

vi.mock('./pane-shell.js', () => ({
  createBrowserTabShellArtifacts: (...args: unknown[]) =>
    mockCreateBrowserTabShellArtifacts(...args),
}));

vi.mock('./pane-runtime-bindings.js', () => ({
  initializeBrowserTabRuntimeBindings: (...args: unknown[]) =>
    mockInitializeBrowserTabRuntimeBindings(...args),
}));

vi.mock('./pane-interactions.js', () => ({
  bindBrowserToolbarState: vi.fn(),
  attachBrowserNewTabTargetingBindings: vi.fn(),
  attachBrowserNavigationInteractions: vi.fn(),
  attachBrowserViewportInteractions: vi.fn(),
  attachBrowserCaptureInteractions: vi.fn(),
}));

vi.mock('./auth-controller.js', () => ({
  createBrowserAuthController: vi.fn(() => ({ cleanup: vi.fn() })),
}));

vi.mock('./navigation-chrome.js', () => ({
  syncAddressBarState: vi.fn(),
  syncNavigationControls: vi.fn(),
}));

vi.mock('./pane-helpers.js', () => ({
  resolveCredentialOrigin: vi.fn(() => 'http://localhost:3000'),
  resolveBrowserPartitionForSession: vi.fn(() => 'persist:browser'),
  syncBrowserTabToSessionState: vi.fn(),
}));

vi.mock('./viewport.js', () => ({
  applyViewport: vi.fn(),
}));

vi.mock('./navigation.js', () => ({
  navigateTo: vi.fn(),
  isLocalBrowserUrl: vi.fn(() => true),
}));

vi.mock('./flow-recording.js', () => ({
  addFlowStep: vi.fn(),
}));

vi.mock('./guest-messaging.js', () => ({
  sendGuestMessage: vi.fn(),
}));

vi.mock('./local-targets.js', () => ({
  populateLocalTargets: vi.fn(),
}));

vi.mock('./target-menu.js', () => ({
  closeBrowserTargetMenu: vi.fn(),
}));

vi.mock('../../state.js', () => ({
  appState: {},
}));

function makeElement(): any {
  return {
    style: {},
    dataset: {},
    className: '',
    classList: {
      add: vi.fn(),
      remove: vi.fn(),
      toggle: vi.fn(),
    },
    appendChild: vi.fn(),
    addEventListener: vi.fn(),
    setAttribute: vi.fn(),
    focus: vi.fn(),
    textContent: '',
    value: '',
    hidden: false,
  };
}

function buildLayout() {
  return {
    el: makeElement(),
    chromeHint: makeElement(),
    statusBadge: makeElement(),
    trustZoneBadge: makeElement(),
    toolbarAddressShell: makeElement(),
    captureCluster: { element: makeElement(), label: makeElement() },
    backBtn: makeElement(),
    fwdBtn: makeElement(),
    reloadBtn: makeElement(),
    homeBtn: makeElement(),
    urlInput: makeElement(),
    goBtn: makeElement(),
    viewportWrapper: makeElement(),
    viewportBtn: makeElement(),
    viewportDropdown: makeElement(),
    customItem: makeElement(),
    customForm: makeElement(),
    customWInput: makeElement(),
    customHInput: makeElement(),
    customApplyBtn: makeElement(),
    inspectBtn: makeElement(),
    recordBtn: makeElement(),
    drawBtn: makeElement(),
    authBtn: makeElement(),
    viewportContainer: makeElement(),
  };
}

function buildCaptureArtifacts() {
  return {
    inspectPanel: makeElement(),
    inspectHandle: makeElement(),
    drawClearBtn: makeElement(),
    drawSubmitBtn: makeElement(),
    drawCustomBtn: makeElement(),
    drawInstructionInput: makeElement(),
    flowClearBtn: makeElement(),
    flowSubmitBtn: makeElement(),
    flowCustomBtn: makeElement(),
    flowPickerMenu: makeElement(),
    flowPickerOverlay: makeElement(),
    submitBtn: makeElement(),
    customBtn: makeElement(),
    instructionInput: makeElement(),
  };
}

function buildAuthArtifacts() {
  return {
    authPanel: makeElement(),
    authOriginEl: makeElement(),
    authProfileSelect: makeElement(),
    authLabelInput: makeElement(),
    authUsernameInput: makeElement(),
    authPasswordInput: makeElement(),
    authAutoFillCheckbox: makeElement(),
    authStatusEl: makeElement(),
    authDeleteBtn: makeElement(),
    authSaveBtn: makeElement(),
    authFillBtn: makeElement(),
    authCloseBtn: makeElement(),
  };
}

function buildShellArtifacts() {
  return {
    webview: makeElement(),
    contentShell: makeElement(),
    newTabPage: makeElement(),
    ntpGrid: makeElement(),
    ntpTargetsText: makeElement(),
    ntpTargetsMeta: makeElement(),
    focusAddressBtn: makeElement(),
    refreshTargetsBtn: makeElement(),
    newTabStateController: {
      hideEmptyState: vi.fn(),
      showDefaultCopy: vi.fn(),
      showOfflineState: vi.fn(),
      resetNewTabCopy: vi.fn(),
      setLocalTargetsSummary: vi.fn(),
      setLocalTargetsMeta: vi.fn(),
    },
    syncSurfaceVisibility: vi.fn(),
    syncBrowserStatus: vi.fn(),
  };
}

describe('browser tab pane entry', () => {
  beforeEach(() => {
    sharedInstances.clear();
    vi.clearAllMocks();
    mockCreateBrowserTabPaneLayout.mockReturnValue(buildLayout());
    mockCreateBrowserPaneCaptureArtifacts.mockReturnValue(buildCaptureArtifacts());
    mockCreateBrowserAuthPanelArtifacts.mockReturnValue(buildAuthArtifacts());
    mockCreateBrowserTabShellArtifacts.mockReturnValue(buildShellArtifacts());
    mockCreateBrowserViewportMenuController.mockReturnValue({
      viewportMenuItems: [],
      openViewportMenu: vi.fn(),
      closeViewportMenu: vi.fn(),
    });
    mockCreateBrowserTabInstance.mockImplementation(({ sessionId, el, webview }: any) => ({
      sessionId,
      element: el,
      webview,
      webviewReady: false,
      currentViewport: { label: 'Responsive' },
      flowSteps: [],
      cleanupFns: [],
      viewportOutsideClickHandler: vi.fn(),
      targetMenuOutsideClickHandler: vi.fn(),
      viewportDropdownFloatingCleanup: null,
      targetMenuFloatingCleanup: null,
      inspectMode: false,
      flowMode: false,
      drawMode: false,
    }));
  });

  it('creates pane once per session and initializes runtime dependencies', async () => {
    const { createBrowserTabPane } = await import('./pane.js');

    createBrowserTabPane('session-1');
    createBrowserTabPane('session-1');

    expect(mockCreateBrowserTabPaneLayout).toHaveBeenCalledTimes(1);
    expect(mockCreateBrowserTabShellArtifacts).toHaveBeenCalledTimes(1);
    expect(mockCreateBrowserViewportMenuController).toHaveBeenCalledTimes(1);
    expect(mockInitializeBrowserTabRuntimeBindings).toHaveBeenCalledTimes(1);
    expect(sharedInstances.has('session-1')).toBe(true);
  });
});
