import { execFile } from 'node:child_process';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { promisify } from 'node:util';

import type { GitFileEntry } from '../../shared/types/project-core.js';
import {
  type EvidenceConfidence,
  type GitComparisonResult,
  type GitFingerprintSnapshot,
  type GitObservation,
  type GitPathFingerprint,
  MAX_FINGERPRINT_FILE_BYTES,
  MAX_FINGERPRINT_PATHS,
} from '../../shared/types-evidence.js';
import { getGitFiles, getGitStatus } from '../git-status.js';

const execFileAsync = promisify(execFile);

async function getHeadCommit(cwd: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd, timeout: 5000 });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

async function getIndexOid(cwd: string, filePath: string): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync('git', ['ls-files', '-s', '--', filePath], {
      cwd,
      timeout: 5000,
    });
    const line = stdout.trim().split('\n')[0];
    if (!line) return undefined;
    const parts = line.split(/\s+/);
    return parts[1];
  } catch {
    return undefined;
  }
}

async function hashWorktreeFile(fullPath: string): Promise<string | undefined> {
  try {
    const stat = fs.lstatSync(fullPath);
    if (!stat.isFile()) return `size:${stat.size}`;
    if (stat.size > MAX_FINGERPRINT_FILE_BYTES) return `size:${stat.size}`;
    const content = fs.readFileSync(fullPath);
    return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
  } catch {
    return undefined;
  }
}

