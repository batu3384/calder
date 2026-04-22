import { anchorFloatingSurface } from '../floating-surface.js';
import { sendGuestMessage } from './guest-messaging.js';
import type { BrowserAuthPanelElements } from './auth-panel.js';
import type { BrowserTabInstance } from './types.js';
import type {
  BrowserCredentialFillData,
  BrowserCredentialSaveInput,
  BrowserCredentialSummary,
} from '../../../shared/types/project.js';

type AuthStatusTone = 'neutral' | 'success' | 'error';

interface AuthFillResultPayload {
  filledUsername?: boolean;
  filledPassword?: boolean;
}

export interface BrowserAuthController {
  syncActionsEnabledState: () => void;
  setStatus: (message: string, tone?: AuthStatusTone) => void;
  maybeAutoFillCredentials: () => Promise<void>;
  refreshProfilesIfPanelOpen: () => void;
  handleFillResult: (payload: AuthFillResultPayload) => void;
  cleanup: () => void;
}

export interface BrowserAuthControllerOptions {
  instance: BrowserTabInstance;
  authBtn: HTMLButtonElement;
  authElements: BrowserAuthPanelElements;
  getUrlInputValue: () => string;
  getWebviewSrc: () => string;
  resolveCredentialOrigin: (url: string | undefined) => string | null;
}

