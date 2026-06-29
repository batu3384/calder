import type { FlowPickerAction } from './types.js';

export interface BrowserInspectPanelElements {
  panel: HTMLDivElement;
  handle: HTMLDivElement;
  titleEl: HTMLDivElement;
  subtitleEl: HTMLDivElement;
  elementInfoEl: HTMLDivElement;
  instructionInput: HTMLTextAreaElement;
  submitBtn: HTMLButtonElement;
  targetBtn: HTMLButtonElement;
  attachDimsCheckbox: HTMLInputElement;
  errorEl: HTMLDivElement;
  contextTraceEl: HTMLDivElement;
}

export interface BrowserDrawPanelElements {
  panel: HTMLDivElement;
  instructionInput: HTMLTextAreaElement;
  submitBtn: HTMLButtonElement;
  targetBtn: HTMLButtonElement;
  attachDimsCheckbox: HTMLInputElement;
  clearBtn: HTMLButtonElement;
  errorEl: HTMLDivElement;
  contextTraceEl: HTMLDivElement;
}

export interface BrowserFlowPanelElements {
  panel: HTMLDivElement;
  labelEl: HTMLSpanElement;
  stepsList: HTMLDivElement;
  inputRow: HTMLDivElement;
  instructionInput: HTMLTextAreaElement;
  submitBtn: HTMLButtonElement;
  targetBtn: HTMLButtonElement;
  clearBtn: HTMLButtonElement;
  errorEl: HTMLDivElement;
  contextTraceEl: HTMLDivElement;
}

export interface BrowserFlowPickerElements {
  overlay: HTMLDivElement;
  menu: HTMLDivElement;
}

export interface BrowserTargetMenuElements {
  menu: HTMLDivElement;
  list: HTMLDivElement;
}

export function createInspectPanelElements(): BrowserInspectPanelElements {
  const panel = document.createElement('div');
  panel.className = 'browser-inspect-panel';
  panel.classList.add('calder-popover');
  panel.style.display = 'none';

  const handle = document.createElement('div');
  handle.className = 'browser-inspect-panel-handle';

  const handleLabel = document.createElement('span');
  handleLabel.className = 'browser-inspect-panel-handle-label';
  handleLabel.textContent = 'Element capture';

  const handleGrip = document.createElement('span');
  handleGrip.className = 'browser-inspect-panel-handle-grip';
  handleGrip.textContent = 'Move';

  handle.appendChild(handleLabel);
  handle.appendChild(handleGrip);
  panel.appendChild(handle);

  const header = document.createElement('div');
  header.className = 'browser-capture-header';

  const copy = document.createElement('div');
  copy.className = 'browser-capture-copy';

  const kicker = document.createElement('div');
  kicker.className = 'browser-capture-kicker';
  kicker.textContent = 'Inspect target';

  const titleEl = document.createElement('div');
  titleEl.className = 'browser-capture-title';
  titleEl.textContent = 'Select an element';

  const subtitleEl = document.createElement('div');
  subtitleEl.className = 'browser-capture-subtitle';
  subtitleEl.textContent =
    'Click a page element to capture its selector and send a focused prompt.';

  copy.appendChild(kicker);
  copy.appendChild(titleEl);
  copy.appendChild(subtitleEl);

  const chip = document.createElement('span');
  chip.className = 'browser-capture-chip';
  chip.textContent = 'Inspect';

  header.appendChild(copy);
  header.appendChild(chip);
  panel.appendChild(header);

  const elementInfoEl = document.createElement('div');
  elementInfoEl.className = 'inspect-element-info';
  panel.appendChild(elementInfoEl);

  const inputRow = document.createElement('div');
  inputRow.className = 'inspect-input-row';

  const instructionInput = document.createElement('textarea');
  instructionInput.className = 'inspect-instruction-input';
  instructionInput.rows = 3;
  instructionInput.placeholder = 'Describe what you want to do\u2026';

  const submitGroup = document.createElement('div');
  submitGroup.className = 'inspect-submit-group';

  const submitBtn = document.createElement('button');
  submitBtn.className = 'inspect-submit-btn';
  submitBtn.textContent = 'Send to selected';

  const targetBtn = document.createElement('button');
  targetBtn.className = 'inspect-dropdown-btn browser-target-trigger';
  targetBtn.textContent = 'Select Session \u25BE';
  targetBtn.title = 'Choose target session';

  submitGroup.appendChild(submitBtn);
  submitGroup.appendChild(targetBtn);

  inputRow.appendChild(instructionInput);
  panel.appendChild(inputRow);

  const attachDimsRow = document.createElement('label');
  attachDimsRow.className = 'inspect-attach-dims-row';
  const attachDimsCheckbox = document.createElement('input');
  attachDimsCheckbox.type = 'checkbox';
  attachDimsCheckbox.checked = true;
  const attachDimsText = document.createElement('span');
  attachDimsText.textContent = 'Attach browser dimensions to the instructions';
  attachDimsRow.appendChild(attachDimsCheckbox);
  attachDimsRow.appendChild(attachDimsText);
  panel.appendChild(attachDimsRow);

  const errorEl = document.createElement('div');
  errorEl.className = 'inspect-error-text';
  panel.appendChild(errorEl);

  const contextTraceEl = document.createElement('div');
  contextTraceEl.className = 'inspect-context-trace';
  panel.appendChild(contextTraceEl);

  panel.appendChild(submitGroup);

  return {
    panel,
    handle,
    titleEl,
    subtitleEl,
    elementInfoEl,
    instructionInput,
    submitBtn,
    targetBtn,
    attachDimsCheckbox,
    errorEl,
    contextTraceEl,
  };
}

