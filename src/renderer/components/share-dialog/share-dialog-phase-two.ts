import { createPassphraseInput } from '../surface-services/dom-utils.js';
import { generatePassphrase } from '../../sharing/share-crypto.js';
import type { ShareDialogCopy } from './share-dialog-copy.js';

export interface ShareDialogPhaseTwoElements {
  phase2: HTMLDivElement;
  passphraseLabel: HTMLDivElement;
  passphraseInput: HTMLInputElement;
  manualToggleRow: HTMLDivElement;
  manualToggleBtn: HTMLButtonElement;
  manualSection: HTMLDivElement;
  offerSection: HTMLDivElement;
  offerTextarea: HTMLTextAreaElement;
  answerSection: HTMLDivElement;
  answerTextarea: HTMLTextAreaElement;
  mobileSection: HTMLDivElement;
  mobileLinkInput: HTMLInputElement;
  mobileFallbackRow: HTMLDivElement;
  mobileFallbackInput: HTMLInputElement;
  useMobileFallbackBtn: HTMLButtonElement;
  copyMobileFallbackBtn: HTMLButtonElement;
  mobileOtpBadge: HTMLDivElement;
  mobileOtpHint: HTMLDivElement;
  mobileQrImg: HTMLImageElement;
  mobileStatus: HTMLDivElement;
  retryMobilePairingBtn: HTMLButtonElement;
}

async function copyToClipboard(text: string): Promise<void> {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
    throw new Error('Clipboard not available');
  }
  await navigator.clipboard.writeText(text);
}

function attachCopyFeedback(
  button: HTMLButtonElement,
  getValue: () => string,
  defaultText: string,
  copy: ShareDialogCopy,
): void {
  button.addEventListener('click', () => {
    const value = getValue().trim();
    if (!value) return;
    void copyToClipboard(value)
      .then(() => {
        button.textContent = copy.copied;
        setTimeout(() => { button.textContent = defaultText; }, 1500);
      })
      .catch(() => {
        button.textContent = copy.copyFailed;
        setTimeout(() => { button.textContent = defaultText; }, 1800);
      });
  });
}

interface ManualSectionElements {
  manualSection: HTMLDivElement;
  offerSection: HTMLDivElement;
  offerTextarea: HTMLTextAreaElement;
  answerSection: HTMLDivElement;
  answerTextarea: HTMLTextAreaElement;
}

interface MobileSectionElements {
  mobileSection: HTMLDivElement;
  mobileLinkInput: HTMLInputElement;
  mobileFallbackRow: HTMLDivElement;
  mobileFallbackInput: HTMLInputElement;
  useMobileFallbackBtn: HTMLButtonElement;
  copyMobileFallbackBtn: HTMLButtonElement;
  mobileOtpBadge: HTMLDivElement;
  mobileOtpHint: HTMLDivElement;
  mobileQrImg: HTMLImageElement;
  mobileStatus: HTMLDivElement;
  retryMobilePairingBtn: HTMLButtonElement;
}

function createManualToggleRow(copy: ShareDialogCopy): {
  manualToggleRow: HTMLDivElement;
  manualToggleBtn: HTMLButtonElement;
  manualHint: HTMLDivElement;
} {
  const manualToggleRow = document.createElement('div');
  manualToggleRow.className = 'share-manual-toggle-row';

  const manualToggleBtn = document.createElement('button');
  manualToggleBtn.type = 'button';
  manualToggleBtn.className = 'share-btn share-btn-secondary calder-button';
  manualToggleBtn.textContent = copy.showManualCodes;
  manualToggleRow.appendChild(manualToggleBtn);

  const manualHint = document.createElement('div');
  manualHint.className = 'share-manual-hint';
  manualHint.textContent = copy.manualCodesHint;
  return { manualToggleRow, manualToggleBtn, manualHint };
}

function createPinSection(copy: ShareDialogCopy): {
  pinSection: HTMLDivElement;
  passphraseLabel: HTMLDivElement;
  passphraseInput: HTMLInputElement;
} {
  const pinSection = document.createElement('div');
  pinSection.className = 'share-section';

  const passphraseLabel = document.createElement('div');
  passphraseLabel.className = 'share-label';
  passphraseLabel.textContent = copy.passphraseLabel;

  const passphraseHint = document.createElement('div');
  passphraseHint.className = 'share-passphrase-hint';
  passphraseHint.textContent = copy.passphraseHint;

  const passphraseInput = createPassphraseInput({
    placeholder: copy.oneTimePassphrasePlaceholder,
    value: generatePassphrase(),
  });

  pinSection.appendChild(passphraseLabel);
  pinSection.appendChild(passphraseHint);
  pinSection.appendChild(passphraseInput);

  return { pinSection, passphraseLabel, passphraseInput };
}

