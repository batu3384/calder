import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Terminal } from '@xterm/xterm';

import { FilePathLinkProvider, GithubLinkProvider } from './terminal-link-provider.js';
import { attachClipboardCopyHandler } from './terminal-utils.js';

export interface TerminalCore {
  terminal: Terminal;
  fitAddon: FitAddon;
  searchAddon: SearchAddon;
}

interface CreateTerminalCoreArgs {
  sessionId: string;
  projectPath: string;
  activateOscLink: (event: MouseEvent | undefined, uri: string) => void;
  activateWebLink: (event: MouseEvent | undefined, url: string) => void;
}

export function createTerminalCore(args: CreateTerminalCoreArgs): TerminalCore {
  const terminal = new Terminal({
    theme: {
      background: '#000000',
      foreground: '#e0e0e0',
      cursor: '#e94560',
      selectionBackground: '#ff6b85a6',
      black: '#000000',
      red: '#e94560',
      green: '#0f9b58',
      yellow: '#f4b400',
      blue: '#4285f4',
      magenta: '#ab47bc',
      cyan: '#00acc1',
      white: '#e0e0e0',
    },
    fontSize: 14,
    fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', Menlo, monospace",
    cursorBlink: true,
    allowProposedApi: true,
    linkHandler: {
      activate: (event, uri) => {
        args.activateOscLink(event, uri);
      },
    },
  });

  const fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);

  const searchAddon = new SearchAddon();
  terminal.loadAddon(searchAddon);

  terminal.loadAddon(
    new WebLinksAddon((event, url) => {
      args.activateWebLink(event, url);
    }),
  );

  return { terminal, fitAddon, searchAddon };
}

interface BindTerminalInputAndFocusHandlersArgs {
  terminal: Terminal;
  element: HTMLDivElement;
  sessionId: string;
  writePtyData: (sessionId: string, data: string) => void;
  setFocused: (sessionId: string) => void;
  getFocusedSessionId: () => string | null;
}

export function bindTerminalInputAndFocusHandlers(
  args: BindTerminalInputAndFocusHandlersArgs,
): void {
  // Send CSI u encoding for Shift+Enter so Claude CLI treats it as newline
  attachClipboardCopyHandler(args.terminal, (event) => {
    if (event.shiftKey && event.key === 'Enter') {
      if (event.type === 'keydown') args.writePtyData(args.sessionId, '\x1b[13;2u');
      event.preventDefault();
      return false;
    }
  });

  // Handle user input → PTY
  args.terminal.onData((data) => {
    args.writePtyData(args.sessionId, data);
  });

  // Focus tracking
  args.element.addEventListener('mousedown', () => {
    args.setFocused(args.sessionId);
  });
  args.terminal.onData(() => {
    if (args.getFocusedSessionId() !== args.sessionId) {
      args.setFocused(args.sessionId);
    }
  });
}

interface RegisterTerminalLinkProvidersArgs {
  terminal: Terminal;
  projectPath: string;
  projectId?: string;
  getRemoteUrl: (projectPath: string) => Promise<string | null | undefined>;
}

export function registerTerminalLinkProviders(args: RegisterTerminalLinkProvidersArgs): void {
  // Register file path link provider for Cmd+Click
  if (args.projectId) {
    args.terminal.registerLinkProvider(new FilePathLinkProvider(args.projectId, args.terminal));
  }

  // Register GitHub #123 link provider
  void args.getRemoteUrl(args.projectPath).then((repoUrl) => {
    if (repoUrl) {
      args.terminal.registerLinkProvider(new GithubLinkProvider(repoUrl, args.terminal));
    }
  });
}
