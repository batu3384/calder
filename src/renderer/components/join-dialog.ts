// Join dialog — guest-side UI for joining a shared P2P session.

import { joinRemoteSession } from '../sharing/share-manager.js';
import { appState } from '../state.js';
import { DecryptionError, validateJoinPassphrase } from '../sharing/share-crypto.js';
import { createPassphraseInput } from '../dom-utils.js';

let activeOverlay: HTMLElement | null = null;

export function showJoinDialog(): void {
  closeJoinDialog();

  const project = appState.activeProject;
  if (!project) return;

  const overlay = document.createElement('div');
  overlay.className = 'share-overlay';
  activeOverlay = overlay;

  const dialog = document.createElement('div');
  dialog.className = 'share-dialog modal-surface share-dialog-shell';

  const hero = document.createElement('div');
  hero.className = 'share-dialog-hero';

  const kicker = document.createElement('div');
  kicker.className = 'share-dialog-kicker shell-kicker';
  kicker.textContent = 'P2P Session';

  const title = document.createElement('h3');
  title.className = 'share-dialog-title';
  title.textContent = 'Join Remote Session';

  const copy = document.createElement('div');
  copy.className = 'share-dialog-copy';
  copy.textContent = 'Enter the host passphrase, paste the connection code, and Calder will generate the response you send back.';

  hero.appendChild(kicker);
  hero.appendChild(title);
  hero.appendChild(copy);
  dialog.appendChild(hero);

  // Offer input section (passphrase + code paste together)
  const offerSection = document.createElement('div');
  offerSection.className = 'share-section';

  const passphraseLabel = document.createElement('div');
  passphraseLabel.className = 'share-label';
  passphraseLabel.textContent = 'Enter the passphrase from the host';
  offerSection.appendChild(passphraseLabel);

  const legacyHint = document.createElement('div');
  legacyHint.className = 'share-notice calder-inline-notice';
  legacyHint.textContent = 'Legacy 8-digit PINs are still supported when you connect to an older app version.';
  offerSection.appendChild(legacyHint);

  const passphraseInput = createPassphraseInput({ placeholder: 'Passphrase or legacy PIN' });
  offerSection.appendChild(passphraseInput);

  const offerLabel = document.createElement('div');
  offerLabel.className = 'share-label share-label-spaced';
  offerLabel.textContent = 'Paste the host\'s connection code';
  offerSection.appendChild(offerLabel);

  const offerTextarea = document.createElement('textarea');
  offerTextarea.className = 'share-code';
  offerTextarea.rows = 3;
  offerTextarea.placeholder = 'Paste connection code here...';
  offerSection.appendChild(offerTextarea);
  dialog.appendChild(offerSection);

  // Status area
  const statusEl = document.createElement('div');
  statusEl.className = 'share-status';
  dialog.appendChild(statusEl);

  // Answer section (hidden initially)
  const answerSection = document.createElement('div');
  answerSection.className = 'share-section hidden';

  const answerLabel = document.createElement('div');
  answerLabel.className = 'share-label';
  answerLabel.textContent = 'Send this response code back to the host';
  answerSection.appendChild(answerLabel);

  const answerTextarea = document.createElement('textarea');
  answerTextarea.className = 'share-code';
  answerTextarea.readOnly = true;
  answerTextarea.rows = 3;
  answerSection.appendChild(answerTextarea);

  const copyAnswerBtn = document.createElement('button');
  copyAnswerBtn.className = 'share-btn share-btn-secondary calder-button';
  copyAnswerBtn.textContent = 'Copy Response';
  copyAnswerBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(answerTextarea.value);
    copyAnswerBtn.textContent = 'Copied!';
    setTimeout(() => { copyAnswerBtn.textContent = 'Copy Response'; }, 1500);
  });
  answerSection.appendChild(copyAnswerBtn);
  dialog.appendChild(answerSection);

  // Action buttons
  const actions = document.createElement('div');
  actions.className = 'share-actions share-actions-shell';

  const joinBtn = document.createElement('button');
  joinBtn.className = 'share-btn calder-button';
  joinBtn.textContent = 'Join';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'share-btn share-btn-secondary calder-button';
  closeBtn.textContent = 'Cancel';
  closeBtn.addEventListener('click', closeJoinDialog);

  actions.appendChild(closeBtn);
  actions.appendChild(joinBtn);
  dialog.appendChild(actions);

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  // Handle Escape
  overlay.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape') closeJoinDialog();
  });
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeJoinDialog();
  });

  // Join flow
  joinBtn.addEventListener('click', async () => {
    const passphrase = passphraseInput.value.trim();
    const passphraseError = validateJoinPassphrase(passphrase);
    if (passphraseError) {
      statusEl.textContent = passphraseError;
      return;
    }
    const offer = offerTextarea.value.trim();
    if (!offer) {
      statusEl.textContent = 'Please paste the connection code from the host.';
      return;
    }

    joinBtn.disabled = true;
    joinBtn.textContent = 'Connecting...';
    statusEl.textContent = 'Generating response code...';
    offerTextarea.readOnly = true;
    passphraseInput.readOnly = true;

    try {
      const { answer } = await joinRemoteSession(project.id, offer, passphrase, closeJoinDialog);

      answerTextarea.value = answer;
      answerSection.classList.remove('hidden');
      statusEl.textContent = 'Send the response code to the host. The session will appear once they connect.';

      closeBtn.textContent = 'Close';
    } catch (err) {
      if (err instanceof DecryptionError) {
        statusEl.textContent = 'Could not decrypt connection code. Check the passphrase and try again.';
      } else {
        statusEl.textContent = `Error: ${err instanceof Error ? err.message : 'Invalid code'}`;
      }
      joinBtn.disabled = false;
      joinBtn.textContent = 'Join';
      offerTextarea.readOnly = false;
      passphraseInput.readOnly = false;
    }
  });
}

export function closeJoinDialog(): void {
  if (activeOverlay) {
    activeOverlay.remove();
    activeOverlay = null;
  }
}