function createOfferSection(copy: ShareDialogCopy): {
  offerSection: HTMLDivElement;
  offerTextarea: HTMLTextAreaElement;
} {
  const offerSection = document.createElement('div');
  offerSection.className = 'share-section hidden';

  const offerLabel = document.createElement('div');
  offerLabel.className = 'share-label';
  offerLabel.textContent = copy.offerLabel;
  offerSection.appendChild(offerLabel);

  const offerTextarea = document.createElement('textarea');
  offerTextarea.className = 'share-code';
  offerTextarea.readOnly = true;
  offerTextarea.rows = 3;
  offerSection.appendChild(offerTextarea);

  const copyOfferBtn = document.createElement('button');
  copyOfferBtn.className = 'share-btn share-btn-secondary calder-button';
  copyOfferBtn.textContent = copy.copyButton;
  attachCopyFeedback(copyOfferBtn, () => offerTextarea.value, copy.copyButton, copy);
  offerSection.appendChild(copyOfferBtn);

  return { offerSection, offerTextarea };
}

function createAnswerSection(copy: ShareDialogCopy): {
  answerSection: HTMLDivElement;
  answerTextarea: HTMLTextAreaElement;
} {
  const answerSection = document.createElement('div');
  answerSection.className = 'share-section hidden';

  const answerLabel = document.createElement('div');
  answerLabel.className = 'share-label';
  answerLabel.textContent = copy.answerLabel;
  answerSection.appendChild(answerLabel);

  const answerTextarea = document.createElement('textarea');
  answerTextarea.className = 'share-code';
  answerTextarea.rows = 3;
  answerTextarea.placeholder = copy.answerPlaceholder;
  answerSection.appendChild(answerTextarea);

  return { answerSection, answerTextarea };
}

function createManualSection(copy: ShareDialogCopy, pinSection: HTMLDivElement): ManualSectionElements {
  const manualSection = document.createElement('div');
  manualSection.className = 'share-manual-section hidden';
  manualSection.appendChild(pinSection);

  const { offerSection, offerTextarea } = createOfferSection(copy);
  manualSection.appendChild(offerSection);

  const { answerSection, answerTextarea } = createAnswerSection(copy);
  manualSection.appendChild(answerSection);

  return {
    manualSection,
    offerSection,
    offerTextarea,
    answerSection,
    answerTextarea,
  };
}

function createMobileSteps(copy: ShareDialogCopy): HTMLOListElement {
  const mobileSteps = document.createElement('ol');
  mobileSteps.className = 'share-mobile-steps';
  for (const step of [copy.quickHandoffStepScan, copy.quickHandoffStepOtp, copy.quickHandoffStepAuto]) {
    const item = document.createElement('li');
    item.textContent = step;
    mobileSteps.appendChild(item);
  }
  return mobileSteps;
}

function createMobileLinkRow(copy: ShareDialogCopy): {
  mobileLinkRow: HTMLDivElement;
  mobileLinkInput: HTMLInputElement;
} {
  const mobileLinkRow = document.createElement('div');
  mobileLinkRow.className = 'share-mobile-link-row';

  const mobileLinkInput = document.createElement('input');
  mobileLinkInput.className = 'share-mobile-link';
  mobileLinkInput.type = 'text';
  mobileLinkInput.readOnly = true;
  mobileLinkInput.placeholder = copy.mobilePairingLinkPlaceholder;

  const copyMobileLinkBtn = document.createElement('button');
  copyMobileLinkBtn.className = 'share-btn share-btn-secondary calder-button';
  copyMobileLinkBtn.textContent = copy.copyLink;
  attachCopyFeedback(copyMobileLinkBtn, () => mobileLinkInput.value, copy.copyLink, copy);

  mobileLinkRow.appendChild(mobileLinkInput);
  mobileLinkRow.appendChild(copyMobileLinkBtn);

  return { mobileLinkRow, mobileLinkInput };
}

