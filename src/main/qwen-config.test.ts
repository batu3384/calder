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
import { findQwenTranscriptPath, getQwenConfig } from './qwen-config';

const n = (p: string) => p.replace(/\\/g, '/');

const mockReadFileSync = vi.mocked(fs.readFileSync);
const mockReaddirSync = vi.mocked(fs.readdirSync);
const mockStatSync = vi.mocked(fs.statSync);

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  mockReadFileSync.mockImplementation(() => { throw new Error('ENOENT'); });
  mockReaddirSync.mockImplementation(() => { throw new Error('ENOENT'); });
  mockStatSync.mockImplementation(() => { throw new Error('ENOENT'); });
});

describe('getQwenConfig', () => {
  it('returns empty config when no qwen files exist', async () => {
    await expect(getQwenConfig('/project')).resolves.toEqual({
      mcpServers: [],
      agents: [],
      skills: [],
      commands: [],
    });
  });

  it('reads MCP servers from user and project settings with project override', async () => {
    mockReadFileSync.mockImplementation((inputPath) => {
      const filePath = n(String(inputPath));
      if (filePath === '/mock/home/.qwen/settings.json') {
        return JSON.stringify({
          mcpServers: {
            shared: { command: 'user-command' },
            userOnly: { url: 'http://user' },
          },
        }) as any;
      }
      if (filePath === '/project/.qwen/settings.json') {
        return JSON.stringify({
          mcpServers: {
            shared: { url: 'http://project' },
          },
        }) as any;
      }
      throw new Error('ENOENT');
    });

    const config = await getQwenConfig('/project');
    expect(config.mcpServers).toEqual([
      { name: 'shared', url: 'http://project', status: 'configured', scope: 'project', filePath: path.join('/project', '.qwen', 'settings.json') },
      { name: 'userOnly', url: 'http://user', status: 'configured', scope: 'user', filePath: path.join('/mock/home', '.qwen', 'settings.json') },
    ]);
  });

  it('reads agents, skills, and commands from user and project directories', async () => {
    mockReaddirSync.mockImplementation((inputPath) => {
      const dirPath = n(String(inputPath));
      if (dirPath === '/mock/home/.qwen/agents') return ['user-agent.md'] as any;
      if (dirPath === '/project/.qwen/agents') return ['project-agent.md'] as any;
      if (dirPath === '/mock/home/.qwen/skills') return ['user-skill'] as any;
      if (dirPath === '/project/.qwen/skills') return ['project-skill'] as any;
      if (dirPath === '/mock/home/.qwen/commands') return ['user-command.md'] as any;
      if (dirPath === '/project/.qwen/commands') return ['project-command.md'] as any;
      throw new Error('ENOENT');
    });

    mockReadFileSync.mockImplementation((inputPath) => {
      const filePath = n(String(inputPath));
      if (filePath === '/mock/home/.qwen/agents/user-agent.md') return '---\nname: UserAgent\nmodel: qwen-max\n---\n' as any;
      if (filePath === '/project/.qwen/agents/project-agent.md') return '---\nname: ProjectAgent\nmodel: qwen-coder\n---\n' as any;
      if (filePath === '/mock/home/.qwen/skills/user-skill/SKILL.md') return '---\nname: UserSkill\ndescription: Useful\n---\n' as any;
      if (filePath === '/project/.qwen/skills/project-skill/SKILL.md') return '---\nname: ProjectSkill\ndescription: Project only\n---\n' as any;
      if (filePath === '/mock/home/.qwen/commands/user-command.md') return '---\ndescription: User command\n---\n' as any;
      if (filePath === '/project/.qwen/commands/project-command.md') return '---\ndescription: Project command\n---\n' as any;
      throw new Error('ENOENT');
    });

    mockStatSync.mockImplementation((inputPath) => {
      const filePath = n(String(inputPath));
      if (filePath.endsWith('/SKILL.md')) {
        return { isFile: () => true } as any;
      }
      throw new Error('ENOENT');
    });

    const config = await getQwenConfig('/project');
    expect(config.agents).toEqual([
      { name: 'UserAgent', model: 'qwen-max', category: 'plugin', scope: 'user', filePath: path.join('/mock/home', '.qwen', 'agents', 'user-agent.md') },
      { name: 'ProjectAgent', model: 'qwen-coder', category: 'plugin', scope: 'project', filePath: path.join('/project', '.qwen', 'agents', 'project-agent.md') },
    ]);
    expect(config.skills).toEqual([
      { name: 'UserSkill', description: 'Useful', scope: 'user', filePath: path.join('/mock/home', '.qwen', 'skills', 'user-skill', 'SKILL.md') },
      { name: 'ProjectSkill', description: 'Project only', scope: 'project', filePath: path.join('/project', '.qwen', 'skills', 'project-skill', 'SKILL.md') },
    ]);
    expect(config.commands).toEqual([
      { name: 'user-command', description: 'User command', scope: 'user', filePath: path.join('/mock/home', '.qwen', 'commands', 'user-command.md') },
      { name: 'project-command', description: 'Project command', scope: 'project', filePath: path.join('/project', '.qwen', 'commands', 'project-command.md') },
    ]);
  });
});

