import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import { isWin } from './platform';

const STATUS_DIR = path.join('/mock/home', '.calder', 'runtime');
const STATUSLINE_SCRIPT = path.join(STATUS_DIR, isWin ? 'statusline.cmd' : 'statusline.sh');

vi.mock('fs', () => ({
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(),
  openSync: vi.fn(),
  fstatSync: vi.fn(),
  readSync: vi.fn(),
  closeSync: vi.fn(),
  readdirSync: vi.fn(),
  statSync: vi.fn(),
  unlinkSync: vi.fn(),
  rmdirSync: vi.fn(),
  rmSync: vi.fn(),
  watch: vi.fn(),
}));

vi.mock('os', () => ({
  homedir: () => '/mock/home',
  tmpdir: () => '/tmp',
}));

vi.mock('electron', () => ({
  BrowserWindow: {},
}));

import * as fs from 'fs';
import {
  installStatusLineScript,
  startWatching,
  stopWatching,
  resyncAllSessions,
  restartAndResync,
  cleanupSessionStatus,
  cleanupAll,
  registerSession,
  setInspectorEventsMiddleware,
} from './hook-status';

let watchCallback: ((eventType: string, filename: string | null) => void) | null = null;
const mockClose = vi.fn();

const mockSend = vi.fn();
function createMockWin(destroyed = false) {
  return { isDestroyed: () => destroyed, webContents: { send: mockSend } } as any;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.restoreAllMocks();
  vi.mocked(fs.mkdirSync).mockImplementation(vi.fn() as any);
  vi.mocked(fs.writeFileSync).mockImplementation(vi.fn() as any);
  vi.mocked(fs.readFileSync).mockImplementation(vi.fn() as any);
  vi.mocked(fs.openSync).mockImplementation(vi.fn() as any);
  vi.mocked(fs.fstatSync).mockImplementation(vi.fn() as any);
  vi.mocked(fs.readSync).mockImplementation(vi.fn() as any);
  vi.mocked(fs.closeSync).mockImplementation(vi.fn() as any);
  vi.mocked(fs.readdirSync).mockReturnValue([] as any);
  vi.mocked(fs.statSync).mockImplementation(vi.fn() as any);
  vi.mocked(fs.unlinkSync).mockImplementation(vi.fn() as any);
  vi.mocked(fs.rmdirSync).mockImplementation(vi.fn() as any);
  vi.mocked(fs.watch).mockImplementation((_path: any, cb: any) => {
    watchCallback = cb;
    return { close: mockClose } as any;
  });

  watchCallback = null;
  mockClose.mockClear();
  mockSend.mockClear();

  // Reset module-level watcher state
  cleanupAll();
  setInspectorEventsMiddleware(null);

  // Clear call counts after cleanup
  vi.clearAllMocks();
  watchCallback = null;

  vi.mocked(fs.watch).mockImplementation((_path: any, cb: any) => {
    watchCallback = cb;
    return { close: mockClose } as any;
  });
});

afterEach(() => {
  // Stop any polling intervals before restoring timers
  cleanupAll();
  vi.useRealTimers();
});