function createMobileFallbackRow(copy: ShareDialogCopy): {
  mobileFallbackRow: HTMLDivElement;
  mobileFallbackInput: HTMLInputElement;
  useMobileFallbackBtn: HTMLButtonElement;
  copyMobileFallbackBtn: HTMLButtonElement;
} {
  const mobileFallbackRow = document.createElement('div');
  mobileFallbackRow.className = 'share-mobile-link-row share-mobile-fallback-row hidden';

  const mobileFallbackInput = document.createElement('input');
  mobileFallbackInput.className = 'share-mobile-link';
  mobileFallbackInput.type = 'text';
  mobileFallbackInput.readOnly = true;
  mobileFallbackInput.placeholder = copy.lanFallbackLinkPlaceholder;

  const useMobileFallbackBtn = document.createElement('button');
  useMobileFallbackBtn.className = 'share-btn share-btn-secondary calder-button';
  useMobileFallbackBtn.textContent = copy.useFallback;

  const copyMobileFallbackBtn = document.createElement('button');
  copyMobileFallbackBtn.className = 'share-btn share-btn-secondary calder-button';
  copyMobileFallbackBtn.textContent = copy.copyFallback;
  attachCopyFeedback(copyMobileFallbackBtn, () => mobileFallbackInput.value, copy.copyFallback, copy);

  mobileFallbackRow.appendChild(mobileFallbackInput);
  mobileFallbackRow.appendChild(useMobileFallbackBtn);
  mobileFallbackRow.appendChild(copyMobileFallbackBtn);

  return {
    mobileFallbackRow,
    mobileFallbackInput,
    useMobileFallbackBtn,
    copyMobileFallbackBtn,
  };
}

function createMobileOtpSection(copy: ShareDialogCopy): {
  mobileOtpLabel: HTMLDivElement;
  mobileOtpRow: HTMLDivElement;
  mobileOtpBadge: HTMLDivElement;
  mobileOtpHint: HTMLDivElement;
} {
  const mobileOtpLabel = document.createElement('div');
  mobileOtpLabel.className = 'share-label';
  mobileOtpLabel.textContent = copy.otpLabel;

  const mobileOtpRow = document.createElement('div');
  mobileOtpRow.className = 'share-mobile-otp-row';

  const mobileOtpBadge = document.createElement('div');
  mobileOtpBadge.className = 'share-mobile-otp';
  mobileOtpBadge.textContent = '------';

  const copyMobileOtpBtn = document.createElement('button');
  copyMobileOtpBtn.className = 'share-btn share-btn-secondary calder-button';
  copyMobileOtpBtn.textContent = copy.copyOtp;
  attachCopyFeedback(
    copyMobileOtpBtn,
    () => mobileOtpBadge.textContent?.replace(/\s+/g, '') ?? '',
    copy.copyOtp,
    copy,
  );
  mobileOtpRow.appendChild(mobileOtpBadge);
  mobileOtpRow.appendChild(copyMobileOtpBtn);

  const mobileOtpHint = document.createElement('div');
  mobileOtpHint.className = 'share-mobile-otp-hint';
  mobileOtpHint.textContent = copy.waitingPairingCode;

  return {
    mobileOtpLabel,
    mobileOtpRow,
    mobileOtpBadge,
    mobileOtpHint,
  };
}

function createMobileQrSection(copy: ShareDialogCopy): {
  mobileQrWrap: HTMLDivElement;
  mobileQrImg: HTMLImageElement;
  mobileStatusRow: HTMLDivElement;
  mobileStatus: HTMLDivElement;
  retryMobilePairingBtn: HTMLButtonElement;
} {
  const mobileQrWrap = document.createElement('div');
  mobileQrWrap.className = 'share-mobile-qr-wrap';

  const mobileQrImg = document.createElement('img');
  mobileQrImg.className = 'share-mobile-qr';
  mobileQrImg.alt = copy.mobileControlQrAlt;
  mobileQrWrap.appendChild(mobileQrImg);

  const mobileStatusRow = document.createElement('div');
  mobileStatusRow.className = 'share-mobile-status-row';

  const mobileStatus = document.createElement('div');
  mobileStatus.className = 'share-mobile-status';
  mobileStatus.textContent = copy.waitingPairingCode;
  mobileStatusRow.appendChild(mobileStatus);

  const retryMobilePairingBtn = document.createElement('button');
  retryMobilePairingBtn.type = 'button';
  retryMobilePairingBtn.className = 'share-btn share-btn-secondary calder-button share-mobile-retry hidden';
  retryMobilePairingBtn.textContent = copy.retryQr;
  mobileStatusRow.appendChild(retryMobilePairingBtn);

  return {
    mobileQrWrap,
    mobileQrImg,
    mobileStatusRow,
    mobileStatus,
    retryMobilePairingBtn,
  };
}

