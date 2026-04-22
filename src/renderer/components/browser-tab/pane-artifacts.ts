import { createBrowserAuthPanel } from './auth-panel.js';
import {
  appendFlowPickerMenuOptions,
  createDrawPanelElements,
  createFlowPanelElements,
  createFlowPickerElements,
  createInspectPanelElements,
  createTargetMenuElements,
} from './pane-capture-elements.js';

export interface BrowserPaneCaptureArtifacts {
  inspectPanel: HTMLDivElement;
  inspectHandle: HTMLDivElement;
  inspectTitle: HTMLDivElement;
  inspectSubtitle: HTMLDivElement;
  elementInfoEl: HTMLDivElement;
  instructionInput: HTMLTextAreaElement;
  submitBtn: HTMLButtonElement;
  customBtn: HTMLButtonElement;
  inspectAttachDimsCheckbox: HTMLInputElement;
  inspectErrorEl: HTMLDivElement;
  inspectContextTraceEl: HTMLDivElement;
  drawPanel: HTMLDivElement;
  drawInstructionInput: HTMLTextAreaElement;
  drawSubmitBtn: HTMLButtonElement;
  drawCustomBtn: HTMLButtonElement;
  drawAttachDimsCheckbox: HTMLInputElement;
  drawClearBtn: HTMLButtonElement;
  drawErrorEl: HTMLDivElement;
  drawContextTraceEl: HTMLDivElement;
  flowPanel: HTMLDivElement;
  flowLabel: HTMLSpanElement;
  flowStepsList: HTMLDivElement;
  flowInputRow: HTMLDivElement;
  flowInstructionInput: HTMLTextAreaElement;
  flowSubmitBtn: HTMLButtonElement;
  flowCustomBtn: HTMLButtonElement;
  flowClearBtn: HTMLButtonElement;
  flowErrorEl: HTMLDivElement;
  flowContextTraceEl: HTMLDivElement;
  flowPickerOverlay: HTMLDivElement;
  flowPickerMenu: HTMLDivElement;
  targetMenu: HTMLDivElement;
  targetMenuList: HTMLDivElement;
}

export interface BrowserAuthPanelArtifacts {
  authPanel: HTMLDivElement;
  authOriginEl: HTMLDivElement;
  authProfileSelect: HTMLSelectElement;
  authLabelInput: HTMLInputElement;
  authUsernameInput: HTMLInputElement;
  authPasswordInput: HTMLInputElement;
  authAutoFillCheckbox: HTMLInputElement;
  authStatusEl: HTMLDivElement;
  authDeleteBtn: HTMLButtonElement;
  authSaveBtn: HTMLButtonElement;
  authFillBtn: HTMLButtonElement;
  authCloseBtn: HTMLButtonElement;
}

export function createBrowserPaneCaptureArtifacts(el: HTMLDivElement): BrowserPaneCaptureArtifacts {
  const inspectPanelElements = createInspectPanelElements();
  const inspectPanel = inspectPanelElements.panel;
  const inspectHandle = inspectPanelElements.handle;
  const inspectTitle = inspectPanelElements.titleEl;
  const inspectSubtitle = inspectPanelElements.subtitleEl;
  const elementInfoEl = inspectPanelElements.elementInfoEl;
  const instructionInput = inspectPanelElements.instructionInput;
  const submitBtn = inspectPanelElements.submitBtn;
  const customBtn = inspectPanelElements.targetBtn;
  const inspectAttachDimsCheckbox = inspectPanelElements.attachDimsCheckbox;
  const inspectErrorEl = inspectPanelElements.errorEl;
  const inspectContextTraceEl = inspectPanelElements.contextTraceEl;
  el.appendChild(inspectPanel);

  const drawPanelElements = createDrawPanelElements();
  const drawPanel = drawPanelElements.panel;
  const drawInstructionInput = drawPanelElements.instructionInput;
  const drawSubmitBtn = drawPanelElements.submitBtn;
  const drawCustomBtn = drawPanelElements.targetBtn;
  const drawAttachDimsCheckbox = drawPanelElements.attachDimsCheckbox;
  const drawClearBtn = drawPanelElements.clearBtn;
  const drawErrorEl = drawPanelElements.errorEl;
  const drawContextTraceEl = drawPanelElements.contextTraceEl;
  el.appendChild(drawPanel);

  const flowPanelElements = createFlowPanelElements();
  const flowPanel = flowPanelElements.panel;
  const flowLabel = flowPanelElements.labelEl;
  const flowStepsList = flowPanelElements.stepsList;
  const flowInputRow = flowPanelElements.inputRow;
  const flowInstructionInput = flowPanelElements.instructionInput;
  const flowSubmitBtn = flowPanelElements.submitBtn;
  const flowCustomBtn = flowPanelElements.targetBtn;
  const flowClearBtn = flowPanelElements.clearBtn;
  const flowErrorEl = flowPanelElements.errorEl;
  const flowContextTraceEl = flowPanelElements.contextTraceEl;
  el.appendChild(flowPanel);

  const flowPickerElements = createFlowPickerElements();
  const flowPickerOverlay = flowPickerElements.overlay;
  const flowPickerMenu = flowPickerElements.menu;
  appendFlowPickerMenuOptions(flowPickerMenu);
  el.appendChild(flowPickerOverlay);

  const targetMenuElements = createTargetMenuElements();
  const targetMenu = targetMenuElements.menu;
  const targetMenuList = targetMenuElements.list;
  el.appendChild(targetMenu);

  return {
    inspectPanel,
    inspectHandle,
    inspectTitle,
    inspectSubtitle,
    elementInfoEl,
    instructionInput,
    submitBtn,
    customBtn,
    inspectAttachDimsCheckbox,
    inspectErrorEl,
    inspectContextTraceEl,
    drawPanel,
    drawInstructionInput,
    drawSubmitBtn,
    drawCustomBtn,
    drawAttachDimsCheckbox,
    drawClearBtn,
    drawErrorEl,
    drawContextTraceEl,
    flowPanel,
    flowLabel,
    flowStepsList,
    flowInputRow,
    flowInstructionInput,
    flowSubmitBtn,
    flowCustomBtn,
    flowClearBtn,
    flowErrorEl,
    flowContextTraceEl,
    flowPickerOverlay,
    flowPickerMenu,
    targetMenu,
    targetMenuList,
  };
}

export function createBrowserAuthPanelArtifacts(el: HTMLDivElement): BrowserAuthPanelArtifacts {
  const {
    authPanel,
    authOriginEl,
    authProfileSelect,
    authLabelInput,
    authUsernameInput,
    authPasswordInput,
    authAutoFillCheckbox,
    authStatusEl,
    authDeleteBtn,
    authSaveBtn,
    authFillBtn,
    authCloseBtn,
  } = createBrowserAuthPanel();
  el.appendChild(authPanel);
  return {
    authPanel,
    authOriginEl,
    authProfileSelect,
    authLabelInput,
    authUsernameInput,
    authPasswordInput,
    authAutoFillCheckbox,
    authStatusEl,
    authDeleteBtn,
    authSaveBtn,
    authFillBtn,
    authCloseBtn,
  };
}
