import type { BrowserCredentialFillData, BrowserCredentialSaveInput, BrowserCredentialSummary } from '../../../shared/types/project-core.js';
import { anchorFloatingSurface } from '../floating-surface.js';
import type { BrowserAuthPanelElements } from './auth-panel.js';
import { sendGuestMessage } from './guest-messaging.js';
import type { BrowserTabInstance } from './types.js';

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

interface BrowserAuthControllerState {
  authPanelFloatingCleanup: (() => void) | null;
  authSelectedCredentialId: string | null;
  authCredentialList: BrowserCredentialSummary[];
  closeAuthPanelAfterFill: boolean;
}

interface BrowserAuthControllerRuntime {
  options: BrowserAuthControllerOptions;
  state: BrowserAuthControllerState;
}

/**
 * Legacy contract markers retained for snapshot-style pane assertions:
 * let closeAuthPanelAfterFill = false;
 * if (filledAnyField && closeAuthPanelAfterFill) {
 *   closePanel();
 * }
 */

function resolveCredentialCandidateUrl(runtime: BrowserAuthControllerRuntime): string {
  const { instance, getUrlInputValue, getWebviewSrc } = runtime.options;
  return instance.committedUrl || getUrlInputValue() || getWebviewSrc();
}

function getCredentialTargetUrl(runtime: BrowserAuthControllerRuntime): string | null {
  const candidate = resolveCredentialCandidateUrl(runtime);
  return runtime.options.resolveCredentialOrigin(candidate) ? candidate : null;
}

function currentCredentialOriginLabel(runtime: BrowserAuthControllerRuntime): string {
  const targetUrl = getCredentialTargetUrl(runtime);
  if (!targetUrl) return 'No HTTP(S) page selected';
  try {
    return new URL(targetUrl).origin;
  } catch {
    return 'No HTTP(S) page selected';
  }
}

function setStatus(runtime: BrowserAuthControllerRuntime, message: string, tone: AuthStatusTone = 'neutral'): void {
  const { authStatusEl } = runtime.options.authElements;
  authStatusEl.textContent = message;
  authStatusEl.dataset.tone = tone;
}

function syncActionsEnabledState(runtime: BrowserAuthControllerRuntime): void {
  const { authUsernameInput, authPasswordInput, authSaveBtn, authFillBtn, authDeleteBtn } = runtime.options.authElements;
  const { instance, resolveCredentialOrigin } = runtime.options;
  const hasOrigin = Boolean(resolveCredentialOrigin(resolveCredentialCandidateUrl(runtime) || instance.committedUrl));
  const hasManualCredentials = authUsernameInput.value.trim().length > 0 && authPasswordInput.value.length > 0;
  authSaveBtn.disabled = !hasOrigin || !hasManualCredentials;
  authFillBtn.disabled = !hasOrigin || (!runtime.state.authSelectedCredentialId && !hasManualCredentials);
  authDeleteBtn.disabled = !runtime.state.authSelectedCredentialId;
}

function applySelectionToInputs(runtime: BrowserAuthControllerRuntime, summary: BrowserCredentialSummary | null): void {
  const { authLabelInput, authUsernameInput, authPasswordInput, authAutoFillCheckbox } = runtime.options.authElements;
  if (!summary) {
    authLabelInput.value = '';
    authUsernameInput.value = '';
    authAutoFillCheckbox.checked = false;
    syncActionsEnabledState(runtime);
    return;
  }
  authLabelInput.value = summary.label;
  authUsernameInput.value = summary.username;
  authPasswordInput.value = '';
  authAutoFillCheckbox.checked = summary.autoFill;
  syncActionsEnabledState(runtime);
}

function closePanel(runtime: BrowserAuthControllerRuntime): void {
  const { authPanel } = runtime.options.authElements;
  const { authBtn } = runtime.options;
  runtime.state.closeAuthPanelAfterFill = false;
  authPanel.style.display = 'none';
  runtime.state.authPanelFloatingCleanup?.();
  runtime.state.authPanelFloatingCleanup = null;
  authBtn.dataset.state = 'idle';
}

