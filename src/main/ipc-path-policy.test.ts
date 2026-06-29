import path from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockLoadState = vi.hoisted(() => vi.fn());
const mockHomedir = vi.hoisted(() => vi.fn(() => '/home/test'));

vi.mock('./store', () => ({
  loadState: mockLoadState,
}));

vi.mock('os', () => ({
  homedir: mockHomedir,
}));

vi.mock('./platform', () => ({
  isMac: false,
  isWin: false,
}));

import {
  getActiveProjectPath,
  isAllowedDirectoryLookupPath,
  isAllowedReadPath,
  isWithinKnownProject,
  requireKnownProjectPath,
} from './ipc-path-policy';

describe('ipc path policy helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadState.mockReturnValue({
      activeProjectId: 'p1',
      projects: [
        { id: 'p1', path: '/repo/main' },
        { id: 'p2', path: '/repo/secondary' },
      ],
    });
  });

  it('detects known project paths and resolves active project path', () => {
    expect(isWithinKnownProject('/repo/main')).toBe(true);
    expect(isWithinKnownProject('/repo/main/src/index.ts')).toBe(true);
    expect(isWithinKnownProject('/repo/unknown')).toBe(false);
    expect(getActiveProjectPath()).toBe('/repo/main');
  });

  it('enforces known project path requirement', () => {
    expect(requireKnownProjectPath('/repo/main/src', 'Test op')).toBe(path.resolve('/repo/main/src'));
    expect(() => requireKnownProjectPath('/repo/elsewhere', 'Test op')).toThrow(
      'Test op requires a known project path',
    );
  });

  it('allows read paths for project files and known config locations', () => {
    expect(isAllowedReadPath('/repo/main/README.md')).toBe(true);
    expect(isAllowedReadPath('/home/test/.claude/settings.json')).toBe(true);
    expect(isAllowedReadPath('/home/test/.codex/config.toml')).toBe(true);
    expect(isAllowedReadPath('/home/test/.gemini/settings.json')).toBe(true);
    expect(isAllowedReadPath('/home/test/.mcp.json')).toBe(true);
    expect(isAllowedReadPath('/etc/claude-code/settings.json')).toBe(true);
    expect(isAllowedReadPath('/home/test/.claude.json.bak')).toBe(false);
    expect(isAllowedReadPath('/home/test/.mcp.json.old')).toBe(false);
    expect(isAllowedReadPath('/tmp/unknown.txt')).toBe(false);
  });

  it('allows directory lookup under home and Linux mount roots', () => {
    expect(isAllowedDirectoryLookupPath('/home/test/projects')).toBe(true);
    expect(isAllowedDirectoryLookupPath('/mnt/data')).toBe(true);
    expect(isAllowedDirectoryLookupPath('/media/usb')).toBe(true);
    expect(isAllowedDirectoryLookupPath('/opt/random')).toBe(false);
  });
});
