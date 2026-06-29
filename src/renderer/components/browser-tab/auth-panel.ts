export interface BrowserAuthPanelElements {
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

export function createBrowserAuthPanel(): BrowserAuthPanelElements {
  const authPanel = document.createElement('div');
  authPanel.className = 'browser-capture-panel browser-auth-panel';
  authPanel.classList.add('calder-popover');
  authPanel.style.display = 'none';

  const authHeader = document.createElement('div');
  authHeader.className = 'browser-capture-header';

  const authCopy = document.createElement('div');
  authCopy.className = 'browser-capture-copy';

  const authKicker = document.createElement('div');
  authKicker.className = 'browser-capture-kicker';
  authKicker.textContent = 'Saved login';

  const authTitle = document.createElement('div');
  authTitle.className = 'browser-capture-title';
  authTitle.textContent = 'Credential vault';

  const authSubtitle = document.createElement('div');
  authSubtitle.className = 'browser-capture-subtitle';
  authSubtitle.textContent =
    'Save credentials securely, fill them in one click, and remove them whenever you want.';

  const authOriginEl = document.createElement('div');
  authOriginEl.className = 'browser-auth-origin';
  authOriginEl.textContent = 'No page origin';

  authCopy.appendChild(authKicker);
  authCopy.appendChild(authTitle);
  authCopy.appendChild(authSubtitle);
  authCopy.appendChild(authOriginEl);

  const authChip = document.createElement('span');
  authChip.className = 'browser-capture-chip';
  authChip.textContent = 'Login';

  const authHeaderMeta = document.createElement('div');
  authHeaderMeta.className = 'browser-auth-header-meta';

  const authCloseBtn = document.createElement('button');
  authCloseBtn.className = 'browser-auth-close-btn';
  authCloseBtn.type = 'button';
  authCloseBtn.textContent = 'Close';
  authCloseBtn.title = 'Close login panel';
  authCloseBtn.ariaLabel = 'Close login panel';

  authHeaderMeta.appendChild(authChip);
  authHeaderMeta.appendChild(authCloseBtn);
  authHeader.appendChild(authCopy);
  authHeader.appendChild(authHeaderMeta);
  authPanel.appendChild(authHeader);

  const authForm = document.createElement('div');
  authForm.className = 'browser-auth-form';

  const authProfileField = document.createElement('label');
  authProfileField.className = 'browser-auth-field';
  const authProfileLabel = document.createElement('span');
  authProfileLabel.className = 'browser-auth-field-label';
  authProfileLabel.textContent = 'Saved profiles';
  const authProfileSelect = document.createElement('select');
  authProfileSelect.className = 'browser-auth-select';
  authProfileField.appendChild(authProfileLabel);
  authProfileField.appendChild(authProfileSelect);
  authForm.appendChild(authProfileField);

  const authLabelField = document.createElement('label');
  authLabelField.className = 'browser-auth-field';
  const authLabelText = document.createElement('span');
  authLabelText.className = 'browser-auth-field-label';
  authLabelText.textContent = 'Profile name';
  const authLabelInput = document.createElement('input');
  authLabelInput.className = 'browser-auth-input';
  authLabelInput.type = 'text';
  authLabelInput.placeholder = 'Work account';
  authLabelField.appendChild(authLabelText);
  authLabelField.appendChild(authLabelInput);
  authForm.appendChild(authLabelField);

  const authUsernameField = document.createElement('label');
  authUsernameField.className = 'browser-auth-field';
  const authUsernameText = document.createElement('span');
  authUsernameText.className = 'browser-auth-field-label';
  authUsernameText.textContent = 'Username / email';
  const authUsernameInput = document.createElement('input');
  authUsernameInput.className = 'browser-auth-input';
  authUsernameInput.type = 'text';
  authUsernameInput.autocomplete = 'username';
  authUsernameInput.placeholder = 'name@example.com';
  authUsernameField.appendChild(authUsernameText);
  authUsernameField.appendChild(authUsernameInput);
  authForm.appendChild(authUsernameField);

  const authPasswordField = document.createElement('label');
  authPasswordField.className = 'browser-auth-field';
  const authPasswordText = document.createElement('span');
  authPasswordText.className = 'browser-auth-field-label';
  authPasswordText.textContent = 'Password';
  const authPasswordInput = document.createElement('input');
  authPasswordInput.className = 'browser-auth-input';
  authPasswordInput.type = 'password';
  authPasswordInput.autocomplete = 'current-password';
  authPasswordInput.placeholder = '••••••••';
  authPasswordField.appendChild(authPasswordText);
  authPasswordField.appendChild(authPasswordInput);
  authForm.appendChild(authPasswordField);

  const authAutoFillRow = document.createElement('label');
  authAutoFillRow.className = 'browser-auth-autofill-row';
  const authAutoFillCheckbox = document.createElement('input');
  authAutoFillCheckbox.type = 'checkbox';
  const authAutoFillText = document.createElement('span');
  authAutoFillText.textContent = 'Auto-fill this profile on page load';
  authAutoFillRow.appendChild(authAutoFillCheckbox);
  authAutoFillRow.appendChild(authAutoFillText);
  authForm.appendChild(authAutoFillRow);

  authPanel.appendChild(authForm);

  const authStatusEl = document.createElement('div');
  authStatusEl.className = 'browser-auth-status';
  authPanel.appendChild(authStatusEl);

  const authActions = document.createElement('div');
  authActions.className = 'browser-auth-actions';

  const authDeleteBtn = document.createElement('button');
  authDeleteBtn.className = 'browser-auth-btn-secondary';
  authDeleteBtn.textContent = 'Delete';
  authDeleteBtn.type = 'button';

  const authSaveBtn = document.createElement('button');
  authSaveBtn.className = 'browser-auth-btn-secondary';
  authSaveBtn.textContent = 'Save';
  authSaveBtn.type = 'button';

  const authFillBtn = document.createElement('button');
  authFillBtn.className = 'browser-auth-btn-primary';
  authFillBtn.textContent = 'Fill now';
  authFillBtn.type = 'button';

  authActions.appendChild(authDeleteBtn);
  authActions.appendChild(authSaveBtn);
  authActions.appendChild(authFillBtn);
  authPanel.appendChild(authActions);

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