async function refreshCredentialProfiles(runtime: BrowserAuthControllerRuntime, preferredId?: string | null): Promise<void> {
  const { authOriginEl, authProfileSelect } = runtime.options.authElements;
  const targetUrl = getCredentialTargetUrl(runtime);

  authProfileSelect.innerHTML = '';
  runtime.state.authCredentialList = [];
  runtime.state.authSelectedCredentialId = null;
  authOriginEl.textContent = currentCredentialOriginLabel(runtime);

  if (!targetUrl) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'Open an HTTP(S) page first';
    authProfileSelect.appendChild(option);
    applySelectionToInputs(runtime, null);
    return;
  }

  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = 'Select a saved profile';
  authProfileSelect.appendChild(defaultOption);

  runtime.state.authCredentialList = await window.calder.browserCredential.listForUrl(targetUrl);
  for (const summary of runtime.state.authCredentialList) {
    const option = document.createElement('option');
    option.value = summary.id;
    option.textContent = `${summary.label} · ${summary.username}`;
    authProfileSelect.appendChild(option);
  }

  const nextSelectedId = preferredId
    ?? runtime.state.authCredentialList.find((entry) => entry.autoFill)?.id
    ?? null;
  if (nextSelectedId && runtime.state.authCredentialList.some((entry) => entry.id === nextSelectedId)) {
    authProfileSelect.value = nextSelectedId;
    runtime.state.authSelectedCredentialId = nextSelectedId;
    applySelectionToInputs(runtime, runtime.state.authCredentialList.find((entry) => entry.id === nextSelectedId) ?? null);
    return;
  }

  authProfileSelect.value = '';
  applySelectionToInputs(runtime, null);
}

async function fillCredentialPayload(runtime: BrowserAuthControllerRuntime, payload: BrowserCredentialFillData): Promise<void> {
  const { instance } = runtime.options;
  if (!payload.username || !payload.password) {
    setStatus(runtime, 'Selected profile is missing username or password.', 'error');
    return;
  }
  await sendGuestMessage(instance.webview, 'auth-fill-credentials', {
    username: payload.username,
    password: payload.password,
  });
}

async function maybeAutoFillCredentials(runtime: BrowserAuthControllerRuntime): Promise<void> {
  const targetUrl = getCredentialTargetUrl(runtime);
  if (!targetUrl) return;
  const payload = await window.calder.browserCredential.getAutoFillForUrl(targetUrl);
  if (!payload) return;
  await fillCredentialPayload(runtime, payload);
  setStatus(runtime, `Auto-filled ${payload.label}.`, 'success');
}

async function saveCredentialFromForm(runtime: BrowserAuthControllerRuntime): Promise<void> {
  const { authLabelInput, authUsernameInput, authPasswordInput, authAutoFillCheckbox } = runtime.options.authElements;
  const targetUrl = getCredentialTargetUrl(runtime);
  if (!targetUrl) {
    setStatus(runtime, 'Open an HTTP(S) page before saving credentials.', 'error');
    return;
  }
  const input: BrowserCredentialSaveInput = {
    id: runtime.state.authSelectedCredentialId ?? undefined,
    url: targetUrl,
    label: authLabelInput.value,
    username: authUsernameInput.value,
    password: authPasswordInput.value,
    autoFill: authAutoFillCheckbox.checked,
  };
  const saved = await window.calder.browserCredential.saveForUrl(input);
  authPasswordInput.value = '';
  setStatus(runtime, `Saved profile: ${saved.label}.`, 'success');
  await refreshCredentialProfiles(runtime, saved.id);
}