export function createDrawPanelElements(): BrowserDrawPanelElements {
  const panel = document.createElement('div');
  panel.className = 'browser-inspect-panel browser-draw-panel';
  panel.classList.add('calder-popover');
  panel.style.display = 'none';

  const header = document.createElement('div');
  header.className = 'browser-capture-header';

  const copy = document.createElement('div');
  copy.className = 'browser-capture-copy';

  const kicker = document.createElement('div');
  kicker.className = 'browser-capture-kicker';
  kicker.textContent = 'Annotated capture';

  const title = document.createElement('div');
  title.className = 'browser-capture-title';
  title.textContent = 'Mark the page, then hand it off';

  const subtitle = document.createElement('div');
  subtitle.className = 'browser-capture-subtitle';
  subtitle.textContent =
    'Sketch directly on the surface and send the annotated screenshot with your instructions.';

  copy.appendChild(kicker);
  copy.appendChild(title);
  copy.appendChild(subtitle);

  const chip = document.createElement('span');
  chip.className = 'browser-capture-chip';
  chip.textContent = 'Draw';

  header.appendChild(copy);
  header.appendChild(chip);
  panel.appendChild(header);

  const controlsRow = document.createElement('div');
  controlsRow.className = 'inspect-input-row';

  const instructionInput = document.createElement('textarea');
  instructionInput.className = 'inspect-instruction-input';
  instructionInput.rows = 3;
  instructionInput.placeholder = 'Describe what you want to do\u2026';

  const submitGroup = document.createElement('div');
  submitGroup.className = 'inspect-submit-group';

  const clearBtn = document.createElement('button');
  clearBtn.className = 'inspect-clear-btn';
  clearBtn.textContent = 'Clear';
  clearBtn.title = 'Clear drawing';

  const submitBtn = document.createElement('button');
  submitBtn.className = 'inspect-submit-btn';
  submitBtn.textContent = 'Send to selected';

  const targetBtn = document.createElement('button');
  targetBtn.className = 'inspect-dropdown-btn browser-target-trigger';
  targetBtn.textContent = 'Select Session \u25BE';
  targetBtn.title = 'Choose target session';

  submitGroup.appendChild(submitBtn);
  submitGroup.appendChild(targetBtn);

  const actions = document.createElement('div');
  actions.className = 'inspect-draw-actions';
  actions.appendChild(clearBtn);
  actions.appendChild(submitGroup);

  controlsRow.appendChild(instructionInput);
  panel.appendChild(controlsRow);

  const attachDimsRow = document.createElement('label');
  attachDimsRow.className = 'inspect-attach-dims-row';
  const attachDimsCheckbox = document.createElement('input');
  attachDimsCheckbox.type = 'checkbox';
  attachDimsCheckbox.checked = true;
  const attachDimsText = document.createElement('span');
  attachDimsText.textContent = 'Attach browser dimensions to the instructions';
  attachDimsRow.appendChild(attachDimsCheckbox);
  attachDimsRow.appendChild(attachDimsText);
  panel.appendChild(attachDimsRow);

  const errorEl = document.createElement('div');
  errorEl.className = 'inspect-error-text';
  panel.appendChild(errorEl);

  const contextTraceEl = document.createElement('div');
  contextTraceEl.className = 'inspect-context-trace';
  panel.appendChild(contextTraceEl);

  panel.appendChild(actions);

  return {
    panel,
    instructionInput,
    submitBtn,
    targetBtn,
    attachDimsCheckbox,
    clearBtn,
    errorEl,
    contextTraceEl,
  };
}

