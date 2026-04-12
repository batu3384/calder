import { Menu, BrowserWindow } from 'electron';
import { isMac } from './platform';

export function createAppMenu(debugMode = false): void {

  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac ? [{
      label: 'Calder',
      submenu: [
        { role: 'about' as const },
        { type: 'separator' as const },
        {
          label: 'Preferences…',
          accelerator: 'CmdOrCtrl+,',
          click: () => sendToRenderer('menu:preferences'),
        },
        { type: 'separator' as const },
        { role: 'quit' as const },
      ],
    }] : []),
    {
      label: 'File',
      submenu: [
        ...(!isMac ? [{
          label: 'Preferences…',
          accelerator: 'CmdOrCtrl+,',
          click: () => sendToRenderer('menu:preferences'),
        }, { type: 'separator' as const }] : []),
        {
          label: 'New Project',
          accelerator: 'CmdOrCtrl+Shift+P',
          click: () => sendToRenderer('menu:new-project'),
        },
        {
          label: 'New Session',
          accelerator: 'CmdOrCtrl+Shift+N',
          click: () => sendToRenderer('menu:new-session'),
        },
        { type: 'separator' },
        isMac ? {
          label: 'Close Session',
          accelerator: 'CmdOrCtrl+W',
          click: () => sendToRenderer('menu:close-session'),
        } : { role: 'quit' as const },
        ...(isMac ? [{
          label: 'Close Window',
          accelerator: 'CmdOrCtrl+Shift+W',
          click: () => { BrowserWindow.getFocusedWindow()?.close(); },
        }] : []),
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' as const },
        { role: 'redo' as const },
        { type: 'separator' as const },
        { role: 'cut' as const },
        { role: 'copy' as const },
        { role: 'paste' as const },
        { role: 'pasteAndMatchStyle' as const },
        { role: 'delete' as const },
        { role: 'selectAll' as const },
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Project Scratch Shell',
          click: () => sendToRenderer('menu:project-terminal'),
        },
        {
          label: 'Usage Stats',
          accelerator: 'CmdOrCtrl+Shift+U',
          click: () => sendToRenderer('menu:usage-stats'),
        },
        {
          label: 'New MCP Inspector',
          click: () => sendToRenderer('menu:new-mcp-inspector'),
        },
        { type: 'separator' },
        {
          label: 'Toggle Control Panel',
          click: () => sendToRenderer('menu:toggle-context-panel'),
        },
        {
          label: 'Toggle Session Inspector',
          accelerator: 'CmdOrCtrl+Shift+I',
          click: () => sendToRenderer('menu:toggle-inspector'),
        },
        ...(debugMode ? [
          {
            label: 'Toggle Debug Panel',
            accelerator: 'CmdOrCtrl+Shift+D',
            click: () => sendToRenderer('menu:toggle-debug'),
          },
          { type: 'separator' as const },
          { role: 'toggleDevTools' as const },
          { role: 'reload' as const },
        ] : []),
        // Hidden session-switching shortcuts (no visible menu)
        {
          label: 'Next Session',
          accelerator: 'CmdOrCtrl+Shift+]',
          visible: false,
          click: () => sendToRenderer('menu:next-session'),
        },
        {
          label: 'Previous Session',
          accelerator: 'CmdOrCtrl+Shift+[',
          visible: false,
          click: () => sendToRenderer('menu:prev-session'),
        },
        ...Array.from({ length: 9 }, (_, i) => ({
          label: `Session ${i + 1}`,
          accelerator: `CmdOrCtrl+${i + 1}`,
          visible: false,
          click: () => sendToRenderer('menu:goto-session', i),
        })),
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Session Indicators Help',
          click: () => sendToRenderer('menu:session-indicators-help'),
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function sendToRenderer(channel: string, ...args: unknown[]): void {
  const win = BrowserWindow.getFocusedWindow();
  if (win) {
    win.webContents.send(channel, ...args);
  }
}