describe('hook-status', () => {
  describe('installStatusLineScript', () => {
    it('writes the python helper and then the stable wrapper script', () => {
      installStatusLineScript();

      expect(fs.mkdirSync).toHaveBeenCalledWith(STATUS_DIR, { recursive: true, mode: 0o700 });
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        path.join(STATUS_DIR, 'statusline.py'),
        expect.stringContaining('def render_statusline'),
        { mode: 0o755 },
      );
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        STATUSLINE_SCRIPT,
        expect.stringContaining('statusline.py'),
        { mode: 0o755 },
      );
    });
  });

  describe('startWatching', () => {
    it('creates dir and calls fs.watch', () => {
      const win = createMockWin();
      startWatching(win);

      expect(fs.mkdirSync).toHaveBeenCalledWith(STATUS_DIR, { recursive: true, mode: 0o700 });
      expect(fs.watch).toHaveBeenCalledWith(STATUS_DIR, expect.any(Function));
    });
  });

  describe('file change handling', () => {
    it('ignores file changes for unregistered sessions', () => {
      const win = createMockWin();
      startWatching(win);

      vi.mocked(fs.readFileSync).mockReturnValue('working');
      watchCallback!('change', 'unknown-session.status');

      expect(mockSend).not.toHaveBeenCalled();
    });

    it('.status with valid content sends session:hookStatus (legacy format)', () => {
      const win = createMockWin();
      startWatching(win);
      registerSession('abc123');

      vi.mocked(fs.readFileSync).mockReturnValue('working');
      watchCallback!('change', 'abc123.status');

      expect(mockSend).toHaveBeenCalledWith('session:hookStatus', 'abc123', 'working', '');
    });

    it('.status with hook name sends session:hookStatus with hook name', () => {
      const win = createMockWin();
      startWatching(win);
      registerSession('abc123');

      vi.mocked(fs.readFileSync).mockReturnValue('PostToolUse:working');
      watchCallback!('change', 'abc123.status');

      expect(mockSend).toHaveBeenCalledWith('session:hookStatus', 'abc123', 'working', 'PostToolUse');
    });

    it('.status with invalid content does not send', () => {
      const win = createMockWin();
      startWatching(win);
      registerSession('abc123');

      vi.mocked(fs.readFileSync).mockReturnValue('invalid-status');
      watchCallback!('change', 'abc123.status');

      expect(mockSend).not.toHaveBeenCalled();
    });

    it('.sessionid sends session:cliSessionId and session:claudeSessionId', () => {
      const win = createMockWin();
      startWatching(win);
      registerSession('abc123');

      vi.mocked(fs.readFileSync).mockReturnValue('claude-session-xyz');
      watchCallback!('change', 'abc123.sessionid');

      expect(mockSend).toHaveBeenCalledWith('session:cliSessionId', 'abc123', 'claude-session-xyz');
      expect(mockSend).toHaveBeenCalledWith('session:claudeSessionId', 'abc123', 'claude-session-xyz');
    });

    it('.cost parses JSON and sends session:costData', () => {
      const win = createMockWin();
      startWatching(win);
      registerSession('abc123');

      const costData = { cost: { total: 1.5 }, context_window: { used: 100 } };
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(costData));
      watchCallback!('change', 'abc123.cost');

      expect(mockSend).toHaveBeenCalledWith('session:costData', 'abc123', costData);
    });

    it('.toolfailure parses JSON, sends session:toolFailure, and deletes file', () => {
      const win = createMockWin();
      startWatching(win);
      registerSession('abc123');

      const failureData = { tool_name: 'Bash', tool_input: { command: 'gh pr list' }, error: 'exit 127' };
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(failureData));
      watchCallback!('change', 'abc123-xyzabc.toolfailure');

      expect(mockSend).toHaveBeenCalledWith('session:toolFailure', 'abc123', failureData);
      expect(fs.unlinkSync).toHaveBeenCalledWith(path.join(STATUS_DIR, 'abc123-xyzabc.toolfailure'));
    });

    it('.toolfailure extracts session ID from filename with random suffix', () => {
      const win = createMockWin();
      startWatching(win);
      registerSession('my-session-id');

      const failureData = { tool_name: 'Bash', tool_input: { command: 'jq .' }, error: 'exit 127' };
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(failureData));
      watchCallback!('change', 'my-session-id-abcdef.toolfailure');

      expect(mockSend).toHaveBeenCalledWith('session:toolFailure', 'my-session-id', failureData);
    });

    it('.toolfailure cleans up file even when JSON parsing fails', () => {
      const win = createMockWin();
      startWatching(win);
      registerSession('abc123');

      vi.mocked(fs.readFileSync).mockReturnValue('invalid json');
      watchCallback!('change', 'abc123-xyzabc.toolfailure');

      expect(mockSend).not.toHaveBeenCalled();
      expect(fs.unlinkSync).toHaveBeenCalledWith(path.join(STATUS_DIR, 'abc123-xyzabc.toolfailure'));
    });

    it('handles read errors gracefully', () => {
      const win = createMockWin();
      startWatching(win);
      registerSession('abc123');

      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('ENOENT');
      });

      expect(() => watchCallback!('change', 'abc123.status')).not.toThrow();
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('ignores unknown file extensions without crashing', () => {
      const win = createMockWin();
      startWatching(win);
      registerSession('abc123');

      expect(() => watchCallback!('change', 'abc123.unknown')).not.toThrow();
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('skips sending when window is destroyed', () => {
      const win = createMockWin();
      startWatching(win);

      // Now make the window appear destroyed for the handleFileChange check
      // We need a win whose isDestroyed flips, so create a mutable one
      const destroyableWin = { isDestroyed: vi.fn().mockReturnValue(false), webContents: { send: mockSend } } as any;
      // Re-start watching with the destroyable win
      startWatching(destroyableWin);

      registerSession('abc123');
      destroyableWin.isDestroyed.mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('working');
      watchCallback!('change', 'abc123.status');

      expect(mockSend).not.toHaveBeenCalled();
    });

    it('resyncs all sessions on null filename', () => {
      const win = createMockWin();
      startWatching(win);
      registerSession('abc123');

      vi.mocked(fs.readdirSync).mockReturnValue(['abc123.cost'] as any);
      const costData = { cost: { total: 1.0 }, context_window: {} };
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(costData));

      watchCallback!('change', null);

      expect(fs.readdirSync).toHaveBeenCalledWith(STATUS_DIR);
      expect(mockSend).toHaveBeenCalledWith('session:costData', 'abc123', costData);
    });

    it('.events streams JSONL inspector events and tracks offsets', () => {
      const win = createMockWin();
      startWatching(win);
      registerSession('abc123');
      const eventFile = path.join(STATUS_DIR, 'abc123.events');
      const payload = '{"type":"tool","name":"Bash"}\n{"type":"stop"}\n';
      const payloadSize = Buffer.byteLength(payload);

      vi.mocked(fs.openSync).mockReturnValue(11 as any);
      vi.mocked(fs.fstatSync).mockReturnValue({ size: payloadSize } as any);
      vi.mocked(fs.readSync).mockImplementation((_fd: any, buffer: any) => {
        Buffer.from(payload, 'utf-8').copy(buffer as Buffer);
        return payloadSize as any;
      });

      watchCallback!('change', 'abc123.events');
      expect(fs.openSync).toHaveBeenCalledWith(eventFile, 'r');
      expect(fs.readSync).toHaveBeenCalled();
      expect(mockSend).toHaveBeenCalledWith('session:inspectorEvents', 'abc123', [
        { type: 'tool', name: 'Bash' },
        { type: 'stop' },
      ]);
      expect(fs.closeSync).toHaveBeenCalledWith(11);

      // Same size again should not re-read or re-emit (offset already advanced)
      vi.clearAllMocks();
      vi.mocked(fs.openSync).mockReturnValue(12 as any);
      vi.mocked(fs.fstatSync).mockReturnValue({ size: payloadSize } as any);
      watchCallback!('change', 'abc123.events');
      expect(fs.readSync).not.toHaveBeenCalled();
      expect(mockSend).not.toHaveBeenCalled();
      expect(fs.closeSync).toHaveBeenCalledWith(12);
    });

    it('.events skips malformed JSON lines but still emits valid ones', () => {
      const win = createMockWin();
      startWatching(win);
      registerSession('abc123');
      const payload = '{"type":"ok"}\nnot-json\n{"type":"ok2"}\n';
      const payloadSize = Buffer.byteLength(payload);

      vi.mocked(fs.openSync).mockReturnValue(21 as any);
      vi.mocked(fs.fstatSync).mockReturnValue({ size: payloadSize } as any);
      vi.mocked(fs.readSync).mockImplementation((_fd: any, buffer: any) => {
        Buffer.from(payload, 'utf-8').copy(buffer as Buffer);
        return payloadSize as any;
      });

      watchCallback!('change', 'abc123.events');
      expect(mockSend).toHaveBeenCalledWith('session:inspectorEvents', 'abc123', [
        { type: 'ok' },
        { type: 'ok2' },
      ]);
    });

    it('.events runs middleware before forwarding inspector events', () => {
      const win = createMockWin();
      startWatching(win);
      registerSession('abc123');
      const payload = '{"type":"permission_request"}\n';
      const payloadSize = Buffer.byteLength(payload);

      setInspectorEventsMiddleware((sessionId, events) => {
        return [
          ...events,
          {
            type: 'approval_decision',
            timestamp: 123,
            hookEvent: 'AutoApproval',
            auto_approval: {
              policy_source: 'project',
              effective_mode: 'edit_only',
              operation_class: 'edit',
              decision: 'allow',
              reason: `session:${sessionId}`,
            },
          },
        ] as any;
      });

      vi.mocked(fs.openSync).mockReturnValue(22 as any);
      vi.mocked(fs.fstatSync).mockReturnValue({ size: payloadSize } as any);
      vi.mocked(fs.readSync).mockImplementation((_fd: any, buffer: any) => {
        Buffer.from(payload, 'utf-8').copy(buffer as Buffer);
        return payloadSize as any;
      });

      watchCallback!('change', 'abc123.events');
      expect(mockSend).toHaveBeenCalledWith('session:inspectorEvents', 'abc123', [
        { type: 'permission_request' },
        {
          type: 'approval_decision',
          timestamp: 123,
          hookEvent: 'AutoApproval',
          auto_approval: {
            policy_source: 'project',
            effective_mode: 'edit_only',
            operation_class: 'edit',
            decision: 'allow',
            reason: 'session:abc123',
          },
        },
      ]);
    });

    it('.events handles read failures and still closes opened descriptors', () => {
      const win = createMockWin();
      startWatching(win);
      registerSession('abc123');

      vi.mocked(fs.openSync).mockReturnValue(31 as any);
      vi.mocked(fs.fstatSync).mockImplementation(() => {
        throw new Error('stat failed');
      });

      expect(() => watchCallback!('change', 'abc123.events')).not.toThrow();
      expect(mockSend).not.toHaveBeenCalled();
      expect(fs.closeSync).toHaveBeenCalledWith(31);
    });

    it('.events buffers trailing partial JSON and emits it once completed', () => {
      const win = createMockWin();
      startWatching(win);
      registerSession('abc123');

      const chunk1 = '{"type":"tool","name":"Bash"}\n{"type":"st';
      const chunk2 = 'op"}\n';
      const size1 = Buffer.byteLength(chunk1);
      const totalSize = size1 + Buffer.byteLength(chunk2);

      vi.mocked(fs.openSync)
        .mockReturnValueOnce(51 as any)
        .mockReturnValueOnce(52 as any);
      vi.mocked(fs.fstatSync)
        .mockReturnValueOnce({ size: size1 } as any)
        .mockReturnValueOnce({ size: totalSize } as any);
      vi.mocked(fs.readSync)
        .mockImplementationOnce((_fd: any, buffer: any) => {
          Buffer.from(chunk1, 'utf-8').copy(buffer as Buffer);
          return size1 as any;
        })
        .mockImplementationOnce((_fd: any, buffer: any) => {
          Buffer.from(chunk2, 'utf-8').copy(buffer as Buffer);
          return Buffer.byteLength(chunk2) as any;
        });

      watchCallback!('change', 'abc123.events');
      watchCallback!('change', 'abc123.events');

      expect(mockSend).toHaveBeenNthCalledWith(1, 'session:inspectorEvents', 'abc123', [
        { type: 'tool', name: 'Bash' },
      ]);
      expect(mockSend).toHaveBeenNthCalledWith(2, 'session:inspectorEvents', 'abc123', [
        { type: 'stop' },
      ]);
    });

    it('.events resets offset when file is truncated and reads from start', () => {
      const win = createMockWin();
      startWatching(win);
      registerSession('abc123');

      const payload1 = '{"type":"first"}\n';
      const payload2 = '{"type":"r"}\n';
      const size1 = Buffer.byteLength(payload1);
      const size2 = Buffer.byteLength(payload2);

      vi.mocked(fs.openSync)
        .mockReturnValueOnce(61 as any)
        .mockReturnValueOnce(62 as any);
      vi.mocked(fs.fstatSync)
        .mockReturnValueOnce({ size: size1 } as any)
        .mockReturnValueOnce({ size: size2 } as any);
      vi.mocked(fs.readSync)
        .mockImplementationOnce((_fd: any, buffer: any) => {
          Buffer.from(payload1, 'utf-8').copy(buffer as Buffer);
          return size1 as any;
        })
        .mockImplementationOnce((_fd: any, buffer: any) => {
          Buffer.from(payload2, 'utf-8').copy(buffer as Buffer);
          return size2 as any;
        });

      watchCallback!('change', 'abc123.events');
      watchCallback!('change', 'abc123.events');

      expect(mockSend).toHaveBeenNthCalledWith(1, 'session:inspectorEvents', 'abc123', [
        { type: 'first' },
      ]);
      expect(mockSend).toHaveBeenNthCalledWith(2, 'session:inspectorEvents', 'abc123', [
        { type: 'r' },
      ]);
      expect(vi.mocked(fs.readSync).mock.calls[1][4]).toBe(0);
    });

    it('.events derives codex token snapshots into session:costData updates', () => {
      const win = createMockWin();
      startWatching(win);
      registerSession('abc123', 'codex');
      const payload = '{"type":"tool_use","model":"gpt-5.1","usage":{"input_tokens":100,"cached_input_tokens":20,"output_tokens":10}}\n';
      const payloadSize = Buffer.byteLength(payload);

      vi.mocked(fs.openSync).mockReturnValue(71 as any);
      vi.mocked(fs.fstatSync).mockReturnValue({ size: payloadSize } as any);
      vi.mocked(fs.readSync).mockImplementation((_fd: any, buffer: any) => {
        Buffer.from(payload, 'utf-8').copy(buffer as Buffer);
        return payloadSize as any;
      });

      watchCallback!('change', 'abc123.events');

      expect(mockSend).toHaveBeenNthCalledWith(1, 'session:costData', 'abc123', {
        source: 'derived',
        model: 'gpt-5.1',
        cost: {
          total_cost_usd: 0,
          total_duration_ms: 0,
          total_api_duration_ms: 0,
        },
        context_window: {
          total_input_tokens: 100,
          total_output_tokens: 10,
          context_window_size: 200000,
          used_percentage: 0.05,
          current_usage: {
            input_tokens: 80,
            output_tokens: 10,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 20,
          },
        },
      });
      expect(mockSend).toHaveBeenNthCalledWith(2, 'session:inspectorEvents', 'abc123', [
        { type: 'tool_use', model: 'gpt-5.1', usage: { input_tokens: 100, cached_input_tokens: 20, output_tokens: 10 } },
      ]);
    });

    it('.events derives gemini usageMetadata snapshots into session:costData updates', () => {
      const win = createMockWin();
      startWatching(win);
      registerSession('abc123', 'gemini');
      const payload = '{"type":"tool_use","model":"gemini-2.5-pro","usage_metadata":{"promptTokenCount":120,"cachedContentTokenCount":30,"candidatesTokenCount":40,"totalTokenCount":160}}\n';
      const payloadSize = Buffer.byteLength(payload);

      vi.mocked(fs.openSync).mockReturnValue(72 as any);
      vi.mocked(fs.fstatSync).mockReturnValue({ size: payloadSize } as any);
      vi.mocked(fs.readSync).mockImplementation((_fd: any, buffer: any) => {
        Buffer.from(payload, 'utf-8').copy(buffer as Buffer);
        return payloadSize as any;
      });

      watchCallback!('change', 'abc123.events');

      expect(mockSend).toHaveBeenNthCalledWith(1, 'session:costData', 'abc123', {
        source: 'derived',
        model: 'gemini-2.5-pro',
        cost: {
          total_cost_usd: 0,
          total_duration_ms: 0,
          total_api_duration_ms: 0,
        },
        context_window: {
          total_input_tokens: 120,
          total_output_tokens: 40,
          context_window_size: 1000000,
          used_percentage: 0.012,
          current_usage: {
            input_tokens: 90,
            output_tokens: 40,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 30,
          },
        },
      });
      expect(mockSend).toHaveBeenNthCalledWith(2, 'session:inspectorEvents', 'abc123', [
        {
          type: 'tool_use',
          model: 'gemini-2.5-pro',
          usage_metadata: {
            promptTokenCount: 120,
            cachedContentTokenCount: 30,
            candidatesTokenCount: 40,
            totalTokenCount: 160,
          },
        },
      ]);
    });
  });

  describe('resyncAllSessions', () => {
    it('processes all matching files in dir', () => {
      const win = createMockWin();
      registerSession('s1');
      registerSession('s2');
      registerSession('s3');
      vi.mocked(fs.readdirSync).mockReturnValue([
        's1.status',
        's2.sessionid',
        's3.cost',
        'unrelated.txt',
      ] as any);

      vi.mocked(fs.readFileSync)
        .mockReturnValueOnce('waiting')         // s1.status
        .mockReturnValueOnce('claude-sess-1')   // s2.sessionid
        .mockReturnValueOnce(JSON.stringify({ cost: {} })); // s3.cost

      resyncAllSessions(win);

      expect(mockSend).toHaveBeenCalledWith('session:hookStatus', 's1', 'waiting', '');
      expect(mockSend).toHaveBeenCalledWith('session:cliSessionId', 's2', 'claude-sess-1');
      expect(mockSend).toHaveBeenCalledWith('session:claudeSessionId', 's2', 'claude-sess-1');
      expect(mockSend).toHaveBeenCalledWith('session:costData', 's3', { cost: {} });
      expect(mockSend).toHaveBeenCalledTimes(4);
    });

    it('is a no-op on destroyed window', () => {
      const win = createMockWin(true);
      resyncAllSessions(win);

      expect(fs.readdirSync).not.toHaveBeenCalled();
    });

    it('handles missing directory gracefully', () => {
      const win = createMockWin();
      vi.mocked(fs.readdirSync).mockImplementation(() => {
        throw new Error('ENOENT');
      });

      expect(() => resyncAllSessions(win)).not.toThrow();
      expect(mockSend).not.toHaveBeenCalled();
    });
  });

  describe('restartAndResync', () => {
    it('calls both restartWatcher and resyncAllSessions', () => {
      const win = createMockWin();
      vi.mocked(fs.readdirSync).mockReturnValue([] as any);

      restartAndResync(win);

      expect(fs.watch).toHaveBeenCalledWith(STATUS_DIR, expect.any(Function));
      expect(fs.readdirSync).toHaveBeenCalledWith(STATUS_DIR);
    });
  });

  describe('cleanupSessionStatus', () => {
    it('unlinks all 5 file types', () => {
      cleanupSessionStatus('sess-1');

      expect(fs.unlinkSync).toHaveBeenCalledWith(path.join(STATUS_DIR, 'sess-1.status'));
      expect(fs.unlinkSync).toHaveBeenCalledWith(path.join(STATUS_DIR, 'sess-1.sessionid'));
      expect(fs.unlinkSync).toHaveBeenCalledWith(path.join(STATUS_DIR, 'sess-1.cost'));
      expect(fs.unlinkSync).toHaveBeenCalledWith(path.join(STATUS_DIR, 'sess-1.toolfailure'));
      expect(fs.unlinkSync).toHaveBeenCalledWith(path.join(STATUS_DIR, 'sess-1.events'));
      expect(fs.unlinkSync).toHaveBeenCalledTimes(5);
    });

    it('handles errors when files do not exist', () => {
      vi.mocked(fs.unlinkSync).mockImplementation(() => {
        throw new Error('ENOENT');
      });

      expect(() => cleanupSessionStatus('sess-1')).not.toThrow();
    });
  });

  describe('polling fallback', () => {
    it('re-processes a file recreated with the same mtime after it disappeared', () => {
      const win = createMockWin();
      registerSession('s1');
      const costPayload = { cost: { total: 1 }, context_window: {} };

      vi.mocked(fs.readdirSync)
        .mockReturnValueOnce(['s1.cost'] as any)
        .mockReturnValueOnce([] as any)
        .mockReturnValueOnce(['s1.cost'] as any);
      vi.mocked(fs.statSync).mockReturnValue({ mtimeMs: 1000 } as any);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(costPayload));

      startWatching(win);

      vi.advanceTimersByTime(2000);
      expect(mockSend).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(2000);
      expect(mockSend).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(2000);
      expect(mockSend).toHaveBeenCalledTimes(2);
      expect(mockSend).toHaveBeenNthCalledWith(2, 'session:costData', 's1', costPayload);
    });

    it('skips stat/read work for files that belong to unknown sessions', () => {
      const win = createMockWin();
      registerSession('s1');

      vi.mocked(fs.readdirSync).mockReturnValue(['unknown.cost', 's1.cost'] as any);
      vi.mocked(fs.statSync).mockReturnValue({ mtimeMs: 1000 } as any);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ cost: { total: 1 }, context_window: {} }));

      startWatching(win);
      vi.advanceTimersByTime(2000);

      expect(fs.statSync).toHaveBeenCalledTimes(1);
      expect(fs.statSync).toHaveBeenCalledWith(path.join(STATUS_DIR, 's1.cost'));
      expect(mockSend).toHaveBeenCalledWith('session:costData', 's1', { cost: { total: 1 }, context_window: {} });
    });

    it('processes first-seen session files during polling when watch misses the event', () => {
      const win = createMockWin();
      registerSession('s1');

      vi.mocked(fs.readdirSync).mockReturnValue(['s1.sessionid'] as any);
      vi.mocked(fs.statSync).mockReturnValue({ mtimeMs: 1000 } as any);
      vi.mocked(fs.readFileSync).mockReturnValue('cli-session-1');

      startWatching(win);
      vi.advanceTimersByTime(2000);

      expect(mockSend).toHaveBeenCalledWith('session:cliSessionId', 's1', 'cli-session-1');
      expect(mockSend).toHaveBeenCalledWith('session:claudeSessionId', 's1', 'cli-session-1');
    });

    it('detects changed files on poll interval', () => {
      const win = createMockWin();
      registerSession('s1');

      // First poll seeds mtimes
      vi.mocked(fs.readdirSync).mockReturnValue(['s1.cost'] as any);
      vi.mocked(fs.statSync).mockReturnValue({ mtimeMs: 1000 } as any);

      startWatching(win);

      // Advance to trigger first poll — seeds mtimes, no handleFileChange
      vi.advanceTimersByTime(2000);
      expect(mockSend).not.toHaveBeenCalled();

      // Now file has changed mtime
      vi.mocked(fs.statSync).mockReturnValue({ mtimeMs: 2000 } as any);
      const costData = { cost: { total: 0.5 }, context_window: {} };
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(costData));

      vi.advanceTimersByTime(2000);
      expect(mockSend).toHaveBeenCalledWith('session:costData', 's1', costData);
    });

    it('skips files with unchanged mtime', () => {
      const win = createMockWin();

      vi.mocked(fs.readdirSync).mockReturnValue(['s1.cost'] as any);
      vi.mocked(fs.statSync).mockReturnValue({ mtimeMs: 1000 } as any);

      startWatching(win);

      // Seed mtimes
      vi.advanceTimersByTime(2000);

      // Same mtime — no change
      vi.advanceTimersByTime(2000);
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('stops polling on cleanupAll', () => {
      const win = createMockWin();
      startWatching(win);
      cleanupAll();

      vi.mocked(fs.readdirSync).mockReturnValue(['s1.cost'] as any);
      vi.mocked(fs.statSync).mockReturnValue({ mtimeMs: 1000 } as any);

      vi.advanceTimersByTime(4000);
      expect(fs.statSync).not.toHaveBeenCalled();
    });

    it('stopWatching keeps inspector middleware for next watcher start', () => {
      const win = createMockWin();
      startWatching(win);
      registerSession('abc123');

      setInspectorEventsMiddleware((_, events) => [
        ...events,
        { type: 'marker' } as any,
      ]);

      stopWatching();
      startWatching(win);
      registerSession('abc123');

      const payload = '{"type":"permission_request"}\n';
      const payloadSize = Buffer.byteLength(payload);

      vi.mocked(fs.openSync).mockReturnValue(23 as any);
      vi.mocked(fs.fstatSync).mockReturnValue({ size: payloadSize } as any);
      vi.mocked(fs.readSync).mockImplementation((_fd: any, buffer: any) => {
        Buffer.from(payload, 'utf-8').copy(buffer as Buffer);
        return payloadSize as any;
      });

      watchCallback!('change', 'abc123.events');
      expect(mockSend).toHaveBeenCalledWith('session:inspectorEvents', 'abc123', [
        { type: 'permission_request' },
        { type: 'marker' },
      ]);
    });
  });

  describe('cleanupAll', () => {
    it('removes provider quota cache artifacts', () => {
      vi.mocked(fs.readdirSync).mockReturnValue([
        'anthropic.quota.json',
        'zai.quota.json',
        'statusline.refresh.lock',
      ] as any);

      cleanupAll();

      expect(fs.unlinkSync).toHaveBeenCalledWith(path.join(STATUS_DIR, 'anthropic.quota.json'));
      expect(fs.unlinkSync).toHaveBeenCalledWith(path.join(STATUS_DIR, 'zai.quota.json'));
      expect(fs.unlinkSync).toHaveBeenCalledWith(path.join(STATUS_DIR, 'statusline.refresh.lock'));
    });

    it('closes watcher and removes transient runtime artifacts only', () => {
      const win = createMockWin();
      startWatching(win);
      vi.clearAllMocks();

      vi.mocked(fs.readdirSync).mockReturnValue([
        'a.status',
        'b.sessionid',
        'c.cost',
        'status_writer.py',
        'statusline.py',
        isWin ? 'statusline.cmd' : 'statusline.sh',
        'other.log',
      ] as any);

      cleanupAll();

      expect(mockClose).toHaveBeenCalled();
      expect(fs.unlinkSync).toHaveBeenCalledWith(path.join(STATUS_DIR, 'a.status'));
      expect(fs.unlinkSync).toHaveBeenCalledWith(path.join(STATUS_DIR, 'b.sessionid'));
      expect(fs.unlinkSync).toHaveBeenCalledWith(path.join(STATUS_DIR, 'c.cost'));
      expect(fs.unlinkSync).not.toHaveBeenCalledWith(path.join(STATUS_DIR, 'status_writer.py'));
      expect(fs.unlinkSync).not.toHaveBeenCalledWith(path.join(STATUS_DIR, 'statusline.py'));
      expect(fs.unlinkSync).not.toHaveBeenCalledWith(STATUSLINE_SCRIPT);
      expect(fs.rmSync).not.toHaveBeenCalled();
      expect(fs.unlinkSync).toHaveBeenCalledTimes(3);
    });

    it('handles missing directory gracefully', () => {
      vi.mocked(fs.readdirSync).mockImplementation(() => {
        throw new Error('ENOENT');
      });

      expect(() => cleanupAll()).not.toThrow();
    });
  });
});
