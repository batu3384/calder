/**
 * Electron/CI hosts often set NO_COLOR=1, FORCE_COLOR=0, TERM=dumb.
 * PTY children inherit that and CLIs render monochrome inside Calder.
 */
export function normalizePtyColorEnv(env: Record<string, string>): Record<string, string> {
  const next: Record<string, string> = { ...env };

  delete next.NO_COLOR;
  delete next.NODE_DISABLE_COLORS;

  if (next.FORCE_COLOR === '0' || next.FORCE_COLOR === 'false') {
    delete next.FORCE_COLOR;
  }
  if (!next.FORCE_COLOR?.trim()) {
    next.FORCE_COLOR = '1';
  }

  if (!next.TERM?.trim() || next.TERM === 'dumb') {
    next.TERM = 'xterm-256color';
  }

  if (!next.COLORTERM?.trim()) {
    next.COLORTERM = 'truecolor';
  }

  return next;
}