export function createFlowPanelElements(): BrowserFlowPanelElements {
  const panel = document.createElement('div');
  panel.className = 'browser-capture-panel browser-flow-panel';
  panel.style.display = 'none';

  const header = document.createElement('div');
  header.className = 'flow-panel-header';

  const copy = document.createElement('div');
  copy.className = 'browser-capture-copy';

  const kicker = document.createElement('div');
  kicker.className = 'browser-capture-kicker';
  kicker.textContent = 'Recorded flow';

  const labelEl = document.createElement('span');
  labelEl.className = 'flow-panel-label';
  labelEl.textContent = 'Flow (0 steps)';

  const subtitle = document.createElement('div');
  subtitle.className = 'browser-capture-subtitle';
  subtitle.textContent =
    'Capture a short browser path and route it into an AI session as a reproducible handoff.';

  copy.appendChild(kicker);
  copy.appendChild(labelEl);
  copy.appendChild(subtitle);

  const chip = document.createElement('span');
  chip.className = 'browser-capture-chip';
  chip.textContent = 'Flow';

  const clearBtn = document.createElement('button');
  clearBtn.className = 'flow-panel-clear-btn';
  clearBtn.textContent = 'Clear';

  const headerActions = document.createElement('div');
  headerActions.className = 'inspect-draw-actions';
  headerActions.appendChild(chip);
  headerActions.appendChild(clearBtn);

  header.appendChild(copy);
  header.appendChild(headerActions);
  panel.appendChild(header);

  const stepsList = document.createElement('div');
  stepsList.className = 'flow-steps-list';
  panel.appendChild(stepsList);

  const inputRow = document.createElement('div');
  inputRow.className = 'flow-input-row';
  inputRow.style.display = 'none';

  const instructionInput = document.createElement('textarea');
  instructionInput.className = 'flow-instruction-input';
  instructionInput.placeholder = 'Describe what to do with this flow\u2026';
  instructionInput.rows = 2;

  const submitGroup = document.createElement('div');
  submitGroup.className = 'inspect-submit-group';

  const submitBtn = document.createElement('button');
  submitBtn.className = 'inspect-submit-btn';
  submitBtn.textContent = 'Send to selected';

  const targetBtn = document.createElement('button');
  targetBtn.className = 'inspect-dropdown-btn browser-target-trigger';
  targetBtn.textContent = 'Select Session \u25BE';
  targetBtn.title = 'Choose target session';

  submitGroup.appendChild(submitBtn);
  submitGroup.appendChild(targetBtn);
  inputRow.appendChild(instructionInput);
  inputRow.appendChild(submitGroup);
  panel.appendChild(inputRow);

  const errorEl = document.createElement('div');
  errorEl.className = 'inspect-error-text';
  panel.appendChild(errorEl);

  const contextTraceEl = document.createElement('div');
  contextTraceEl.className = 'inspect-context-trace';
  panel.appendChild(contextTraceEl);

  return {
    panel,
    labelEl,
    stepsList,
    inputRow,
    instructionInput,
    submitBtn,
    targetBtn,
    clearBtn,
    errorEl,
    contextTraceEl,
  };
}

export function createFlowPickerElements(): BrowserFlowPickerElements {
  const overlay = document.createElement('div');
  overlay.className = 'flow-picker-overlay';
  overlay.style.display = 'none';

  const menu = document.createElement('div');
  menu.className = 'flow-picker-menu';
  overlay.appendChild(menu);

  return { overlay, menu };
}

export function appendFlowPickerMenuOptions(menu: HTMLDivElement): void {
  const pickerOptions: { label: string; sub: string; action: FlowPickerAction }[] = [
    { label: 'Click', sub: 'Navigate without recording', action: 'click' },
    { label: 'Record', sub: 'Capture without clicking', action: 'record' },
    { label: 'Click + Record', sub: 'Click and add step', action: 'click-and-record' },
  ];

  for (const opt of pickerOptions) {
    const item = document.createElement('button');
    item.className = 'flow-picker-item';
    item.dataset['action'] = opt.action;

    const labelEl = document.createElement('span');
    labelEl.className = 'flow-picker-label';
    labelEl.textContent = opt.label;

    const subEl = document.createElement('span');
    subEl.className = 'flow-picker-sub';
    subEl.textContent = opt.sub;

    item.appendChild(labelEl);
    item.appendChild(subEl);
    menu.appendChild(item);
  }
}

export function createTargetMenuElements(): BrowserTargetMenuElements {
  const menu = document.createElement('div');
  menu.className = 'browser-target-menu';
  menu.classList.add('calder-popover');
  menu.style.display = 'none';

  const list = document.createElement('div');
  list.className = 'browser-target-menu-list';
  menu.appendChild(list);

  return { menu, list };
}
