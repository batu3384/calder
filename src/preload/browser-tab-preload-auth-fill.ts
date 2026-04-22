export interface AuthFillPayload {
  username?: unknown;
  password?: unknown;
}

interface FillCredentialsResult {
  filledUsername: boolean;
  filledPassword: boolean;
}

function setInputElementValue(input: HTMLInputElement, value: string): void {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  if (descriptor?.set) {
    descriptor.set.call(input, value);
  } else {
    input.value = value;
  }
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function isLikelyUsernameInput(input: HTMLInputElement): boolean {
  if (input.disabled || input.readOnly) return false;
  if (input.type === 'hidden' || input.type === 'password') return false;
  const type = (input.type || '').toLowerCase();
  if (type && !['text', 'email', 'search', 'tel', 'url', 'number'].includes(type)) return false;

  const name = `${input.name || ''} ${input.id || ''} ${input.getAttribute('autocomplete') || ''}`.toLowerCase();
  if (name.includes('user') || name.includes('login') || name.includes('email')) return true;
  return true;
}

function findPrimaryPasswordInput(doc: Document): HTMLInputElement | null {
  return doc.querySelector<HTMLInputElement>('input[type="password"]:not([disabled]):not([readonly])');
}

function isPrecedingNode(candidate: Node, reference: Node): boolean {
  const relation = candidate.compareDocumentPosition(reference);
  return Boolean(relation & Node.DOCUMENT_POSITION_FOLLOWING);
}

function findUsernameNearPassword(passwordInput: HTMLInputElement): HTMLInputElement | null {
  const scope = passwordInput.form ?? passwordInput.ownerDocument;
  const candidates = Array.from(scope.querySelectorAll<HTMLInputElement>('input')).filter(isLikelyUsernameInput);
  const beforePassword = candidates.find((candidate) => isPrecedingNode(candidate, passwordInput));
  if (beforePassword) return beforePassword;
  return candidates[0] ?? null;
}

function fillCredentialsInDocument(doc: Document, username: string, password: string): FillCredentialsResult {
  const passwordInput = findPrimaryPasswordInput(doc);
  const usernameInput = passwordInput
    ? findUsernameNearPassword(passwordInput)
    : doc.querySelector<HTMLInputElement>('input[autocomplete="username"], input[type="email"], input[type="text"]');

  let filledUsername = false;
  let filledPassword = false;

  if (usernameInput && username) {
    setInputElementValue(usernameInput, username);
    filledUsername = true;
  }

  if (passwordInput && password) {
    setInputElementValue(passwordInput, password);
    filledPassword = true;
  }

  return { filledUsername, filledPassword };
}

export function fillCredentialsAcrossDocuments(
  docs: readonly Document[],
  payload: AuthFillPayload,
): FillCredentialsResult {
  const username = typeof payload.username === 'string' ? payload.username : '';
  const password = typeof payload.password === 'string' ? payload.password : '';
  if (!username && !password) {
    return { filledUsername: false, filledPassword: false };
  }

  let filledUsername = false;
  let filledPassword = false;
  for (const doc of docs) {
    const result = fillCredentialsInDocument(doc, username, password);
    filledUsername = filledUsername || result.filledUsername;
    filledPassword = filledPassword || result.filledPassword;
  }
  return { filledUsername, filledPassword };
}
