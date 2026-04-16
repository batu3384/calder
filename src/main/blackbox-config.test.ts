import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('fs', () => ({
  readFileSync: vi.fn(),
  readdirSync: vi.fn(),
  statSync: vi.fn(),
}));

vi.mock('os', () => ({
  homedir: () => '/mock/home',
}));

import * as fs from 'fs';
import * as path from 'path';
import { findBlackboxTranscriptPath, getBlackboxConfig } from './blackbox-config';

const n = (p: string) => p.replace(/\\/g, '/');

const mockReadFileSync = vi.mocked(fs.readFileSync);
const mockReaddirSync = vi.mocked(fs.readdirSync);
const mockStatSync = vi.mocked(fs.statSync);

beforeEach(() => {
  vi.clearAllMocks();
  mockReadFileSync.mockImplementation(() => { throw new Error('ENOENT'); });
  mockReaddirSync.mockImplementation(() => { throw new Error('ENOENT'); });
  mockStatSync.mockImplementation(() => { throw new Error('ENOENT'); });
});

describe('getBlackboxConfig', () => {
  it('returns empty config when no settings files exist', async () => {
    await expect(getBlackboxConfig('/project')).resolves.toEqual({
      mcpServers: [],
      agents: [],
      skills: [],
      commands: [],
    });
  });

  it('reads mcpServers from user and project settings with project override', async () => {
    mockReadFileSync.mockImplementation((inputPath) => {
      const filePath = n(String(inputPath));
      if (filePath === '/mock/home/.blackboxcli/settings.json') {
        return JSON.stringify({
          mcpServers: {
            shared: { command: 'docker-user' },
            github: { url: 'http://user' },
          },
        }) as any;
      }
      if (filePath === '/project/.blackboxcli/settings.json') {
        return JSON.stringify({
          mcpServers: {
            shared: { command: 'docker-project' },
          },
        }) as any;
      }
      throw new Error('ENOENT');
    });

    const config = await getBlackboxConfig('/project');
    expect(config.mcpServers).toEqual([
      { name: 'shared', url: 'docker-project', status: 'configured', scope: 'project', filePath: path.join('/project', '.blackboxcli', 'settings.json') },
      { name: 'github', url: 'http://user', status: 'configured', scope: 'user', filePath: path.join('/mock/home', '.blackboxcli', 'settings.json') },
    ]);
  });

  it('reads skills from user and project directories', async () => {
    mockReadFileSync.mockImplementation((inputPath) => {
      const filePath = n(String(inputPath));
      if (filePath === '/mock/home/.blackboxcli/skills/ui-ux-pro-max/SKILL.md') {
        return '---\nname: ui-ux-pro-max\ndescription: User skill\n---\n' as any;
      }
      if (filePath === '/project/.blackboxcli/skills/local/SKILL.md') {
        return '---\nname: local\ndescription: Project skill\n---\n' as any;
      }
      throw new Error('ENOENT');
    });
    mockReaddirSync.mockImplementation((inputPath) => {
      const dirPath = n(String(inputPath));
      if (dirPath === '/mock/home/.blackboxcli/skills') return ['ui-ux-pro-max'] as any;
      if (dirPath === '/project/.blackboxcli/skills') return ['local'] as any;
      throw new Error('ENOENT');
    });
    mockStatSync.mockImplementation((inputPath) => {
      const filePath = n(String(inputPath));
      if (
        filePath === '/mock/home/.blackboxcli/skills/ui-ux-pro-max/SKILL.md'
        || filePath === '/project/.blackboxcli/skills/local/SKILL.md'
      ) {
        return { isFile: () => true } as any;
      }
      throw new Error('ENOENT');
    });

    const config = await getBlackboxConfig('/project');
    expect(config.skills).toEqual([
      {
        name: 'ui-ux-pro-max',
        description: 'User skill',
        scope: 'user',
        filePath: path.join('/mock/home', '.blackboxcli', 'skills', 'ui-ux-pro-max', 'SKILL.md'),
      },
      {
        name: 'local',
        description: 'Project skill',
        scope: 'project',
        filePath: path.join('/project', '.blackboxcli', 'skills', 'local', 'SKILL.md'),
      },
    ]);
  });
});

describe('findBlackboxTranscriptPath', () => {
  it('prefers checkpoint transcripts over secure session blobs', () => {
    mockReaddirSync.mockImplementation((inputPath) => {
      const dirPath = n(String(inputPath));
      if (dirPath === '/mock/home/.blackboxcli/tmp') return ['proj-a'] as any;
      if (dirPath === '/mock/home/.blackboxcli/tmp/proj-a') return ['checkpoint-session-sid-1.json'] as any;
      if (dirPath === '/mock/home/.blackboxcli/sessions') return ['blackbox_secure_session_sid-1.json'] as any;
      throw new Error('ENOENT');
    });
    mockStatSync.mockImplementation((inputPath) => {
      const filePath = n(String(inputPath));
      if (filePath === '/mock/home/.blackboxcli/tmp/proj-a') return { isDirectory: () => true, mtimeMs: 10 } as any;
      if (filePath === '/mock/home/.blackboxcli/tmp/proj-a/checkpoint-session-sid-1.json') return { isFile: () => true, mtimeMs: 20 } as any;
      if (filePath === '/mock/home/.blackboxcli/sessions/blackbox_secure_session_sid-1.json') return { isFile: () => true, mtimeMs: 5 } as any;
      throw new Error('ENOENT');
    });

    expect(findBlackboxTranscriptPath('sid-1', '/project')).toBe('/mock/home/.blackboxcli/tmp/proj-a/checkpoint-session-sid-1.json');
  });

  it('falls back to the secure session file when no checkpoint exists', () => {
    mockReaddirSync.mockImplementation((inputPath) => {
      const dirPath = n(String(inputPath));
      if (dirPath === '/mock/home/.blackboxcli/tmp') return [] as any;
      if (dirPath === '/mock/home/.blackboxcli/sessions') return ['blackbox_secure_session_sid-2.json'] as any;
      throw new Error('ENOENT');
    });
    mockStatSync.mockImplementation((inputPath) => {
      const filePath = n(String(inputPath));
      if (filePath === '/mock/home/.blackboxcli/sessions/blackbox_secure_session_sid-2.json') return { isFile: () => true, mtimeMs: 50 } as any;
      throw new Error('ENOENT');
    });

    expect(findBlackboxTranscriptPath('sid-2', '/project')).toBe('/mock/home/.blackboxcli/sessions/blackbox_secure_session_sid-2.json');
  });
});