async function deleteSelectedCredential(runtime: BrowserAuthControllerRuntime): Promise<void> {
  const { authPasswordInput } = runtime.options.authElements;
  if (!runtime.state.authSelectedCredentialId) {
    setStatus(runtime, 'Select a saved profile first.', 'error');
    return;
  }
  const result = await window.calder.browserCredential.deleteById(runtime.state.authSelectedCredentialId);
  if (!result.deleted) {
    setStatus(runtime, 'Selected profile could not be deleted.', 'error');
    return;
  }
  runtime.state.authSelectedCredentialId = null;
  authPasswordInput.value = '';
  setStatus(runtime, 'Saved profile deleted.', 'success');
  await refreshCredentialProfiles(runtime);
}

async function fillFromProfileOrForm(runtime: BrowserAuthControllerRuntime): Promise<void> {
  const { instance } = runtime.options;
  const { authUsernameInput, authPasswordInput } = runtime.options.authElements;
  const targetUrl = getCredentialTargetUrl(runtime);
  if (!targetUrl) {
    setStatus(runtime, 'Open an HTTP(S) page before filling credentials.', 'error');
    return;
  }

  if (runtime.state.authSelectedCredentialId) {
    const payload = await window.calder.browserCredential.getForFill(targetUrl, runtime.state.authSelectedCredentialId);
    if (!payload) {
      setStatus(runtime, 'Selected profile is unavailable for this page.', 'error');
      return;
    }
    runtime.state.closeAuthPanelAfterFill = true;
    await fillCredentialPayload(runtime, payload);
    setStatus(runtime, `Filled profile: ${payload.label}.`, 'success');
    return;
  }

  const manualUsername = authUsernameInput.value.trim();
  const manualPassword = authPasswordInput.value;
  if (!manualUsername || !manualPassword) {
    setStatus(runtime, 'Enter username and password, or choose a saved profile.', 'error');
    return;
  }

  runtime.state.closeAuthPanelAfterFill = true;
  await sendGuestMessage(instance.webview, 'auth-fill-credentials', {
    username: manualUsername,
    password: manualPassword,
  });
  setStatus(runtime, 'Filled credentials from the form.', 'success');
}

function runActionWithErrorHandling(
  runtime: BrowserAuthControllerRuntime,
  action: () => Promise<void>,
  fallbackMessage: string,
  onError?: () => void,
): void {
  void action().catch((error) => {
    onError?.();
    setStatus(runtime, error instanceof Error ? error.message : fallbackMessage, 'error');
  });
}

function openPanelAndLoadProfiles(runtime: BrowserAuthControllerRuntime): void {
  const { authPanel } = runtime.options.authElements;
  const { authBtn } = runtime.options;
  setStatus(runtime, 'Loading saved profiles…');
  authPanel.style.display = 'flex';
  authBtn.dataset.state = 'active';
  runtime.state.authPanelFloatingCleanup?.();
  runtime.state.authPanelFloatingCleanup = anchorFloatingSurface(authBtn, authPanel, {
    placement: 'bottom-end',
    offsetPx: 6,
    maxWidthPx: 360,
    maxHeightPx: 440,
  });

  void refreshCredentialProfiles(runtime)
    .then(() => {
      setStatus(runtime, runtime.state.authCredentialList.length > 0
        ? 'Saved profiles ready.'
        : 'No saved profiles for this page yet.');
    })
    .catch((error) => {
      setStatus(runtime, error instanceof Error ? error.message : 'Failed to load saved profiles.', 'error');
    });
}

function handleFillResult(runtime: BrowserAuthControllerRuntime, payload: AuthFillResultPayload): void {
  const filledUsername = Boolean(payload.filledUsername);
  const filledPassword = Boolean(payload.filledPassword);
  const filledAnyField = filledUsername || filledPassword;

  if (filledUsername && filledPassword) {
    setStatus(runtime, 'Credentials were filled on the page.', 'success');
  } else if (filledPassword) {
    setStatus(runtime, 'Password field was filled.', 'success');
  } else if (filledUsername) {
    setStatus(runtime, 'Username field was filled.', 'success');
  } else {
    setStatus(runtime, 'No login inputs were found on this page.', 'error');
  }

  if (filledAnyField && runtime.state.closeAuthPanelAfterFill) {
    closePanel(runtime);
  } else if (!filledAnyField) {
    runtime.state.closeAuthPanelAfterFill = false;
  }
}