function createMobileSection(copy: ShareDialogCopy): MobileSectionElements {
  const mobileSection = document.createElement('div');
  mobileSection.className = 'share-section share-mobile-section hidden';

  const mobileLabel = document.createElement('div');
  mobileLabel.className = 'share-label share-mobile-quick-label';
  mobileLabel.textContent = copy.quickHandoffRecommended;
  mobileSection.appendChild(mobileLabel);

  const mobileHint = document.createElement('div');
  mobileHint.className = 'share-notice calder-inline-notice';
  mobileHint.textContent = copy.mobileHandoffHint;
  mobileSection.appendChild(mobileHint);

  const mobileStepsLabel = document.createElement('div');
  mobileStepsLabel.className = 'share-label share-mobile-steps-label';
  mobileStepsLabel.textContent = copy.quickHandoffStepsLabel;
  mobileSection.appendChild(mobileStepsLabel);
  mobileSection.appendChild(createMobileSteps(copy));

  const { mobileLinkRow, mobileLinkInput } = createMobileLinkRow(copy);
  mobileSection.appendChild(mobileLinkRow);

  const {
    mobileFallbackRow,
    mobileFallbackInput,
    useMobileFallbackBtn,
    copyMobileFallbackBtn,
  } = createMobileFallbackRow(copy);
  mobileSection.appendChild(mobileFallbackRow);

  const { mobileOtpLabel, mobileOtpRow, mobileOtpBadge, mobileOtpHint } = createMobileOtpSection(copy);
  mobileSection.appendChild(mobileOtpLabel);
  mobileSection.appendChild(mobileOtpRow);
  mobileSection.appendChild(mobileOtpHint);

  const {
    mobileQrWrap,
    mobileQrImg,
    mobileStatusRow,
    mobileStatus,
    retryMobilePairingBtn,
  } = createMobileQrSection(copy);
  mobileSection.appendChild(mobileQrWrap);
  mobileSection.appendChild(mobileStatusRow);

  return {
    mobileSection,
    mobileLinkInput,
    mobileFallbackRow,
    mobileFallbackInput,
    useMobileFallbackBtn,
    copyMobileFallbackBtn,
    mobileOtpBadge,
    mobileOtpHint,
    mobileQrImg,
    mobileStatus,
    retryMobilePairingBtn,
  };
}

export function createShareDialogPhaseTwo(copy: ShareDialogCopy): ShareDialogPhaseTwoElements {
  const phase2 = document.createElement('div');
  phase2.className = 'share-phase hidden';

  const { pinSection, passphraseLabel, passphraseInput } = createPinSection(copy);
  const { manualToggleRow, manualToggleBtn, manualHint } = createManualToggleRow(copy);
  phase2.appendChild(manualToggleRow);
  phase2.appendChild(manualHint);

  const {
    manualSection,
    offerSection,
    offerTextarea,
    answerSection,
    answerTextarea,
  } = createManualSection(copy, pinSection);
  phase2.appendChild(manualSection);

  const {
    mobileSection,
    mobileLinkInput,
    mobileFallbackRow,
    mobileFallbackInput,
    useMobileFallbackBtn,
    copyMobileFallbackBtn,
    mobileOtpBadge,
    mobileOtpHint,
    mobileQrImg,
    mobileStatus,
    retryMobilePairingBtn,
  } = createMobileSection(copy);

  phase2.appendChild(mobileSection);

  return {
    phase2,
    passphraseLabel,
    passphraseInput,
    manualToggleRow,
    manualToggleBtn,
    manualSection,
    offerSection,
    offerTextarea,
    answerSection,
    answerTextarea,
    mobileSection,
    mobileLinkInput,
    mobileFallbackRow,
    mobileFallbackInput,
    useMobileFallbackBtn,
    copyMobileFallbackBtn,
    mobileOtpBadge,
    mobileOtpHint,
    mobileQrImg,
    mobileStatus,
    retryMobilePairingBtn,
  };
}
