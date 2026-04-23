import { WebglAddon } from '@xterm/addon-webgl';
import type { FitAddon } from '@xterm/addon-fit';
import type { Terminal } from '@xterm/xterm';

interface TerminalDomInstance {
  terminal: Terminal;
  fitAddon: FitAddon;
  element: HTMLDivElement;
}

export function attachTerminalInstanceToContainer(
  instance: TerminalDomInstance,
  container: HTMLElement,
): void {
  const xtermWrap = instance.element.querySelector('.xterm-wrap');
  if (!xtermWrap) return;

  if (!xtermWrap.querySelector('.xterm')) {
    container.appendChild(instance.element);
    instance.terminal.open(xtermWrap as HTMLElement);

    // Try WebGL, fall back silently
    try {
      const webglAddon = new WebglAddon();
      instance.terminal.loadAddon(webglAddon);
    } catch {
      // WebGL not available, software renderer works fine
    }
  } else {
    // Always re-append to ensure correct DOM order (appendChild moves existing children)
    container.appendChild(instance.element);
  }
}

export function showTerminalInstance(instance: TerminalDomInstance, split: boolean): void {
  instance.element.classList.remove('hidden');
  if (split) {
    instance.element.classList.add('split');
  } else {
    instance.element.classList.remove('split');
  }
}

export function hideTerminalInstance(instance: TerminalDomInstance): void {
  instance.element.classList.add('hidden');
  instance.element.classList.remove('swarm-dimmed', 'swarm-unread');
}

export function fitTerminalInstance(
  sessionId: string,
  instance: TerminalDomInstance,
  resizePty: (sessionId: string, cols: number, rows: number) => void,
): void {
  if (instance.element.classList.contains('hidden')) return;

  try {
    instance.fitAddon.fit();
    const { cols, rows } = instance.terminal;
    resizePty(sessionId, cols, rows);
  } catch {
    // Element not yet visible
  }
}

export function clearFocusedTerminalInstances(
  instances: Iterable<[string, TerminalDomInstance]>,
): void {
  for (const [, instance] of instances) {
    instance.element.classList.remove('focused');
  }
}

export function setFocusedTerminalInstance(
  sessionId: string,
  instances: Iterable<[string, TerminalDomInstance]>,
): void {
  // Only move DOM focus if it's currently on a session terminal (or nothing).
  // This prevents stealing focus from the project terminal panel, search bar, modals, etc.
  const activeEl = document.activeElement;
  const shouldFocusTerminal =
    !activeEl ||
    activeEl === document.body ||
    !!activeEl.closest('.terminal-pane');

  for (const [id, instance] of instances) {
    if (id === sessionId) {
      instance.element.classList.add('focused');
      if (shouldFocusTerminal) {
        instance.terminal.focus();
      }
    } else {
      instance.element.classList.remove('focused');
    }
  }
}