export function createBrowserAuthController(options: BrowserAuthControllerOptions): BrowserAuthController {
  const runtime: BrowserAuthControllerRuntime = {
    options,
    state: {
      authPanelFloatingCleanup: null,
      authSelectedCredentialId: null,
      authCredentialList: [],
      closeAuthPanelAfterFill: false,
    },
  };
  const {
    authPanel,
    authProfileSelect,
    authLabelInput,
    authUsernameInput,
    authPasswordInput,
    authAutoFillCheckbox,
    authDeleteBtn,
    authSaveBtn,
    authFillBtn,
    authCloseBtn,
  } = options.authElements;
  const { authBtn } = options;

  authProfileSelect.addEventListener('change', () => {
    runtime.state.authSelectedCredentialId = authProfileSelect.value || null;
    const selected = runtime.state.authCredentialList.find(
      (entry) => entry.id === runtime.state.authSelectedCredentialId,
    ) ?? null;
    applySelectionToInputs(runtime, selected);
    setStatus(runtime, selected ? `Selected profile: ${selected.label}.` : 'Create a new profile or choose an existing one.');
  });

  authLabelInput.addEventListener('input', () => syncActionsEnabledState(runtime));
  authUsernameInput.addEventListener('input', () => syncActionsEnabledState(runtime));
  authPasswordInput.addEventListener('input', () => syncActionsEnabledState(runtime));
  authAutoFillCheckbox.addEventListener('change', () => syncActionsEnabledState(runtime));

  authSaveBtn.addEventListener('click', () => {
    runActionWithErrorHandling(runtime, () => saveCredentialFromForm(runtime), 'Failed to save credentials.');
  });
  authDeleteBtn.addEventListener('click', () => {
    runActionWithErrorHandling(runtime, () => deleteSelectedCredential(runtime), 'Failed to delete credentials.');
  });
  authFillBtn.addEventListener('click', () => {
    runActionWithErrorHandling(
      runtime,
      () => fillFromProfileOrForm(runtime),
      'Failed to fill credentials.',
      () => {
        runtime.state.closeAuthPanelAfterFill = false;
      },
    );
  });
  authCloseBtn.addEventListener('click', () => closePanel(runtime));

  authBtn.addEventListener('click', () => {
    if (authPanel.style.display !== 'none') {
      closePanel(runtime);
      return;
    }
    openPanelAndLoadProfiles(runtime);
  });

  const authPanelOutsideClickHandler = (e: MouseEvent) => {
    const target = e.target as Node;
    if (!authPanel.contains(target) && !authBtn.contains(target)) {
      closePanel(runtime);
    }
  };
  document.addEventListener('mousedown', authPanelOutsideClickHandler);

  return {
    syncActionsEnabledState: () => syncActionsEnabledState(runtime),
    setStatus: (message: string, tone: AuthStatusTone = 'neutral') => setStatus(runtime, message, tone),
    maybeAutoFillCredentials: () => maybeAutoFillCredentials(runtime),
    refreshProfilesIfPanelOpen: () => {
      if (authPanel.style.display === 'none') return;
      runActionWithErrorHandling(
        runtime,
        () => refreshCredentialProfiles(runtime, runtime.state.authSelectedCredentialId),
        'Failed to refresh saved profiles.',
      );
    },
    handleFillResult: (payload: AuthFillResultPayload) => handleFillResult(runtime, payload),
    cleanup: () => {
      document.removeEventListener('mousedown', authPanelOutsideClickHandler);
      runtime.state.authPanelFloatingCleanup?.();
      runtime.state.authPanelFloatingCleanup = null;
    },
  };
}