describe('findQwenTranscriptPath', () => {
  it('prefers QWEN_RUNTIME_DIR when searching for transcripts', () => {
    vi.stubEnv('QWEN_RUNTIME_DIR', '/runtime/qwen');

    try {
      mockReaddirSync.mockImplementation((inputPath) => {
        const dirPath = n(String(inputPath));
        if (dirPath === '/runtime/qwen/projects') return ['project-a'] as any;
        if (dirPath === '/runtime/qwen/projects/project-a/chats') return ['sid-1.jsonl'] as any;
        throw new Error('ENOENT');
      });
      mockStatSync.mockImplementation((inputPath) => {
        const filePath = n(String(inputPath));
        if (filePath === '/runtime/qwen/projects/project-a') return { isDirectory: () => true, mtimeMs: 10 } as any;
        if (filePath === '/runtime/qwen/projects/project-a/chats') return { isDirectory: () => true, mtimeMs: 10 } as any;
        if (filePath === '/runtime/qwen/projects/project-a/chats/sid-1.jsonl') return { isFile: () => true, mtimeMs: 20 } as any;
        throw new Error('ENOENT');
      });

      expect(findQwenTranscriptPath('sid-1', '/project')).toBe(
        path.join('/runtime/qwen', 'projects', 'project-a', 'chats', 'sid-1.jsonl'),
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('falls back to advanced.runtimeOutputDir from settings when env is absent', () => {
    mockReadFileSync.mockImplementation((inputPath) => {
      const filePath = n(String(inputPath));
      if (filePath === '/mock/home/.qwen/settings.json') {
        return JSON.stringify({ advanced: { runtimeOutputDir: '/custom/runtime' } }) as any;
      }
      throw new Error('ENOENT');
    });
    mockReaddirSync.mockImplementation((inputPath) => {
      const dirPath = n(String(inputPath));
      if (dirPath === '/custom/runtime/projects') return ['project-b'] as any;
      if (dirPath === '/custom/runtime/projects/project-b/chats') return ['sid-2.jsonl'] as any;
      throw new Error('ENOENT');
    });
    mockStatSync.mockImplementation((inputPath) => {
      const filePath = n(String(inputPath));
      if (filePath === '/custom/runtime/projects/project-b') return { isDirectory: () => true, mtimeMs: 10 } as any;
      if (filePath === '/custom/runtime/projects/project-b/chats') return { isDirectory: () => true, mtimeMs: 10 } as any;
      if (filePath === '/custom/runtime/projects/project-b/chats/sid-2.jsonl') return { isFile: () => true, mtimeMs: 30 } as any;
      throw new Error('ENOENT');
    });

    expect(findQwenTranscriptPath('sid-2', '/project')).toBe(
      path.join('/custom/runtime', 'projects', 'project-b', 'chats', 'sid-2.jsonl'),
    );
  });

  it('returns null when no matching transcript exists', () => {
    expect(findQwenTranscriptPath('missing', '/project')).toBeNull();
  });
});
