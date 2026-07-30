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

export function bindTerminalColorSchemeSupport(terminal: Terminal): void {
  // ponytail: xterm.js lacks mode 2031; answer DECDSR 997 as dark so CLIs keep brand palettes.
  const register = terminal.parser?.registerCsiHandler;
  if (!register) return;

  register.call(terminal.parser, { prefix: '?', final: 'n' }, (params) => {
    if (params.length === 1 && params[0] === 997) {
      terminal.write('\x1b[?997;1n');
      return true;
    }
    return false;
  });
}

export function createTerminalCore(args: CreateTerminalCoreArgs): TerminalCore {
  const terminal = new Terminal({
    theme: {
      background: '#000000',
      foreground: '#e6e6e6',
      cursor: '#e94560',
      selectionBackground: '#ff6b85a6',
      black: '#000000',
      red: '#cd3131',
      green: '#0dbc79',
      yellow: '#e5e510',
      blue: '#2472c8',
      magenta: '#bc3fbc',
      cyan: '#11a8cd',
      white: '#e5e5e5',
      brightBlack: '#666666',
      brightRed: '#f14c4c',
      brightGreen: '#23d18b',
      brightYellow: '#f5f543',
      brightBlue: '#3b8eea',
      brightMagenta: '#d670d6',
      brightCyan: '#29b8db',
      brightWhite: '#e5e5e5',
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

  bindTerminalColorSchemeSupport(terminal);

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
