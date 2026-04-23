import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

export function runDetectChanges({
  repoRoot,
  baseRef,
  spawn = spawnSync,
  env = process.env,
  command = 'code-review-graph',
}) {
  const result = spawn(
    command,
    ['detect-changes', '--repo', repoRoot, '--base', baseRef],
    { encoding: 'utf8', shell: false, env }
  );

  if (result.error) {
    if (result.error.code === 'ENOENT') return { kind: 'missing' };
    throw new Error(`[graph-gap-audit] failed to execute ${command}: ${result.error.message}`);
  }

  if ((result.status ?? 1) !== 0) {
    const stderr = (result.stderr ?? '').trim();
    const stdout = (result.stdout ?? '').trim();
    const diagnostics = [stderr, stdout].filter(Boolean).join('\n');
    throw new Error(`[graph-gap-audit] detect-changes failed\n${diagnostics}`.trim());
  }

  const output = (result.stdout ?? '').trim();
  if (!output || output.includes('No changes detected.')) return { kind: 'none' };

  const jsonStart = output.indexOf('{');
  const jsonEnd = output.lastIndexOf('}');
  if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
    throw new Error('[graph-gap-audit] Unable to parse detect-changes output as JSON');
  }

  try {
    return { kind: 'ok', data: JSON.parse(output.slice(jsonStart, jsonEnd + 1)) };
  } catch (error) {
    throw new Error(
      `[graph-gap-audit] JSON parse error: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export function walkFiles(dir, predicate, bucket = []) {
  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      walkFiles(fullPath, predicate, bucket);
      continue;
    }
    if (predicate(fullPath)) bucket.push(fullPath);
  }
  return bucket;
}

export function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function lineTextAt(filePath, lineNumber, lineCache, deps = { existsSync, readFileSync }) {
  if (!deps.existsSync(filePath)) return '';
  if (!lineCache.has(filePath)) {
    lineCache.set(filePath, deps.readFileSync(filePath, 'utf8').split('\n'));
  }
  const lines = lineCache.get(filePath);
  return (lines[lineNumber - 1] ?? '').trim();
}

export function appearsInTestContent(functionName, sourceFilePath, testContents) {
  const stem = path.basename(sourceFilePath).replace(/\.[^.]+$/, '');
  const matcher = new RegExp(`\\b${escapeRegExp(functionName)}\\b`);
  return testContents.some(({ content }) => matcher.test(content) && content.includes(stem));
}
