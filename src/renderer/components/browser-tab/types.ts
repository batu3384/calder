export interface SelectorOption {
  type: 'qa' | 'attr' | 'id' | 'css';
  label: string;
  value: string;
}

export type ActiveSelector = SelectorOption;

export interface ElementInfo {
  tagName: string;
  id: string;
  classes: string[];
  textContent: string;
  selectors: SelectorOption[];
  activeSelector: ActiveSelector;
  pageUrl: string;
}

export interface FlowStep {
  type: 'click' | 'navigate' | 'expect';
  tagName?: string;
  textContent?: string;
  selectors?: SelectorOption[];
  activeSelector?: SelectorOption;
  pageUrl?: string;
  url?: string;
}

export interface FlowPickerMetadata {
  tagName: string;
  textContent: string;
  selectors: SelectorOption[];
  pageUrl: string;
}

export type FlowPickerAction = 'click' | 'record' | 'click-and-record';

export interface ViewportPreset {
  label: string;
  width: number | null;
  height: number | null;
}

export const VIEWPORT_PRESETS: ViewportPreset[] = [
  { label: 'Responsive', width: null, height: null },
  { label: 'iPhone SE',  width: 375,  height: 667  },
  { label: 'iPhone 14',  width: 393,  height: 852  },
  { label: 'Pixel 7',    width: 412,  height: 915  },
  { label: 'iPad Air',   width: 820,  height: 1180 },
  { label: 'iPad Pro',   width: 1024, height: 1366 },
];

export interface WebviewElement extends HTMLElement {
  src: string;
  canGoBack(): boolean;
  canGoForward(): boolean;
  goBack(): void;
  goForward(): void;
  reload(): void;
  stop(): void;
  send(channel: string, ...args: unknown[]): void;
  capturePage(rect?: { x: number; y: number; width: number; height: number }): Promise<{
    toDataURL(): string;
    toPNG(): Uint8Array;
  }>;
}

export interface BrowserTabInstance {
  sessionId: string;
  element: HTMLDivElement;
  webview: WebviewElement;
  webviewReady: boolean;
  statusBadge: HTMLSpanElement;
  toolbarHint: HTMLDivElement;
  modeBadge: HTMLButtonElement;
  targetBadge: HTMLButtonElement;
  committedUrl: string;
  contentShell: HTMLDivElement;
  viewportContainer: HTMLDivElement;
  newTabPage: HTMLDivElement;
  urlInput: HTMLInputElement;
  goBtn: HTMLButtonElement;
  inspectBtn: HTMLButtonElement;
  viewportBtn: HTMLButtonElement;
  viewportDropdown: HTMLDivElement;
  inspectPanel: HTMLDivElement;
  inspectTitleEl: HTMLDivElement;
  inspectSubtitleEl: HTMLDivElement;
  instructionInput: HTMLTextAreaElement;
  submitBtn: HTMLButtonElement;
  inspectTargetBtn: HTMLButtonElement;
  inspectAttachDimsCheckbox: HTMLInputElement;
  inspectErrorEl: HTMLDivElement;
  elementInfoEl: HTMLDivElement;
  inspectMode: boolean;
  selectedElement: ElementInfo | null;
  currentViewport: ViewportPreset;
  isLoading: boolean;
  viewportOutsideClickHandler: (e: MouseEvent) => void;
  recordBtn: HTMLButtonElement;
  flowPanel: HTMLDivElement;
  flowPanelLabel: HTMLSpanElement;
  flowStepsList: HTMLDivElement;
  flowInputRow: HTMLDivElement;
  flowInstructionInput: HTMLTextAreaElement;
  flowSubmitBtn: HTMLButtonElement;
  flowTargetBtn: HTMLButtonElement;
  flowErrorEl: HTMLDivElement;
  flowMode: boolean;
  flowSteps: FlowStep[];
  flowPickerOverlay: HTMLDivElement;
  flowPickerMenu: HTMLDivElement;
  flowPickerPending: FlowPickerMetadata | null;
  drawBtn: HTMLButtonElement;
  drawPanel: HTMLDivElement;
  drawInstructionInput: HTMLTextAreaElement;
  drawSubmitBtn: HTMLButtonElement;
  drawTargetBtn: HTMLButtonElement;
  drawAttachDimsCheckbox: HTMLInputElement;
  drawErrorEl: HTMLDivElement;
  drawMode: boolean;
  targetMenu: HTMLDivElement;
  targetMenuList: HTMLDivElement;
  targetMenuOutsideClickHandler: (e: MouseEvent) => void;
  targetMenuFloatingCleanup: (() => void) | null;
  activeTargetTrigger: HTMLButtonElement | null;
  activeTargetMode: 'inspect' | 'draw' | 'flow' | null;
  syncSurfaceVisibility: (showEmptySurface: boolean) => void;
  syncAddressBarState: () => void;
  syncToolbarState: () => void;
  cleanupFns: Array<() => void>;
}
