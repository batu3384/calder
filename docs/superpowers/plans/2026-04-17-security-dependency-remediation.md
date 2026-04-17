# Security Dependency Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the currently reported production dependency vulnerabilities without changing Calder runtime behavior or release flow.

**Architecture:** Add one regression test that reads the lockfile and enforces minimum safe dependency versions, then update the dependency resolution with the smallest possible package and lockfile changes. Verify with targeted tests, `npm audit`, and a full build so the remediation is evidence-backed.

**Tech Stack:** TypeScript, Vitest, npm, Electron

---

### Task 1: Add A Dependency Security Regression Test

**Files:**
- Create: `src/main/dependency-security.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function parseVersion(version: string): [number, number, number] {
  const [major = '0', minor = '0', patch = '0'] = version.split('.').map((part) => part.replace(/[^0-9].*$/, ''));
  return [Number(major), Number(minor), Number(patch)];
}

function isAtLeast(version: string, minimum: string): boolean {
  const current = parseVersion(version);
  const target = parseVersion(minimum);
  for (let index = 0; index < 3; index += 1) {
    if (current[index] > target[index]) return true;
    if (current[index] < target[index]) return false;
  }
  return true;
}

describe('dependency security lockfile', () => {
  it('pins dompurify and hono to non-vulnerable versions in package-lock.json', () => {
    const lockfilePath = path.resolve(process.cwd(), 'package-lock.json');
    const lockfile = JSON.parse(readFileSync(lockfilePath, 'utf8')) as {
      packages?: Record<string, { version?: string }>;
    };

    const dompurifyVersion = lockfile.packages?.['node_modules/dompurify']?.version;
    const honoVersion = lockfile.packages?.['node_modules/hono']?.version;

    expect(dompurifyVersion).toBeDefined();
    expect(honoVersion).toBeDefined();
    expect(isAtLeast(dompurifyVersion!, '3.4.0')).toBe(true);
    expect(isAtLeast(honoVersion!, '4.12.14')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/main/dependency-security.test.ts`
Expected: FAIL because `package-lock.json` currently resolves `dompurify` below `3.4.0` and `hono` below `4.12.14`.

### Task 2: Update Dependency Resolution With Minimum Risk

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Bump the direct vulnerable dependency and add the transitive override**

```json
{
  "dependencies": {
    "dompurify": "^3.4.0"
  },
  "overrides": {
    "hono": "^4.12.14"
  }
}
```

- [ ] **Step 2: Refresh the lockfile**

Run: `npm install`
Expected: `package-lock.json` updates so `node_modules/dompurify` resolves to `3.4.0` or newer and `node_modules/hono` resolves to `4.12.14` or newer.

- [ ] **Step 3: Run the regression test to verify it passes**

Run: `npm test -- src/main/dependency-security.test.ts`
Expected: PASS

### Task 3: Verify The Remediation End To End

**Files:**
- Verify only: `package.json`, `package-lock.json`, `src/main/dependency-security.test.ts`

- [ ] **Step 1: Run dependency audit**

Run: `npm audit --json`
Expected: no production vulnerability remains for `dompurify` or `hono`

- [ ] **Step 2: Run a representative main-process test slice**

Run: `npm test -- src/main/provider-env.test.ts src/main/dependency-security.test.ts`
Expected: PASS

- [ ] **Step 3: Run the full build**

Run: `npm run build`
Expected: PASS