function dedupeEntries(entries: GitFileEntry[]): GitFileEntry[] {
  const seen = new Set<string>();
  const result: GitFileEntry[] = [];
  for (const entry of entries) {
    const key = `${entry.area}:${entry.path}:${entry.status}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(entry);
  }
  return result;
}

const SENSITIVE_BASENAME_PATTERN =
  /(^|\/)(\.env(\..*)?|.*\.(pem|key|p12|pfx|keystore)|id_rsa|id_ed25519|credentials.*)$/i;

async function fingerprintEntry(cwd: string, entry: GitFileEntry): Promise<GitPathFingerprint> {
  const fullPath = path.join(cwd, entry.path);
  const fingerprint: GitPathFingerprint = {
    path: entry.path,
    area: entry.area,
    status: entry.status,
  };

  const contentSensitive = SENSITIVE_BASENAME_PATTERN.test(entry.path);

  if (entry.area !== 'untracked') {
    fingerprint.indexOid = await getIndexOid(cwd, entry.path);
  }

  if (entry.area === 'untracked' || entry.area === 'working') {
    try {
      const stat = fs.lstatSync(fullPath);
      fingerprint.sizeBytes = stat.size;
      if (contentSensitive) {
        // Never read likely-secret file contents (e.g. .env); size alone tracks change.
        fingerprint.worktreeFingerprint = `size:${stat.size}`;
      } else if (stat.isFile() && stat.size <= MAX_FINGERPRINT_FILE_BYTES) {
        fingerprint.worktreeFingerprint = await hashWorktreeFile(fullPath);
      } else if (stat.isFile()) {
        fingerprint.worktreeFingerprint = `size:${stat.size}`;
        fingerprint.fingerprintUnavailable = stat.size > MAX_FINGERPRINT_FILE_BYTES;
      }
    } catch {
      fingerprint.fingerprintUnavailable = true;
    }
  }

  if (!fingerprint.worktreeFingerprint && !fingerprint.indexOid) {
    fingerprint.fingerprintUnavailable = true;
  }

  return fingerprint;
}

export async function captureGitFingerprintBaseline(cwd: string): Promise<GitFingerprintSnapshot> {
  const [status, files, headCommit] = await Promise.all([
    getGitStatus(cwd),
    getGitFiles(cwd),
    getHeadCommit(cwd),
  ]);

  if (!status.isGitRepo) {
    return {
      capturedAt: new Date().toISOString(),
      isGitRepo: false,
      branch: null,
      headCommit: null,
      paths: [],
      truncated: false,
    };
  }

  const relevant = dedupeEntries(files).slice(0, MAX_FINGERPRINT_PATHS);
  const truncated = files.length > MAX_FINGERPRINT_PATHS;
  const paths: GitPathFingerprint[] = [];
  for (const entry of relevant) {
    paths.push(await fingerprintEntry(cwd, entry));
  }

  return {
    capturedAt: new Date().toISOString(),
    isGitRepo: true,
    branch: status.branch,
    headCommit,
    paths,
    truncated,
  };
}

function pathMap(snapshot: GitFingerprintSnapshot): Map<string, GitPathFingerprint> {
  const map = new Map<string, GitPathFingerprint>();
  for (const entry of snapshot.paths) {
    map.set(`${entry.area}:${entry.path}`, entry);
  }
  return map;
}

function detectRenames(
  removed: GitPathFingerprint[],
  added: GitPathFingerprint[],
): Array<{ from: GitPathFingerprint; to: GitPathFingerprint; confidence: EvidenceConfidence }> {
  const pairs: Array<{
    from: GitPathFingerprint;
    to: GitPathFingerprint;
    confidence: EvidenceConfidence;
  }> = [];
  const usedAdded = new Set<string>();

  for (const from of removed) {
    const fromFp = from.worktreeFingerprint ?? from.indexOid;
    if (!fromFp) continue;
    for (const to of added) {
      if (usedAdded.has(to.path)) continue;
      const toFp = to.worktreeFingerprint ?? to.indexOid;
      if (toFp && toFp === fromFp) {
        pairs.push({ from, to, confidence: 'inferred' });
        usedAdded.add(to.path);
        break;
      }
    }
  }

  return pairs;
}

export function compareGitFingerprints(
  baseline: GitFingerprintSnapshot,
  final: GitFingerprintSnapshot,
): GitComparisonResult {
  const observations: GitObservation[] = [];
  const baselineMap = pathMap(baseline);
  const finalMap = pathMap(final);
  const headMoved = baseline.headCommit !== final.headCommit;
  const branchChanged = baseline.branch !== final.branch;

  if (!baseline.isGitRepo || !final.isGitRepo) {
    observations.push({
      path: '.',
      category: 'unavailable',
      confidence: 'unavailable',
      metadata: { reason: 'not_a_git_repo' },
    });
    return {
      observations,
      truncated: baseline.truncated || final.truncated,
      headMoved,
      branchChanged,
    };
  }

  if (headMoved) {
    observations.push({
      path: '.',
      category: 'head_moved',
      confidence: 'verified',
      metadata: { from: baseline.headCommit, to: final.headCommit },
    });
  }

  const removed: GitPathFingerprint[] = [];
  const added: GitPathFingerprint[] = [];

  for (const [key, baseEntry] of baselineMap) {
    const finalEntry = finalMap.get(key);
    if (!finalEntry) {
      removed.push(baseEntry);
      continue;
    }

    const sameFingerprint =
      baseEntry.worktreeFingerprint === finalEntry.worktreeFingerprint &&
      baseEntry.indexOid === finalEntry.indexOid;

    if (sameFingerprint) {
      observations.push({
        path: baseEntry.path,
        category: 'dirty_at_start_unchanged',
        confidence: 'verified',
      });
      continue;
    }

    observations.push({
      path: baseEntry.path,
      category: 'dirty_at_start_changed_further_during_window',
      confidence: 'verified',
      metadata: {
        baselineFingerprint: baseEntry.worktreeFingerprint ?? baseEntry.indexOid,
        finalFingerprint: finalEntry.worktreeFingerprint ?? finalEntry.indexOid,
      },
    });
  }

  for (const [key, finalEntry] of finalMap) {
    if (!baselineMap.has(key)) {
      added.push(finalEntry);
      if (finalEntry.area === 'untracked') {
        observations.push({
          path: finalEntry.path,
          category: 'untracked_added',
          confidence: 'verified',
        });
      } else {
        observations.push({
          path: finalEntry.path,
          category: 'clean_at_start_dirty_at_end',
          confidence: 'verified',
        });
      }
    }
  }

  for (const entry of removed) {
    if (entry.status === 'deleted') {
      observations.push({
        path: entry.path,
        category: 'deleted_during_window',
        confidence: 'inferred',
      });
    }
  }

  for (const rename of detectRenames(removed, added)) {
    observations.push({
      path: rename.to.path,
      category: 'renamed',
      confidence: rename.confidence,
      previousPath: rename.from.path,
    });
  }

  for (const entry of added) {
    if (observations.some((obs) => obs.path === entry.path && obs.category === 'renamed')) {
      continue;
    }
    if (entry.status === 'added') {
      observations.push({
        path: entry.path,
        category: 'added_during_window',
        confidence: 'inferred',
      });
    } else if (entry.status === 'modified') {
      observations.push({
        path: entry.path,
        category: 'modified_during_window',
        confidence: 'inferred',
      });
    }
  }

  return {
    observations,
    truncated: baseline.truncated || final.truncated,
    headMoved,
    branchChanged,
  };
}