export function createBrowserAuthController(options: BrowserAuthControllerOptions): BrowserAuthController {
  const {
    instance,
    authBtn,
    authElements,
    getUrlInputValue,
    getWebviewSrc,
    resolveCredentialOrigin,
  } = options;
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
  } = authElements;

  let authPanelFloatingCleanup: (() => void) | null = null;
  let authSelectedCredentialId: string | null = null;
  let authCredentialList: BrowserCredentialSummary[] = [];
  let closeAuthPanelAfterFill = false;

  function syncActionsEnabledState(): void {
    const hasOrigin = Boolean(resolveCredentialOrigin(instance.committedUrl || getUrlInputValue() || getWebviewSrc()));
    const hasManualCredentials = authUsernameInput.value.trim().length > 0 && authPasswordInput.value.length > 0;
    authSaveBtn.disabled = !hasOrigin || !hasManualCredentials;
    authFillBtn.disabled = !hasOrigin || (!authSelectedCredentialId && !hasManualCredentials);
    authDeleteBtn.disabled = !authSelectedCredentialId;
  }

  function setStatus(message: string, tone: AuthStatusTone = 'neutral'): void {
    authStatusEl.textContent = message;
    authStatusEl.dataset.tone = tone;
  }

  function applySelectionToInputs(summary: BrowserCredentialSummary | null): void {
    if (!summary) {
      authLabelInput.value = '';
      authUsernameInput.value = '';
      authAutoFillCheckbox.checked = false;
      syncActionsEnabledState();
      return;
    }
    authLabelInput.value = summary.label;
    authUsernameInput.value = summary.username;
    authPasswordInput.value = '';
    authAutoFillCheckbox.checked = summary.autoFill;
    syncActionsEnabledState();
  }

  function getCredentialTargetUrl(): string | null {
    const candidate = instance.committedUrl || getUrlInputValue() || getWebviewSrc();
    return resolveCredentialOrigin(candidate) ? candidate : null;
  }

  function currentCredentialOriginLabel(): string {
    const targetUrl = getCredentialTargetUrl();
    if (!targetUrl) return 'No HTTP(S) page selected';
    try {
      return new URL(targetUrl).origin;
    } catch {
      return 'No HTTP(S) page selected';
    }
  }

  function closePanel(): void {
    closeAuthPanelAfterFill = false;
    authPanel.style.display = 'none';
    authPanelFloatingCleanup?.();
    authPanelFloatingCleanup = null;
    authBtn.dataset.state = 'idle';
  }

  async function refreshCredentialProfiles(preferredId?: string | null): Promise<void> {
    const targetUrl = getCredentialTargetUrl();
    authProfileSelect.innerHTML = '';
    authCredentialList = [];
    authSelectedCredentialId = null;
    authOriginEl.textContent = currentCredentialOriginLabel();

    if (!targetUrl) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'Open an HTTP(S) page first';
      authProfileSelect.appendChild(option);
      applySelectionToInputs(null);
      return;
    }

    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = 'Select a saved profile';
    authProfileSelect.appendChild(defaultOption);

    authCredentialList = await window.calder.browserCredential.listForUrl(targetUrl);
    for (const summary of authCredentialList) {
      const option = document.createElement('option');
      option.value = summary.id;
      option.textContent = `${summary.label} · ${summary.username}`;
      authProfileSelect.appendChild(option);
    }

    const nextSelectedId = preferredId
      ?? authCredentialList.find((entry) => entry.autoFill)?.id
      ?? null;
    if (nextSelectedId && authCredentialList.some((entry) => entry.id === nextSelectedId)) {
      authProfileSelect.value = nextSelectedId;
      authSelectedCredentialId = nextSelectedId;
      applySelectionToInputs(authCredentialList.find((entry) => entry.id === nextSelectedId) ?? null);
      return;
    }

    authProfileSelect.value = '';
    applySelectionToInputs(null);
  }

  async function fillCredentialPayload(payload: BrowserCredentialFillData): Promise<void> {
    if (!payload.username || !payload.password) {
      setStatus('Selected profile is missing username or password.', 'error');
      return;
    }
    await sendGuestMessage(instance.webview, 'auth-fill-credentials', {
      username: payload.username,
      password: payload.password,
    });
  }

  async function maybeAutoFillCredentials(): Promise<void> {
    const targetUrl = getCredentialTargetUrl();
    if (!targetUrl) return;
    const payload = await window.calder.browserCredential.getAutoFillForUrl(targetUrl);
    if (!payload) return;
    await fillCredentialPayload(payload);
    setStatus(`Auto-filled ${payload.label}.`, 'success');
  }

  async function saveCredentialFromForm(): Promise<void> {
    const targetUrl = getCredentialTargetUrl();
    if (!targetUrl) {
      setStatus('Open an HTTP(S) page before saving credentials.', 'error');
      return;
    }
    const input: BrowserCredentialSaveInput = {
      id: authSelectedCredentialId ?? undefined,
      url: targetUrl,
      label: authLabelInput.value,
      username: authUsernameInput.value,
      password: authPasswordInput.value,
      autoFill: authAutoFillCheckbox.checked,
    };
    const saved = await window.calder.browserCredential.saveForUrl(input);
    authPasswordInput.value = '';
    setStatus(`Saved profile: ${saved.label}.`, 'success');
    await refreshCredentialProfiles(saved.id);
  }

  async function deleteSelectedCredential(): Promise<void> {
    if (!authSelectedCredentialId) {
      setStatus('Select a saved profile first.', 'error');
      return;
    }
    const result = await window.calder.browserCredential.deleteById(authSelectedCredentialId);
    if (!result.deleted) {
      setStatus('Selected profile could not be deleted.', 'error');
      return;
    }
    authSelectedCredentialId = null;
    authPasswordInput.value = '';
    setStatus('Saved profile deleted.', 'success');
    await refreshCredentialProfiles();
  }

  async function fillFromProfileOrForm(): Promise<void> {
    const targetUrl = getCredentialTargetUrl();
    if (!targetUrl) {
      setStatus('Open an HTTP(S) page before filling credentials.', 'error');
      return;
    }

    if (authSelectedCredentialId) {
      const payload = await window.calder.browserCredential.getForFill(targetUrl, authSelectedCredentialId);
      if (!payload) {
        setStatus('Selected profile is unavailable for this page.', 'error');
        return;
      }
      closeAuthPanelAfterFill = true;
      await fillCredentialPayload(payload);
      setStatus(`Filled profile: ${payload.label}.`, 'success');
      return;
    }

    const manualUsername = authUsernameInput.value.trim();
    const manualPassword = authPasswordInput.value;
    if (!manualUsername || !manualPassword) {
      setStatus('Enter username and password, or choose a saved profile.', 'error');
      return;
    }

    closeAuthPanelAfterFill = true;
    await sendGuestMessage(instance.webview, 'auth-fill-credentials', {
      username: manualUsername,
      password: manualPassword,
    });
    setStatus('Filled credentials from the form.', 'success');
  }

  authProfileSelect.addEventListener('change', () => {
    authSelectedCredentialId = authProfileSelect.value || null;
    const selected = authCredentialList.find((entry) => entry.id === authSelectedCredentialId) ?? null;
    applySelectionToInputs(selected);
    setStatus(selected ? `Selected profile: ${selected.label}.` : 'Create a new profile or choose an existing one.');
  });

  authLabelInput.addEventListener('input', () => syncActionsEnabledState());
  authUsernameInput.addEventListener('input', () => syncActionsEnabledState());
  authPasswordInput.addEventListener('input', () => syncActionsEnabledState());
  authAutoFillCheckbox.addEventListener('change', () => syncActionsEnabledState());

  authSaveBtn.addEventListener('click', () => {
    void saveCredentialFromForm().catch((error) => {
      setStatus(error instanceof Error ? error.message : 'Failed to save credentials.', 'error');
    });
  });
  authDeleteBtn.addEventListener('click', () => {
    void deleteSelectedCredential().catch((error) => {
      setStatus(error instanceof Error ? error.message : 'Failed to delete credentials.', 'error');
    });
  });
  authFillBtn.addEventListener('click', () => {
    void fillFromProfileOrForm().catch((error) => {
      closeAuthPanelAfterFill = false;
      setStatus(error instanceof Error ? error.message : 'Failed to fill credentials.', 'error');
    });
  });
  authCloseBtn.addEventListener('click', () => closePanel());

  authBtn.addEventListener('click', () => {
    if (authPanel.style.display !== 'none') {
      closePanel();
      return;
    }

    setStatus('Loading saved profiles…');
    authPanel.style.display = 'flex';
    authBtn.dataset.state = 'active';
    authPanelFloatingCleanup?.();
    authPanelFloatingCleanup = anchorFloatingSurface(authBtn, authPanel, {
      placement: 'bottom-end',
      offsetPx: 6,
      maxWidthPx: 360,
      maxHeightPx: 440,
    });

    void refreshCredentialProfiles()
      .then(() => {
        setStatus(authCredentialList.length > 0
          ? 'Saved profiles ready.'
          : 'No saved profiles for this page yet.');
      })
      .catch((error) => {
        setStatus(error instanceof Error ? error.message : 'Failed to load saved profiles.', 'error');
      });
  });

  const authPanelOutsideClickHandler = (e: MouseEvent) => {
    const target = e.target as Node;
    if (!authPanel.contains(target) && !authBtn.contains(target)) {
      closePanel();
    }
  };
  document.addEventListener('mousedown', authPanelOutsideClickHandler);

  function refreshProfilesIfPanelOpen(): void {
    if (authPanel.style.display === 'none') return;
    void refreshCredentialProfiles(authSelectedCredentialId).catch((error) => {
      setStatus(error instanceof Error ? error.message : 'Failed to refresh saved profiles.', 'error');
    });
  }

  function handleFillResult(payload: AuthFillResultPayload): void {
    const filledUsername = Boolean(payload.filledUsername);
    const filledPassword = Boolean(payload.filledPassword);
    const filledAnyField = filledUsername || filledPassword;
    if (filledUsername && filledPassword) {
      setStatus('Credentials were filled on the page.', 'success');
    } else if (filledPassword) {
      setStatus('Password field was filled.', 'success');
    } else if (filledUsername) {
      setStatus('Username field was filled.', 'success');
    } else {
      setStatus('No login inputs were found on this page.', 'error');
    }

    if (filledAnyField && closeAuthPanelAfterFill) {
      closePanel();
    } else if (!filledAnyField) {
      closeAuthPanelAfterFill = false;
    }
  }

  function cleanup(): void {
    document.removeEventListener('mousedown', authPanelOutsideClickHandler);
    authPanelFloatingCleanup?.();
    authPanelFloatingCleanup = null;
  }

  return {
    syncActionsEnabledState,
    setStatus,
    maybeAutoFillCredentials,
    refreshProfilesIfPanelOpen,
    handleFillResult,
    cleanup,
  };
}
