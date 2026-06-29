import type { ShareDialogCopy } from './share-dialog-copy.js';

export interface ShareDialogPhaseOneElements {
  phase1: HTMLDivElement;
  modeGroup: HTMLDivElement;
  rwWarning: HTMLDivElement;
}

export interface ShareDialogActionElements {
  actions: HTMLDivElement;
  closeBtn: HTMLButtonElement;
  backBtn: HTMLButtonElement;
  nextBtn: HTMLButtonElement;
  startBtn: HTMLButtonElement;
  connectBtn: HTMLButtonElement;
}

interface BindShareDialogPhaseNavigationParams {
  phase1: HTMLDivElement;
  phase2: HTMLDivElement;
  nextBtn: HTMLButtonElement;
  backBtn: HTMLButtonElement;
  startBtn: HTMLButtonElement;
  passphraseInput: HTMLInputElement;
  statusEl: HTMLDivElement;
}

export function bindShareDialogPhaseNavigation(params: BindShareDialogPhaseNavigationParams): void {
  const { phase1, phase2, nextBtn, backBtn, startBtn, passphraseInput, statusEl } = params;

  nextBtn.addEventListener('click', () => {
    phase1.classList.add('hidden');
    phase2.classList.remove('hidden');
    nextBtn.classList.add('hidden');
    backBtn.classList.remove('hidden');
    startBtn.classList.remove('hidden');
    passphraseInput.focus();
  });

  backBtn.addEventListener('click', () => {
    phase2.classList.add('hidden');
    phase1.classList.remove('hidden');
    backBtn.classList.add('hidden');
    startBtn.classList.add('hidden');
    nextBtn.classList.remove('hidden');
    statusEl.textContent = '';
  });
}

export function createShareDialogPhaseOne(
  copy: ShareDialogCopy,
  hasMobileApi: boolean,
): ShareDialogPhaseOneElements {
  const phase1 = document.createElement('div');
  phase1.className = 'share-phase';

  const notice = document.createElement('div');
  notice.className = 'share-notice calder-inline-notice';
  notice.textContent = copy.historyNotice;
  phase1.appendChild(notice);

  const rwWarning = document.createElement('div');
  rwWarning.className = 'share-notice calder-inline-notice hidden';
  rwWarning.textContent = copy.readWriteWarning;
  phase1.appendChild(rwWarning);

  const modeSection = document.createElement('div');
  modeSection.className = 'share-section';

  const modeLabel = document.createElement('div');
  modeLabel.className = 'share-label';
  modeLabel.textContent = copy.accessLevel;
  modeSection.appendChild(modeLabel);

  const modeGroup = document.createElement('div');
  modeGroup.className = 'share-radio-group';

  const readonlyRadio = createRadio('share-mode', 'readonly', copy.readOnly, true);
  const readwriteRadio = createRadio('share-mode', 'readwrite', copy.readWrite, false);
  modeGroup.appendChild(readonlyRadio);
  modeGroup.appendChild(readwriteRadio);
  modeSection.appendChild(modeGroup);
  phase1.appendChild(modeSection);

  if (hasMobileApi) {
    const mobileDiscoverabilityNotice = document.createElement('div');
    mobileDiscoverabilityNotice.className = 'share-notice calder-inline-notice';
    mobileDiscoverabilityNotice.textContent = copy.mobileDiscoverabilityNotice;
    phase1.appendChild(mobileDiscoverabilityNotice);
  }

  return {
    phase1,
    modeGroup,
    rwWarning,
  };
}

export function createShareDialogActions(copy: ShareDialogCopy): ShareDialogActionElements {
  const actions = document.createElement('div');
  actions.className = 'share-actions share-actions-shell';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'share-btn share-btn-secondary calder-button';
  closeBtn.textContent = copy.cancel;

  const backBtn = document.createElement('button');
  backBtn.className = 'share-btn share-btn-secondary calder-button hidden';
  backBtn.textContent = copy.back;

  const nextBtn = document.createElement('button');
  nextBtn.className = 'share-btn calder-button';
  nextBtn.textContent = copy.next;

  const startBtn = document.createElement('button');
  startBtn.className = 'share-btn calder-button hidden';
  startBtn.textContent = copy.startSharing;

  const connectBtn = document.createElement('button');
  connectBtn.className = 'share-btn calder-button hidden';
  connectBtn.textContent = copy.connect;
  connectBtn.disabled = true;

  actions.appendChild(closeBtn);
  actions.appendChild(backBtn);
  actions.appendChild(nextBtn);
  actions.appendChild(startBtn);
  actions.appendChild(connectBtn);

  return {
    actions,
    closeBtn,
    backBtn,
    nextBtn,
    startBtn,
    connectBtn,
  };
}

function createRadio(
  name: string,
  value: string,
  labelText: string,
  checked: boolean,
): HTMLElement {
  const wrapper = document.createElement('label');
  wrapper.className = 'share-radio-label';
  const input = document.createElement('input');
  input.type = 'radio';
  input.name = name;
  input.value = value;
  input.checked = checked;
  const span = document.createElement('span');
  span.textContent = labelText;
  wrapper.appendChild(input);
  wrapper.appendChild(span);
  return wrapper;
}
