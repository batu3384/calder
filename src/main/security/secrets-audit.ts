/**
 * Secrets audit tool — scans runtime files for accidentally stored sensitive data.
 * Run: npx ts-node src/main/security/secrets-audit.ts
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const CALDER_DIR = path.join(os.homedir(), '.calder');

const SENSITIVE_PATTERNS = [
  /sk-[a-zA-Z0-9]{20,}/, // OpenAI API key
  /sk-ant-[a-zA-Z0-9-]{20,}/i, // Anthropic API key
  /xpx[ac]-[a-zA-Z0-9-]{30,}/i, // Google API key pattern
  /AIza[a-zA-Z0-9_-]{30,}/, // Google API key
  /ghp_[a-zA-Z0-9]{36}/i, // GitHub token
  /gho_[a-zA-Z0-9]{36}/i, // GitHub OAuth
  /ghu_[a-zA-Z0-9]{36}/i, // GitHub user token
  /ghs_[a-zA-Z0-9]{36}/i, // GitHub server token
  /ghr_[a-zA-Z0-9]{36}/i, // GitHub refresh token
  /Bearer\s+[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/, // JWT
  /password\s*[:=]\s*['"]?[\w!@#$%^&*()+-]{4,}/i, // password=PASSWORD patterns
  /api[_-]?key\s*[:=]\s*['"]?[a-zA-Z0-9]{16,}['"]?/i, // generic API key patterns
  /token\s*[:=]\s*['"]?[a-zA-Z0-9]{20,}['"]?/i, // generic token patterns
  /-----BEGIN.*PRIVATE KEY-----/, // PEM private key
  /-----BEGIN.*RSA.*PRIVATE KEY-----/, // RSA private key
  /AKIA[A-Z0-9]{16}/i, // AWS access key ID
];

const BLOCKED_FILE_NAMES = [
  '.env',
  '.env.local',
  '.env.production',
  'credentials.json',
  'secrets.json',
  'tokens.json',
  '.aws/credentials',
];

function scanFile(filePath: string): string[] {
  const findings: string[] = [];
  try {
    const stat = fs.statSync(filePath);
    if (stat.size > 5 * 1024 * 1024) {
      findings.push(`[SKIP] ${filePath} — file too large (>5MB)`);
      return findings;
    }

    const content = fs.readFileSync(filePath, 'utf-8');

    for (const pattern of SENSITIVE_PATTERNS) {
      if (pattern.test(content)) {
        findings.push(`[ALERT] ${filePath} — matched pattern: ${pattern}`);
      }
    }

    const fileName = path.basename(filePath);
    if (BLOCKED_FILE_NAMES.includes(fileName)) {
      findings.push(`[ALERT] ${filePath} — blocked filename detected`);
    }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT' && code !== 'EISDIR') {
      findings.push(`[ERROR] ${filePath} — ${String(err)}`);
    }
  }
  return findings;
}

function scanDirectory(dir: string, depth = 0): string[] {
  if (depth > 5) return [`[SKIP] ${dir} — max depth exceeded`];

  const findings: string[] = [];
  let entries: string[] = [];

  try {
    entries = fs.readdirSync(dir);
  } catch {
    return findings;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      findings.push(...scanDirectory(fullPath, depth + 1));
    } else if (stat.isFile()) {
      findings.push(...scanFile(fullPath));
    }
  }

  return findings;
}

async function main() {
  console.info('=== Calder Secrets Audit ===\n');
  console.info(`Scanning: ${CALDER_DIR}\n`);

  if (!fs.existsSync(CALDER_DIR)) {
    console.warn('Calder directory does not exist yet — nothing to audit.');
    return;
  }

  const allFindings: string[] = [];

  for (const subDir of ['runtime', 'logs']) {
    const target = path.join(CALDER_DIR, subDir);
    if (fs.existsSync(target)) {
      console.info(`Scanning ${subDir}/...`);
      allFindings.push(...scanDirectory(target));
    }
  }

  if (allFindings.length === 0) {
    console.info('\n[OK] No sensitive data detected in runtime files.');
  } else {
    console.warn(`\n[WARNING] ${allFindings.length} finding(s) detected:`);
    for (const finding of allFindings) {
      console.warn(`  ${finding}`);
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Audit failed:', err);
  process.exit(1);
});
