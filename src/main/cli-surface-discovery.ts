import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import type {
  CliSurfaceDiscoveryCandidate,
  CliSurfaceDiscoveryConfidence,
  CliSurfaceDiscoveryResult,
} from '../shared/types';

const NODE_SCRIPT_ORDER = ['dev:tui', 'dev:cli', 'tui', 'cli', 'dev', 'start'] as const;

function makeCandidate(
  id: string,
  command: string,
  args: string[] | undefined,
  cwd: string,
  source: string,
  reason: string,
  confidence: CliSurfaceDiscoveryConfidence,
): CliSurfaceDiscoveryCandidate {
  return { id, command, ...(args ? { args } : {}), cwd, source, reason, confidence };
}

function detectPackageManager(projectPath: string): 'npm' | 'pnpm' | 'yarn' {
  if (existsSync(join(projectPath, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(join(projectPath, 'yarn.lock'))) return 'yarn';
  return 'npm';
}

function discoverNodeCandidates(projectPath: string): CliSurfaceDiscoveryCandidate[] {
  const packageJsonPath = join(projectPath, 'package.json');
  if (!existsSync(packageJsonPath)) return [];

  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as { scripts?: Record<string, string> };
  const scripts = packageJson.scripts ?? {};
  const packageManager = detectPackageManager(projectPath);

  return NODE_SCRIPT_ORDER
    .filter((name) => typeof scripts[name] === 'string')
    .map((name) =>
      makeCandidate(
        `node:${name}`,
        packageManager,
        packageManager === 'yarn' ? [name] : ['run', name],
        projectPath,
        `package.json:scripts.${name}`,
        `Found ${name} in package.json scripts`,
        name === 'dev:tui' ? 'high' : 'medium',
      ),
    );
}

function discoverPythonCandidates(projectPath: string): CliSurfaceDiscoveryCandidate[] {
  const appPyPath = join(projectPath, 'app.py');
  if (!existsSync(appPyPath)) return [];

  const contents = readFileSync(appPyPath, 'utf8');
  if (!contents.includes('textual.app')) return [];

  return [
    makeCandidate(
      'python:textual-app',
      'python',
      ['app.py'],
      projectPath,
      'python:textual-app',
      'Detected a Textual application entry file',
      'high',
    ),
  ];
}

function discoverRustCandidates(projectPath: string): CliSurfaceDiscoveryCandidate[] {
  if (!existsSync(join(projectPath, 'Cargo.toml'))) return [];
  if (!existsSync(join(projectPath, 'src', 'main.rs'))) return [];

  return [
    makeCandidate(
      'cargo:main-bin',
      'cargo',
      ['run'],
      projectPath,
      'cargo:main-bin',
      'Detected Cargo main binary',
      'high',
    ),
  ];
}

function discoverGoCandidates(projectPath: string): CliSurfaceDiscoveryCandidate[] {
  if (!existsSync(join(projectPath, 'go.mod'))) return [];

  const cmdDir = join(projectPath, 'cmd');
  if (!existsSync(cmdDir)) {
    return [
      makeCandidate(
        'go:module-root',
        'go',
        ['run', '.'],
        projectPath,
        'go:module-root',
        'Detected go.mod at project root',
        'medium',
      ),
    ];
  }

  const cmdEntries = readdirSync(cmdDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(cmdDir, entry.name, 'main.go')))
    .sort((left, right) => left.name.localeCompare(right.name));

  if (cmdEntries.length === 0) return [];

  if (cmdEntries.length === 1) {
    const [cmdEntry] = cmdEntries;
    return [
      makeCandidate(
        `go:cmd:${cmdEntry.name}`,
        'go',
        ['run', `./cmd/${cmdEntry.name}`],
        projectPath,
        'go:cmd-entry',
        `Detected cmd/${cmdEntry.name} as the primary Go entrypoint`,
        'high',
      ),
    ];
  }

  return cmdEntries.map((cmdEntry) =>
    makeCandidate(
      `go:cmd:${cmdEntry.name}`,
      'go',
      ['run', `./cmd/${cmdEntry.name}`],
      projectPath,
      'go:cmd-entry',
      `Detected cmd/${cmdEntry.name} as a runnable Go entrypoint`,
      'medium',
    ),
  );
}

export async function discoverCliSurface(projectPath: string): Promise<CliSurfaceDiscoveryResult> {
  const candidates = [
    ...discoverNodeCandidates(projectPath),
    ...discoverPythonCandidates(projectPath),
    ...discoverRustCandidates(projectPath),
    ...discoverGoCandidates(projectPath),
  ];

  if (candidates.length === 0) {
    return { confidence: 'low', candidates: [] };
  }

  if (candidates.length === 1 && candidates[0].confidence === 'high') {
    return { confidence: 'high', candidates };
  }

  return { confidence: 'medium', candidates };
}
