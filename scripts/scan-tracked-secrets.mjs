#!/usr/bin/env node

import { execSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const SENSITIVE_PATTERNS = [
  { name: 'openai-api-key', pattern: /sk-[a-zA-Z0-9]{20,}/ },
  { name: 'anthropic-api-key', pattern: /sk-ant-[a-zA-Z0-9-]{20,}/i },
  { name: 'google-api-key', pattern: /AIza[a-zA-Z0-9_-]{30,}/ },
  { name: 'github-pat', pattern: /ghp_[a-zA-Z0-9]{36}/i },
  { name: 'github-oauth', pattern: /gho_[a-zA-Z0-9]{36}/i },
  { name: 'aws-access-key', pattern: /AKIA[A-Z0-9]{16}/ },
  { name: 'pem-private-key', pattern: /-----BEGIN (?:RSA |OPENSSH )?PRIVATE KEY-----/ },
  { name: 'jwt-bearer', pattern: /Bearer\s+[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/ },
];

const BLOCKED_FILE_NAMES = new Set([
  '.env',
  '.env.local',
  '.env.production',
  'credentials.json',
  'secrets.json',
  'tokens.json',
]);

const ALLOWLIST_PATH_FRAGMENTS = [
  'src/main/security/secrets-audit.ts',
  'scripts/scan-tracked-secrets.mjs',
  'docs/reports/security/',
];

const SKIPPABLE_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.icns',
  '.ico',
  '.zip',
  '.dmg',
  '.AppImage',
  '.woff',
  '.woff2',
]);

function isAllowlisted(filePath) {
  return ALLOWLIST_PATH_FRAGMENTS.some((fragment) => filePath.includes(fragment));
}

function listTrackedFiles() {
  const output = execSync('git ls-files -z', { encoding: 'utf8' });
  return output.split('\u0000').filter(Boolean);
}

function scanFile(filePath) {
  const findings = [];
  const fileName = path.basename(filePath);

  if (BLOCKED_FILE_NAMES.has(fileName)) {
    findings.push(`blocked filename: ${filePath}`);
    return findings;
  }

  const ext = path.extname(filePath).toLowerCase();
  if (SKIPPABLE_EXTENSIONS.has(ext)) {
    return findings;
  }

  let stat;
  try {
    stat = statSync(filePath);
  } catch {
    return findings;
  }

  if (!stat.isFile() || stat.size > 2 * 1024 * 1024) {
    return findings;
  }

  let content;
  try {
    content = readFileSync(filePath, 'utf8');
  } catch {
    return findings;
  }

  if (content.includes('\u0000')) {
    return findings;
  }

  for (const { name, pattern } of SENSITIVE_PATTERNS) {
    if (isAllowlisted(filePath)) continue;
    if (pattern.test(content)) {
      findings.push(`${name}: ${filePath}`);
    }
  }

  return findings;
}

function main() {
  const tracked = listTrackedFiles();
  const allFindings = [];

  for (const file of tracked) {
    allFindings.push(...scanFile(file));
  }

  if (allFindings.length === 0) {
    console.log(`[scan-tracked-secrets] OK — ${tracked.length} tracked files scanned`);
    return;
  }

  console.error(`[scan-tracked-secrets] FAIL — ${allFindings.length} finding(s):`);
  for (const finding of allFindings) {
    console.error(`  - ${finding}`);
  }
  process.exit(1);
}

main();
