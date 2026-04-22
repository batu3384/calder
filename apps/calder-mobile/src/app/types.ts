export type UiLanguage = 'en' | 'tr';

export type MobileTab = 'overview' | 'sessions' | 'cli' | 'browser' | 'inspect' | 'live';

export type ConnectionState = 'idle' | 'waiting' | 'connected' | 'error';

export type QuickControl = 'ctrl-c' | 'ctrl-l' | 'enter' | 'tab';

export type BrowserControlAction = 'back' | 'forward' | 'reload' | 'toggle-inspect';

export type BrowserViewportLabel = 'Responsive' | 'iPhone 14';

export type LiveSessionItem = {
  id: string;
  name: string;
};

export type Copy = {
  appTitle: string;
  appSubtitle: string;
  pairingLinkLabel: string;
  pairingLinkPlaceholder: string;
  otpLabel: string;
  otpPlaceholder: string;
  connectButton: string;
  connectInProgress: string;
  openLiveControl: string;
  hideLiveControl: string;
  languageButton: string;
  tabs: Record<MobileTab, string>;
  idleStatus: string;
  waitingStatus: string;
  connectedStatus: string;
  errorStatus: string;
  liveStatusLabel: string;
  liveConnectionLabel: string;
  liveConsoleWaiting: string;
  liveConnectionWaiting: string;
  liveSessionLabel: string;
  liveSessionEmpty: string;
  switchSessionButton: string;
  switchSessionHint: string;
  commandLabel: string;
  commandPlaceholder: string;
  sendCommandButton: string;
  quickControlsLabel: string;
  quickControlCtrlC: string;
  quickControlCtrlL: string;
  quickControlEnter: string;
  quickControlTab: string;
  browserSessionLabel: string;
  browserStatusWaiting: string;
  browserBackButton: string;
  browserForwardButton: string;
  browserReloadButton: string;
  browserInspectButton: string;
  browserResponsiveButton: string;
  browserPhoneButton: string;
  inspectPhaseHint: string;
  inspectSelectionLabel: string;
  inspectSelectionNone: string;
  inspectInstructionLabel: string;
  inspectInstructionPlaceholder: string;
  inspectSendButton: string;
  sectionTitle: Record<MobileTab, string>;
  sectionCopy: Record<MobileTab, string>;
};

export type LiveBridgeMessage = {
  type?: string;
  status?: string;
  conn?: string;
  sessions?: Array<{ id?: string; name?: string }>;
  selectedSessionId?: string;
  selectedBrowserSessionId?: string;
  switchNote?: string;
  inspectSelection?: string;
};
