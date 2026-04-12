import { vi } from 'vitest';

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

vi.mock('os', () => ({
  homedir: () => '/mock/home',
  tmpdir: () => '/tmp',
}));

vi.mock('./hook-commands', () => ({
  installHookScripts: vi.fn(),
  installEventScript: vi.fn(),
  statusCmd: vi.fn((e: string, s: string, _v: string, marker: string) => `echo ${e}:${s} > $CALDER_SESSION_ID.status ${marker}`),
  captureSessionIdCmd: vi.fn((_v: string, marker: string) => `capture .sessionid $CALDER_SESSION_ID ${marker}`),
  captureToolFailureCmd: vi.fn((_v: string, marker: string) => `capture-toolfailure ${marker}`),
  wrapPythonHookCmd: vi.fn((_name: string, _code: string, marker: string) => `capture-event $CALDER_SESSION_ID .events ${marker}`),
}));

vi.mock('./hook-status', () => ({
  STATUS_DIR: '/mock/home/.calder/runtime',
  getStatusLineScriptPath: vi.fn(() => '/mock/home/.calder/runtime/statusline.sh'),
}));

import * as fs from 'fs';
import * as path from 'path';
import {
  installQwenHooks,
  validateQwenHooks,
  cleanupQwenHooks,
  QWEN_HOOK_MARKER,
} from './qwen-hooks';

const mockReadFileSync = vi.mocked(fs.readFileSync);
const mockWriteFileSync = vi.mocked(fs.writeFileSync);

const n = (p: string) => p.replace(/\\/g, '/');
const SETTINGS_PATH = path.join('/mock/home', '.qwen', 'settings.json');

function mockFiles(rawFiles: Record<string, string>): void {
  const files: Record<string, string> = {};
  for (const [k, v] of Object.entries(rawFiles)) files[n(k)] = v;
  mockReadFileSync.mockImplementation((p: any) => {
    const content = files[n(String(p))];
    if (content !== undefined) return content;
    throw new Error('ENOENT');
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('installQwenHooks', () => {
  it('creates settings.json with hooks and status line on fresh install', () => {
    mockFiles({});
    installQwenHooks();

    const call = mockWriteFileSync.mock.calls.find(c => String(c[0]) === SETTINGS_PATH);
    expect(call).toBeDefined();
    const written = JSON.parse(String(call![1]));

    expect(written.ui.statusLine).toEqual({
      type: 'command',
      command: '/mock/home/.calder/runtime/statusline.sh',
    });
    expect(written.hooks.SessionStart).toBeDefined();
    expect(written.hooks.PreToolUse).toBeDefined();
    expect(written.hooks.PostToolUse).toBeDefined();
    expect(written.hooks.PostToolUseFailure).toBeDefined();
    expect(written.hooks.UserPromptSubmit).toBeDefined();
    expect(written.hooks.Stop).toBeDefined();
    expect(written.hooks.PermissionRequest).toBeDefined();
    expect(written.disableAllHooks).toBe(false);
  });

  it('preserves existing settings keys and user hooks', () => {
    mockFiles({
      [SETTINGS_PATH]: JSON.stringify({
        theme: 'dark',
        hooks: {
          SessionStart: [{ matcher: 'startup', hooks: [{ type: 'command', command: 'echo user-hook' }] }],
        },
      }),
    });
    installQwenHooks();

    const call = mockWriteFileSync.mock.calls.find(c => String(c[0]) === SETTINGS_PATH);
    const written = JSON.parse(String(call![1]));
    expect(written.theme).toBe('dark');
    expect(
      written.hooks.SessionStart.some((m: any) => m.hooks.some((h: any) => h.command === 'echo user-hook'))
    ).toBe(true);
  });

  it('writes calder marker into installed hook commands', () => {
    mockFiles({});
    installQwenHooks();

    const call = mockWriteFileSync.mock.calls.find(c => String(c[0]) === SETTINGS_PATH);
    const hooks = JSON.parse(String(call![1])).hooks;
    for (const matchers of Object.values(hooks) as any[]) {
      for (const matcher of matchers) {
        for (const hook of matcher.hooks) {
          expect(hook.command).toContain(QWEN_HOOK_MARKER);
        }
      }
    }
  });
});

describe('validateQwenHooks', () => {
  it('returns complete when managed hooks and statusline are installed', () => {
    mockFiles({});
    installQwenHooks();
    const call = mockWriteFileSync.mock.calls.find(c => String(c[0]) === SETTINGS_PATH);
    mockFiles({ [SETTINGS_PATH]: String(call![1]) });

    const result = validateQwenHooks();
    expect(result.statusLine).toBe('calder');
    expect(result.hooks).toBe('complete');
    expect(result.hookDetails.SessionStart).toBe(true);
    expect(result.hookDetails.PreToolUse).toBe(true);
    expect(result.hookDetails.Stop).toBe(true);
  });

  it('accepts quoted managed status line commands', () => {
    mockFiles({
      [SETTINGS_PATH]: JSON.stringify({
        ui: { statusLine: { type: 'command', command: '"/mock/home/.calder/runtime/statusline.sh"' } },
      }),
    });

    const result = validateQwenHooks();
    expect(result.statusLine).toBe('calder');
  });

  it('accepts wrapper commands that execute Calder status line', () => {
    mockFiles({
      [SETTINGS_PATH]: JSON.stringify({
        ui: { statusLine: { type: 'command', command: 'sh -lc \'/mock/home/.calder/runtime/statusline.sh\'' } },
      }),
    });

    const result = validateQwenHooks();
    expect(result.statusLine).toBe('calder');
  });

  it('returns foreign when a different statusline command is configured', () => {
    mockFiles({
      [SETTINGS_PATH]: JSON.stringify({
        ui: { statusLine: { type: 'command', command: 'python ~/.qwen/statusline.py' } },
      }),
    });

    const result = validateQwenHooks();
    expect(result.statusLine).toBe('foreign');
    expect(result.foreignStatusLineCommand).toContain('python ~/.qwen/statusline.py');
  });

  it('treats disabled hooks as missing even if config entries exist', () => {
    mockFiles({
      [SETTINGS_PATH]: JSON.stringify({
        disableAllHooks: true,
        hooks: {
          SessionStart: [{ matcher: '', hooks: [{ type: 'command', command: `echo ${QWEN_HOOK_MARKER}` }] }],
        },
      }),
    });

    const result = validateQwenHooks();
    expect(result.hooks).toBe('missing');
    expect(result.hookDetails.SessionStart).toBe(false);
  });
});

describe('cleanupQwenHooks', () => {
  it('removes managed hooks and status line while preserving user settings', () => {
    mockFiles({
      [SETTINGS_PATH]: JSON.stringify({
        ui: {
          statusLine: { type: 'command', command: '/mock/home/.calder/runtime/statusline.sh' },
          theme: 'dark',
        },
        hooks: {
          SessionStart: [
            { matcher: 'startup', hooks: [{ type: 'command', command: 'echo user-hook' }] },
            { matcher: '', hooks: [{ type: 'command', command: `echo ${QWEN_HOOK_MARKER}` }] },
          ],
        },
      }),
    });
    cleanupQwenHooks();

    const call = mockWriteFileSync.mock.calls.find(c => String(c[0]) === SETTINGS_PATH);
    const written = JSON.parse(String(call![1]));
    expect(written.ui.theme).toBe('dark');
    expect(written.ui.statusLine).toBeUndefined();
    expect(written.hooks.SessionStart).toHaveLength(1);
    expect(written.hooks.SessionStart[0].hooks[0].command).toBe('echo user-hook');
  });
});
