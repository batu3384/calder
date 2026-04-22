import { createPassphraseInput } from '../dom-utils.js';
import { generatePassphrase } from '../sharing/share-crypto.js';
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

export function createShareDialogPhaseTwo(copy: ShareDialogCopy): ShareDialogPhaseTwoElements {
  const phase2 = document.createElement('div');
  phase2.className = 'share-phase hidden';

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

  const manualToggleRow = document.createElement('div');
  manualToggleRow.className = 'share-manual-toggle-row';
  const manualToggleBtn = document.createElement('button');
  manualToggleBtn.type = 'button';
  manualToggleBtn.className = 'share-btn share-btn-secondary calder-button';
  manualToggleBtn.textContent = copy.showManualCodes;
  manualToggleRow.appendChild(manualToggleBtn);
  phase2.appendChild(manualToggleRow);

  const manualHint = document.createElement('div');
  manualHint.className = 'share-manual-hint';
  manualHint.textContent = copy.manualCodesHint;
  phase2.appendChild(manualHint);

  const manualSection = document.createElement('div');
  manualSection.className = 'share-manual-section hidden';
  manualSection.appendChild(pinSection);

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
  manualSection.appendChild(offerSection);

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
  manualSection.appendChild(answerSection);
  phase2.appendChild(manualSection);

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

  const mobileSteps = document.createElement('ol');
  mobileSteps.className = 'share-mobile-steps';
  for (const step of [copy.quickHandoffStepScan, copy.quickHandoffStepOtp, copy.quickHandoffStepAuto]) {
    const item = document.createElement('li');
    item.textContent = step;
    mobileSteps.appendChild(item);
  }
  mobileSection.appendChild(mobileSteps);

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
  mobileSection.appendChild(mobileLinkRow);

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
  mobileSection.appendChild(mobileFallbackRow);

  const mobileOtpRow = document.createElement('div');
  mobileOtpRow.className = 'share-mobile-otp-row';
  const mobileOtpLabel = document.createElement('div');
  mobileOtpLabel.className = 'share-label';
  mobileOtpLabel.textContent = copy.otpLabel;
  mobileSection.appendChild(mobileOtpLabel);
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
  mobileSection.appendChild(mobileOtpRow);

  const mobileOtpHint = document.createElement('div');
  mobileOtpHint.className = 'share-mobile-otp-hint';
  mobileOtpHint.textContent = copy.waitingPairingCode;
  mobileSection.appendChild(mobileOtpHint);

  const mobileQrWrap = document.createElement('div');
  mobileQrWrap.className = 'share-mobile-qr-wrap';
  const mobileQrImg = document.createElement('img');
  mobileQrImg.className = 'share-mobile-qr';
  mobileQrImg.alt = copy.mobileControlQrAlt;
  mobileQrWrap.appendChild(mobileQrImg);
  mobileSection.appendChild(mobileQrWrap);

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
  mobileSection.appendChild(mobileStatusRow);

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
