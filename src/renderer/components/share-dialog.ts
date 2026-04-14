// Share dialog — host-side UI for sharing a session via P2P.

import type { ShareMode } from '../../shared/sharing-types.js';
import { shareSession, acceptShareAnswer, endShare } from '../sharing/share-manager.js';
import { isSharing, isConnected } from '../sharing/peer-host.js';
import { generatePassphrase, validateSharePassphrase } from '../sharing/share-crypto.js';
import { createPassphraseInput } from '../dom-utils.js';
import { appState } from '../state.js';

let activeOverlay: HTMLElement | null = null;
let pendingShareSessionId: string | null = null;

export function showShareDialog(sessionId: string): void {
  closeShareDialog();

  const overlay = document.createElement('div');
  overlay.className = 'share-overlay';
  activeOverlay = overlay;

  const dialog = document.createElement('div');
  dialog.className = 'share-dialog modal-surface share-dialog-shell';

  let selectedMode: ShareMode = 'readonly';

  const hero = document.createElement('div');
  hero.className = 'share-dialog-hero';

  const kicker = document.createElement('div');
  kicker.className = 'share-dialog-kicker shell-kicker';
  kicker.textContent = 'P2P Session';

  const title = document.createElement('h3');
  title.className = 'share-dialog-title';
  title.textContent = 'Share Session';

  const copy = document.createElement('div');
  copy.className = 'share-dialog-copy';
  copy.textContent = 'Open a secure peer-to-peer handoff, choose the access level, and guide the other person through the connection flow.';

  hero.appendChild(kicker);
  hero.appendChild(title);
  hero.appendChild(copy);

  const project = appState.projects.find((entry) => entry.sessions.some((session) => session.id === sessionId));
  if (project?.projectTeamContext && (project.projectTeamContext.spaces.length > 0 || project.projectTeamContext.sharedRuleCount > 0 || project.projectTeamContext.workflowCount > 0)) {
    const collaborationNote = document.createElement('div');
    collaborationNote.className = 'share-notice calder-inline-notice';
    collaborationNote.textContent = `Shared team context: ${project.projectTeamContext.spaces.length} spaces · ${project.projectTeamContext.sharedRuleCount} shared rules · ${project.projectTeamContext.workflowCount} workflows.`;
    hero.appendChild(collaborationNote);
  }
  dialog.appendChild(hero);

  // ── Phase 1: Permission + Disclaimers ──

  const phase1 = document.createElement('div');
  phase1.className = 'share-phase';

  const notice = document.createElement('div');
  notice.className = 'share-notice calder-inline-notice';
  notice.textContent = 'Your full terminal scrollback history will be shared with the peer.';
  phase1.appendChild(notice);

  const rwWarning = document.createElement('div');
  rwWarning.className = 'share-notice calder-inline-notice hidden';
  rwWarning.textContent = 'Read-write mode allows the peer to type into your terminal and execute commands. Only share with people you trust.';
  phase1.appendChild(rwWarning);

  const modeSection = document.createElement('div');
  modeSection.className = 'share-section';

  const modeLabel = document.createElement('div');
  modeLabel.className = 'share-label';
  modeLabel.textContent = 'Access level';
  modeSection.appendChild(modeLabel);

  const modeGroup = document.createElement('div');
  modeGroup.className = 'share-radio-group';

  const readonlyRadio = createRadio('share-mode', 'readonly', 'Read-only', true);
  const readwriteRadio = createRadio('share-mode', 'readwrite', 'Read-write', false);
  modeGroup.appendChild(readonlyRadio);
  modeGroup.appendChild(readwriteRadio);
  modeSection.appendChild(modeGroup);

  modeGroup.addEventListener('change', (e) => {
    const value = (e.target as HTMLInputElement).value as ShareMode;
    selectedMode = value;
    rwWarning.classList.toggle('hidden', value !== 'readwrite');
  });

  phase1.appendChild(modeSection);
  dialog.appendChild(phase1);

  // ── Phase 2: Passphrase + Codes ──

  const phase2 = document.createElement('div');
  phase2.className = 'share-phase hidden';

  const pinSection = document.createElement('div');
  pinSection.className = 'share-section';

  const passphraseLabel = document.createElement('div');
  passphraseLabel.className = 'share-label';
  passphraseLabel.textContent = 'Share this one-time passphrase with your peer';

  const passphraseHint = document.createElement('div');
  passphraseHint.className = 'share-notice calder-inline-notice';
  passphraseHint.textContent = 'Generated passphrases are stronger than short numeric PINs and work best when copied as-is.';

  const passphraseInput = createPassphraseInput({
    placeholder: 'One-time passphrase',
    value: generatePassphrase(),
  });
  pinSection.appendChild(passphraseLabel);
  pinSection.appendChild(passphraseHint);
  pinSection.appendChild(passphraseInput);
  phase2.appendChild(pinSection);

  // Offer code (hidden until generated)
  const offerSection = document.createElement('div');
  offerSection.className = 'share-section hidden';

  const offerLabel = document.createElement('div');
  offerLabel.className = 'share-label';
  offerLabel.textContent = 'Send this code to your peer';
  offerSection.appendChild(offerLabel);

  const offerTextarea = document.createElement('textarea');
  offerTextarea.className = 'share-code';
  offerTextarea.readOnly = true;
  offerTextarea.rows = 3;
  offerSection.appendChild(offerTextarea);

  const copyOfferBtn = document.createElement('button');
  copyOfferBtn.className = 'share-btn share-btn-secondary calder-button';
  copyOfferBtn.textContent = 'Copy Code';
  copyOfferBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(offerTextarea.value);
    copyOfferBtn.textContent = 'Copied!';
    setTimeout(() => { copyOfferBtn.textContent = 'Copy Code'; }, 1500);
  });
  offerSection.appendChild(copyOfferBtn);
  phase2.appendChild(offerSection);

  // Answer code (hidden until offer generated)
  const answerSection = document.createElement('div');
  answerSection.className = 'share-section hidden';

  const answerLabel = document.createElement('div');
  answerLabel.className = 'share-label';
  answerLabel.textContent = 'Paste your peer\'s response code';
  answerSection.appendChild(answerLabel);

  const answerTextarea = document.createElement('textarea');
  answerTextarea.className = 'share-code';
  answerTextarea.rows = 3;
  answerTextarea.placeholder = 'Paste response code here...';
  answerSection.appendChild(answerTextarea);
  phase2.appendChild(answerSection);

  dialog.appendChild(phase2);

  // Status area
  const statusEl = document.createElement('div');
  statusEl.className = 'share-status';
  dialog.appendChild(statusEl);

  // ── Action buttons (always at bottom) ──

  const actions = document.createElement('div');
  actions.className = 'share-actions share-actions-shell';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'share-btn share-btn-secondary calder-button';
  closeBtn.textContent = 'Cancel';
  closeBtn.addEventListener('click', closeShareDialog);

  const backBtn = document.createElement('button');
  backBtn.className = 'share-btn share-btn-secondary calder-button hidden';
  backBtn.textContent = 'Back';

  const nextBtn = document.createElement('button');
  nextBtn.className = 'share-btn calder-button';
  nextBtn.textContent = 'Next';

  const startBtn = document.createElement('button');
  startBtn.className = 'share-btn calder-button hidden';
  startBtn.textContent = 'Start Sharing';

  const connectBtn = document.createElement('button');
  connectBtn.className = 'share-btn calder-button hidden';
  connectBtn.textContent = 'Connect';
  connectBtn.disabled = true;

  actions.appendChild(closeBtn);
  actions.appendChild(backBtn);
  actions.appendChild(nextBtn);
  actions.appendChild(startBtn);
  actions.appendChild(connectBtn);
  dialog.appendChild(actions);

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  // ── Phase navigation ──

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

  // Enable Connect only when answer code is entered
  answerTextarea.addEventListener('input', () => {
    connectBtn.disabled = !answerTextarea.value.trim();
  });

  // Connect handler (registered once, guarded by disabled state)
  connectBtn.addEventListener('click', async () => {
    const answer = answerTextarea.value.trim();
    if (!answer) return;
    try {
      await acceptShareAnswer(sessionId, answer);
      connectBtn.disabled = true;
      connectBtn.textContent = 'Connecting...';
      answerTextarea.readOnly = true;
      statusEl.textContent = 'Establishing connection...';
    } catch (err) {
      statusEl.textContent = err instanceof Error ? err.message : 'Invalid response code';
    }
  });

  // ── Handle Escape ──

  overlay.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape') closeShareDialog();
  });
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeShareDialog();
  });

  // ── Start sharing flow ──

  startBtn.addEventListener('click', async () => {
    const passphrase = passphraseInput.value.trim();
    const passphraseError = validateSharePassphrase(passphrase);
    if (passphraseError) {
      statusEl.textContent = passphraseError;
      return;
    }

    startBtn.disabled = true;
    startBtn.textContent = 'Generating code...';
    statusEl.textContent = 'Generating connection code...';

    pendingShareSessionId = sessionId;

    try {
      const { offer, handle } = await shareSession(sessionId, selectedMode, passphrase);

      passphraseInput.readOnly = true;
      passphraseLabel.textContent = 'Share this passphrase with your peer';
      offerTextarea.value = offer;
      offerSection.classList.remove('hidden');
      answerSection.classList.remove('hidden');
      startBtn.classList.add('hidden');
      backBtn.classList.add('hidden');
      connectBtn.classList.remove('hidden');
      statusEl.textContent = 'Waiting for peer to connect...';

      handle.onConnected(() => {
        closeShareDialog();
      });

      handle.onAuthFailed((reason: string) => {
        statusEl.textContent = `Authentication failed: ${reason}`;
        connectBtn.disabled = false;
        connectBtn.textContent = 'Connect';
        answerTextarea.value = '';
        answerTextarea.readOnly = false;
      });
    } catch (err) {
      if (pendingShareSessionId && isSharing(pendingShareSessionId)) {
        endShare(pendingShareSessionId);
      }
      pendingShareSessionId = null;
      statusEl.textContent = `Error: ${err instanceof Error ? err.message : 'Unknown error'}`;
      startBtn.disabled = false;
      startBtn.textContent = 'Start Sharing';
    }
  });
}

export function closeShareDialog(): void {
  if (activeOverlay) {
    activeOverlay.remove();
    activeOverlay = null;
  }
  if (pendingShareSessionId && isSharing(pendingShareSessionId) && !isConnected(pendingShareSessionId)) {
    endShare(pendingShareSessionId);
  }
  pendingShareSessionId = null;
}

function createRadio(name: string, value: string, labelText: string, checked: boolean): HTMLElement {
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
