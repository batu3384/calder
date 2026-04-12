import {
  createCliSurfaceEmitter,
  type CliSurfaceProtocolWriter,
} from '../../shared/cli-surface-protocol.js';

export interface CliSurfaceDemoItem {
  id: string;
  label: string;
  shortcut: string;
}

export interface CliSurfaceDemoState {
  title: string;
  items: CliSurfaceDemoItem[];
  activeIndex: number;
  dirty: boolean;
}

export type CliSurfaceDemoAction = 'next' | 'previous' | 'toggle-dirty';

const SOURCE_FILE = 'src/main/fixtures/cli-surface-demo.ts';

export function createCliSurfaceDemoState(): CliSurfaceDemoState {
  return {
    title: 'Project Actions',
    activeIndex: 0,
    dirty: false,
    items: [
      { id: 'telemetry', label: 'Review telemetry', shortcut: '1' },
      { id: 'settings', label: 'Tighten settings', shortcut: '2' },
      { id: 'release', label: 'Ship release build', shortcut: '3' },
    ],
  };
}

export function updateCliSurfaceDemoState(
  state: CliSurfaceDemoState,
  action: CliSurfaceDemoAction,
): CliSurfaceDemoState {
  if (action === 'toggle-dirty') {
    return { ...state, dirty: !state.dirty };
  }

  const delta = action === 'next' ? 1 : -1;
  const nextIndex = (state.activeIndex + delta + state.items.length) % state.items.length;
  return { ...state, activeIndex: nextIndex };
}

export function renderCliSurfaceDemoFrame(state: CliSurfaceDemoState, width = 44): string {
  const innerWidth = Math.max(26, width - 2);
  const bodyWidth = innerWidth - 2;
  const top = `╭ ${fitLabel(state.title, bodyWidth - 2)} ╮`;
  const rows = state.items.map((item, index) => {
    const prefix = index === state.activeIndex ? '>' : ' ';
    return boxLine(`${prefix} ${item.shortcut}. ${item.label}`, bodyWidth);
  });
  const divider = `├${'─'.repeat(innerWidth)}┤`;
  const footer = boxLine(`Dirty: ${state.dirty ? 'yes' : 'no'}  j/k move  d toggle  q quit`, bodyWidth);
  const bottom = `╰${'─'.repeat(innerWidth)}╯`;
  return [top, ...rows, divider, footer, bottom].join('\n');
}

function fitLabel(value: string, width: number): string {
  if (value.length >= width) return value.slice(0, Math.max(0, width - 1)) + '…';
  return value + ' '.repeat(width - value.length);
}

function boxLine(value: string, width: number): string {
  return `│ ${fitLabel(value, width)} │`;
}

export function emitCliSurfaceDemoSemantics(
  writer: CliSurfaceProtocolWriter,
  state: CliSurfaceDemoState,
): void {
  const emitter = createCliSurfaceEmitter(writer);
  const footerRow = state.items.length + 1;
  const activeItem = state.items[state.activeIndex];

  emitter.emitNode({
    nodeId: 'project-actions.root',
    label: state.title,
    sourceFile: SOURCE_FILE,
    bounds: { mode: 'region', startRow: 0, endRow: footerRow + 1, startCol: 0, endCol: 80 },
    meta: {
      framework: 'Calder',
      widgetType: 'panel',
    },
  });

  state.items.forEach((item, index) => {
    emitter.emitNode({
      nodeId: `project-actions.item.${item.id}`,
      label: item.label,
      sourceFile: SOURCE_FILE,
      bounds: { mode: 'line', startRow: index + 1, endRow: index + 1, startCol: 0, endCol: 80 },
      meta: {
        framework: 'Calder',
        widgetType: 'menu-item',
        shortcut: item.shortcut,
      },
    });
  });

  emitter.emitNode({
    nodeId: 'project-actions.footer',
    label: 'status footer',
    sourceFile: SOURCE_FILE,
    bounds: { mode: 'line', startRow: footerRow, endRow: footerRow, startCol: 0, endCol: 80 },
    meta: {
      framework: 'Calder',
      widgetType: 'footer',
    },
  });

  emitter.emitFocus({
    nodeId: `project-actions.item.${activeItem.id}`,
    label: activeItem.label,
    sourceFile: SOURCE_FILE,
    meta: {
      framework: 'Calder',
      focusPath: ['screen', state.title, activeItem.label],
    },
  });

  emitter.emitState({
    nodeId: 'project-actions.root',
    sourceFile: SOURCE_FILE,
    meta: {
      framework: 'Calder',
      activeItemId: activeItem.id,
      activeItemLabel: activeItem.label,
      dirty: state.dirty,
      stateSummary: state.dirty ? 'Unsaved changes' : 'Ready',
    },
  });
}

export function writeCliSurfaceDemoFrame(
  writer: CliSurfaceProtocolWriter,
  state: CliSurfaceDemoState,
  width = 44,
): void {
  const chunk = `\u001b[2J\u001b[H${renderCliSurfaceDemoFrame(state, width)}\n`;
  if (typeof writer === 'function') {
    writer(chunk);
  } else {
    writer.write(chunk);
  }
  emitCliSurfaceDemoSemantics(writer, state);
}

export function runCliSurfaceDemo(): void {
  if (!process.stdout.isTTY || !process.stdin.isTTY) {
    process.stderr.write('CLI Surface demo needs a TTY.\n');
    process.exitCode = 1;
    return;
  }

  let state = createCliSurfaceDemoState();
  const stdoutWriter = { write: (chunk: string) => process.stdout.write(chunk) };
  const render = () => {
    const width = Math.max(38, Math.min(process.stdout.columns || 44, 72));
    writeCliSurfaceDemoFrame(stdoutWriter, state, width);
  };

  const cleanup = () => {
    process.stdin.setRawMode(false);
    process.stdin.pause();
    process.stdout.write('\u001b[?25h\n');
  };

  process.stdout.write('\u001b[?25l');
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');

  render();

  process.stdin.on('data', (chunk: string) => {
    if (chunk === '\u0003' || chunk === 'q') {
      cleanup();
      process.exit(0);
      return;
    }
    if (chunk === 'j' || chunk === '\u001b[B') {
      state = updateCliSurfaceDemoState(state, 'next');
      render();
      return;
    }
    if (chunk === 'k' || chunk === '\u001b[A') {
      state = updateCliSurfaceDemoState(state, 'previous');
      render();
      return;
    }
    if (chunk === 'd') {
      state = updateCliSurfaceDemoState(state, 'toggle-dirty');
      render();
    }
  });

  process.on('SIGINT', () => {
    cleanup();
    process.exit(0);
  });
}

if (require.main === module) {
  runCliSurfaceDemo();
}
