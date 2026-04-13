export interface BrowserOpenIntentInput {
  targetAttr?: string | null;
  button?: number;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
}

export function shouldRouteBrowserOpenIntent(input: BrowserOpenIntentInput): boolean {
  const target = (input.targetAttr || '').trim().toLowerCase();
  if (target === '_blank') return true;

  if (input.button === 1) return true;

  if (input.metaKey || input.ctrlKey || input.shiftKey) {
    return true;
  }

  return false;
}
