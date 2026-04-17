import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockExecFile, mockFetch } = vi.hoisted(() => ({
  mockExecFile: vi.fn(),
  mockFetch: vi.fn(),
}));

vi.mock('child_process', () => ({
  execFile: mockExecFile,
}));

vi.stubGlobal('fetch', mockFetch);

import {
  discoverLocalBrowserTargets,
  parseListeningPorts,
} from './local-dev-targets';

beforeEach(() => {
  vi.clearAllMocks();
});

function createResponse(
  status: number,
  options?: {
    contentType?: string;
    server?: string;
    body?: string;
  },
): {
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
} {
  const contentType = options?.contentType ?? 'text/html; charset=utf-8';
  const server = options?.server ?? '';
  const body = options?.body ?? '<!DOCTYPE html><html><head><title>Local App</title></head></html>';
  return {
    status,
    headers: {
      get(name: string) {
        if (name === 'content-type') return contentType;
        if (name === 'server') return server;
        return null;
      },
    },
    async text() {
      return body;
    },
  };
}

describe('parseListeningPorts', () => {
  it('parses listening ports from lsof output', () => {
    const output = [
      'node 123 user 23u IPv6 0x01 TCP *:5173 (LISTEN)',
      'ruby 456 user 18u IPv4 0x02 TCP 127.0.0.1:3000 (LISTEN)',
    ].join('\n');

    expect(parseListeningPorts(output, 'darwin')).toEqual([3000, 5173]);
  });

  it('parses listening ports from netstat output on Windows', () => {
    const output = [
      '  TCP    0.0.0.0:3000    0.0.0.0:0    LISTENING    1200',
      '  TCP    127.0.0.1:8787  0.0.0.0:0    LISTENING    1201',
    ].join('\n');

    expect(parseListeningPorts(output, 'win32')).toEqual([3000, 8787]);
  });
});

describe('discoverLocalBrowserTargets', () => {
  it('returns only localhost targets that look like browser surfaces', async () => {
    const listeningOutput = process.platform === 'win32'
      ? [
          '  TCP    0.0.0.0:5173    0.0.0.0:0    LISTENING    123',
          '  TCP    127.0.0.1:5432  0.0.0.0:0    LISTENING    456',
          '  TCP    127.0.0.1:5000  0.0.0.0:0    LISTENING    789',
        ].join('\n')
      : [
          'node 123 user 23u IPv6 0x01 TCP *:5173 (LISTEN)',
          'postgres 456 user 18u IPv4 0x02 TCP 127.0.0.1:5432 (LISTEN)',
          'ControlCe 789 user 18u IPv4 0x03 TCP 127.0.0.1:5000 (LISTEN)',
        ].join('\n');

    mockExecFile.mockImplementation((_cmd, _args, _opts, cb) => {
      cb(null, listeningOutput, '');
    });
    mockFetch.mockImplementation(async (url: string) => {
      if (url === 'http://localhost:5173/') {
        return createResponse(200, {
          body: '<!DOCTYPE html><html><head><title>Vite App</title></head></html>',
        });
      }
      if (url === 'http://localhost:5000/') {
        return createResponse(403, { server: 'AirTunes/940.23.1', body: '' });
      }
      throw new Error('connection refused');
    });

    const result = await discoverLocalBrowserTargets();

    expect(result).toEqual([
      { url: 'http://localhost:5173/', label: 'localhost:5173', meta: 'Vite App' },
    ]);
  });

  it('excludes Electron-owned internal browser control pages', async () => {
    mockExecFile.mockImplementation((_cmd, _args, _opts, cb) => {
      cb(null, 'Electron 1255 user 69u IPv4 0x01 TCP 127.0.0.1:60732 (LISTEN)\n', '');
    });
    mockFetch.mockResolvedValue(
      createResponse(200, {
        body: '<!DOCTYPE html><html><head><title>Browser</title></head><body>Antigravity Browser Control</body></html>',
      }),
    );

    const result = await discoverLocalBrowserTargets();

    expect(result).toEqual([]);
  });

  it('keeps redirecting localhost apps because they still open in the browser', async () => {
    const listeningOutput = process.platform === 'win32'
      ? '  TCP    0.0.0.0:3000    0.0.0.0:0    LISTENING    123\n'
      : 'node 123 user 23u IPv6 0x01 TCP *:3000 (LISTEN)\n';

    mockExecFile.mockImplementation((_cmd, _args, _opts, cb) => {
      cb(null, listeningOutput, '');
    });
    mockFetch.mockResolvedValue(
      createResponse(302, {
        contentType: 'text/plain',
        body: '',
      }),
    );

    const result = await discoverLocalBrowserTargets();

    expect(result).toEqual([
      { url: 'http://localhost:3000/', label: 'localhost:3000', meta: 'Open in browser' },
    ]);
  });

  it('returns an empty list when no listening HTTP targets are detected', async () => {
    mockExecFile.mockImplementation((_cmd, _args, _opts, cb) => {
      cb(null, '', '');
    });

    const result = await discoverLocalBrowserTargets();

    expect(result).toEqual([]);
  });
});
