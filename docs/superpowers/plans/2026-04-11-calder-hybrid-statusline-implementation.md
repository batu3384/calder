# Calder Hybrid Statusline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Calder's capture-only Claude Code statusline script with a two-line hybrid renderer that shows active model, provider, context, and honest provider quota state while preserving `.cost` and `.sessionid` capture.

**Architecture:** Add a small TypeScript helper layer for provider inference, cache semantics, and text formatting, then generate a managed Python runtime into Calder's temp directory to do the actual Claude Code `statusLine` rendering. Keep the installed command path stable so `settings-guard` and Claude provider setup still recognize the statusline as Calder-owned, and keep quota refresh off the hot path by using cache files plus an opportunistic background refresh.

**Tech Stack:** Electron main-process TypeScript, Vitest, Claude Code `statusLine` command hooks, generated Python runtime in `/tmp/calder`

---

## File Structure

- Create: `src/main/statusline-format.ts`
  Responsibility: Provider inference, quota snapshot types, cache file names, freshness rules, and two-line string formatting that tests can exercise without parsing generated Python.

- Create: `src/main/statusline-format.test.ts`
  Responsibility: Pin `glm-* -> Z.ai`, Claude -> Anthropic, freshness derivation, and string rendering for `live`, `syncing`, `unknown`, `unsupported`, and `stale`.

- Create: `src/main/statusline-template.ts`
  Responsibility: Generate deterministic `statusline.py` and wrapper script contents from shared constants so `hook-status.ts` stays thin.

- Create: `src/main/statusline-template.test.ts`
  Responsibility: Verify the generated Python runtime preserves `.cost`/`.sessionid` capture, includes background refresh mode, and keeps the wrapper pointed at the managed helper script.

- Modify: `src/main/hook-status.ts`
  Responsibility: Write `statusline.py` plus the stable wrapper script, keep existing watcher behavior, and expand cleanup to include quota cache artifacts.

- Modify: `src/main/hook-status.test.ts`
  Responsibility: Assert both runtime assets are written, quota cache artifacts are cleaned up, and the watcher still ignores unrelated files.

- Modify: `src/main/claude-cli.test.ts`
  Responsibility: Pin the contract that `installStatusLine()` writes the stable wrapper path returned by `getStatusLineScriptPath()`, not the Python helper path.

- Modify: `src/main/settings-guard.test.ts`
  Responsibility: Keep Calder statusline detection stable after the runtime grows behind the wrapper.

- Modify: `src/main/providers/claude-provider.test.ts`
  Responsibility: Pin provider-side installation and reinstall flows so Claude provider setup still refreshes the managed statusline assets.

### Task 1: Codify Provider Detection, Quota Semantics, and Two-Line Formatting

**Files:**
- Create: `src/main/statusline-format.ts`
- Test: `src/main/statusline-format.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/main/statusline-format.test.ts` with focused coverage for provider inference, freshness derivation, and rendered output:

```ts
import { describe, expect, it } from 'vitest';
import {
  deriveQuotaFreshness,
  formatHybridStatusLine,
  inferStatuslineProvider,
  type ProviderQuotaSnapshot,
} from './statusline-format';

describe('inferStatuslineProvider', () => {
  it('maps glm models to z.ai', () => {
    expect(inferStatuslineProvider('glm-5.1')).toBe('zai');
    expect(inferStatuslineProvider('GLM-4.5-Air')).toBe('zai');
  });

  it('maps Claude models to anthropic', () => {
    expect(inferStatuslineProvider('Claude Sonnet 4.6')).toBe('anthropic');
    expect(inferStatuslineProvider('haiku')).toBe('anthropic');
  });
});

describe('deriveQuotaFreshness', () => {
  it('marks a recent unknown snapshot as live', () => {
    const snapshot: ProviderQuotaSnapshot = {
      provider: 'anthropic',
      model: 'Claude Sonnet 4.6',
      fiveHour: null,
      weekly: null,
      status: 'unknown',
      updatedAt: 1_000,
      source: 'anthropic:none',
    };
    expect(deriveQuotaFreshness(snapshot, 1_500, 60_000)).toBe('live');
  });

  it('marks an old snapshot as stale', () => {
    const snapshot: ProviderQuotaSnapshot = {
      provider: 'zai',
      model: 'glm-5.1',
      fiveHour: null,
      weekly: null,
      status: 'unknown',
      updatedAt: 1_000,
      source: 'zai:none',
    };
    expect(deriveQuotaFreshness(snapshot, 120_000, 60_000)).toBe('stale');
  });
});

describe('formatHybridStatusLine', () => {
  it('renders honest unknown quota values with a live freshness badge', () => {
    const out = formatHybridStatusLine({
      modelDisplayName: 'Claude Sonnet 4.6',
      provider: 'anthropic',
      effortLabel: 'High',
      cwdLabel: 'browser',
      contextPercent: 38,
      costLabel: '--',
      quota: {
        provider: 'anthropic',
        model: 'Claude Sonnet 4.6',
        fiveHour: null,
        weekly: null,
        status: 'unknown',
        updatedAt: 1_000,
        source: 'anthropic:none',
      },
      nowMs: 1_500,
    });

    expect(out).toBe([
      'Claude Sonnet 4.6  Anthropic  High  browser',
      'Ctx 38%  Cost --  5h unknown  Week unknown  Live',
    ].join('\n'));
  });
});
```

- [ ] **Step 2: Run the focused tests to verify failure**

Run: `npm test -- src/main/statusline-format.test.ts`

Expected: FAIL with `Cannot find module './statusline-format'` or missing export errors.

- [ ] **Step 3: Implement the minimal formatting helpers**

Create `src/main/statusline-format.ts` with the shared types, provider mapping, freshness logic, and two-line formatter:

```ts
export type StatuslineProvider = 'anthropic' | 'zai';
export type ProviderQuotaStatus = 'syncing' | 'unknown' | 'unsupported';
export type QuotaFreshness = 'live' | 'syncing' | 'stale';

export interface ProviderQuotaSnapshot {
  provider: StatuslineProvider;
  model: string;
  fiveHour: string | null;
  weekly: string | null;
  status: ProviderQuotaStatus;
  updatedAt: number;
  source: string;
  message?: string;
}

export interface HybridStatuslineView {
  modelDisplayName: string;
  provider: StatuslineProvider;
  effortLabel?: string | null;
  cwdLabel: string;
  contextPercent?: number | null;
  costLabel?: string | null;
  quota: ProviderQuotaSnapshot | null;
  nowMs?: number;
}

export const DEFAULT_STATUSLINE_STALE_MS = 5 * 60_000;

const PROVIDER_LABELS: Record<StatuslineProvider, string> = {
  anthropic: 'Anthropic',
  zai: 'Z.ai',
};

export function inferStatuslineProvider(modelDisplayName: string): StatuslineProvider {
  const normalized = modelDisplayName.trim().toLowerCase();
  return normalized.startsWith('glm-') ? 'zai' : 'anthropic';
}

export function fallbackQuotaStatus(provider: StatuslineProvider): ProviderQuotaStatus {
  return provider === 'anthropic' ? 'unsupported' : 'syncing';
}

export function deriveQuotaFreshness(
  snapshot: ProviderQuotaSnapshot | null,
  nowMs = Date.now(),
  staleAfterMs = DEFAULT_STATUSLINE_STALE_MS,
): QuotaFreshness {
  if (!snapshot) return 'syncing';
  if (snapshot.status === 'syncing') return 'syncing';
  return nowMs - snapshot.updatedAt > staleAfterMs ? 'stale' : 'live';
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function formatHybridStatusLine(view: HybridStatuslineView): string {
  const quotaStatus = view.quota?.status ?? fallbackQuotaStatus(view.provider);
  const freshness = titleCase(deriveQuotaFreshness(view.quota, view.nowMs));
  const contextLabel = view.contextPercent == null ? '--' : String(view.contextPercent);
  const costLabel = view.costLabel?.trim() || '--';
  const line1 = [
    view.modelDisplayName || 'Unknown Model',
    PROVIDER_LABELS[view.provider],
    view.effortLabel?.trim() || '--',
    view.cwdLabel || 'project',
  ].join('  ');
  const line2 = [
    `Ctx ${contextLabel}%`,
    `Cost ${costLabel}`,
    `5h ${view.quota?.fiveHour ?? quotaStatus}`,
    `Week ${view.quota?.weekly ?? quotaStatus}`,
    freshness,
  ].join('  ');
  return `${line1}\n${line2}`;
}
```

- [ ] **Step 4: Re-run the focused tests**

Run: `npm test -- src/main/statusline-format.test.ts`

Expected: PASS for provider inference, freshness derivation, and two-line output.

- [ ] **Step 5: Commit**

```bash
git add src/main/statusline-format.ts src/main/statusline-format.test.ts
git commit -m "add hybrid statusline formatting helpers"
```

### Task 2: Generate Managed Python Runtime and Stable Wrapper Script

**Files:**
- Create: `src/main/statusline-template.ts`
- Create: `src/main/statusline-template.test.ts`
- Modify: `src/main/hook-status.ts`
- Modify: `src/main/hook-status.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/main/statusline-template.test.ts` and extend `src/main/hook-status.test.ts` so the new runtime contract is explicit:

```ts
import { describe, expect, it } from 'vitest';
import { buildStatusLinePython, buildStatusLineWrapper } from './statusline-template';

describe('buildStatusLinePython', () => {
  it('preserves .cost and .sessionid capture', () => {
    const py = buildStatusLinePython('/tmp/calder');
    expect(py).toContain("sid+'.cost'");
    expect(py).toContain("sid+'.sessionid'");
  });

  it('includes a render entrypoint and a background refresh entrypoint', () => {
    const py = buildStatusLinePython('/tmp/calder');
    expect(py).toContain("def render_statusline");
    expect(py).toContain("def refresh_provider_cache");
    expect(py).toContain("if __name__ == '__main__':");
  });
});

describe('buildStatusLineWrapper', () => {
  it('invokes the managed python helper instead of inlining python', () => {
    const wrapper = buildStatusLineWrapper('/tmp/calder/statusline.py', '/tmp/calder/statusline.log');
    expect(wrapper).toContain('statusline.py');
    expect(wrapper).toContain('statusline.log');
  });
});
```

Update `src/main/hook-status.test.ts` with the new write expectations:

```ts
it('writes the python helper and then the stable wrapper script', () => {
  installStatusLineScript();

  expect(fs.writeFileSync).toHaveBeenCalledWith(
    path.join(STATUS_DIR, 'statusline.py'),
    expect.stringContaining('def render_statusline'),
    { mode: 0o755 },
  );
  expect(fs.writeFileSync).toHaveBeenCalledWith(
    STATUSLINE_SCRIPT,
    expect.stringContaining('statusline.py'),
    { mode: 0o755 },
  );
});
```

- [ ] **Step 2: Run the focused tests to verify failure**

Run: `npm test -- src/main/statusline-template.test.ts src/main/hook-status.test.ts`

Expected: FAIL because `statusline-template.ts` does not exist and `installStatusLineScript()` still writes only the wrapper body.

- [ ] **Step 3: Implement the runtime template generator**

Create `src/main/statusline-template.ts` so `hook-status.ts` can write deterministic assets:

```ts
import { pythonBin, isWin } from './platform';
import {
  DEFAULT_STATUSLINE_STALE_MS,
  fallbackQuotaStatus,
} from './statusline-format';

export const STATUSLINE_PYTHON_HELPER = 'statusline.py';

export function buildStatusLinePython(statusDir: string): string {
  const config = JSON.stringify({
    staleAfterMs: DEFAULT_STATUSLINE_STALE_MS,
    anthropicFallback: fallbackQuotaStatus('anthropic'),
    zaiFallback: fallbackQuotaStatus('zai'),
  });

  return `import json, os, subprocess, sys, time
CONFIG = json.loads(r'''${config}''')
STATUS_DIR = r'''${statusDir}'''

def read_payload():
    try:
        return json.load(sys.stdin)
    except Exception:
        return {}

def fallback_snapshot(provider, model_name):
    status = CONFIG['anthropicFallback'] if provider == 'anthropic' else CONFIG['zaiFallback']
    return {
        'provider': provider,
        'model': model_name,
        'fiveHour': None,
        'weekly': None,
        'status': status,
        'updatedAt': int(time.time() * 1000),
        'source': 'generated:fallback',
    }

def render_statusline(payload):
    sid = os.environ.get('CLAUDE_IDE_SESSION_ID', '')
    model_name = ((payload.get('model') or {}).get('display_name') or '').strip()
    provider = 'zai' if model_name.lower().startswith('glm-') else 'anthropic'
    cost = payload.get('cost', {})
    ctx = payload.get('context_window', {})
    if sid and (cost or ctx or model_name):
        with open(os.path.join(STATUS_DIR, sid + '.cost'), 'w') as f:
            json.dump({'cost': cost, 'context_window': ctx, 'model': model_name}, f)
    claude_sid = payload.get('session_id', '')
    if sid and claude_sid:
        with open(os.path.join(STATUS_DIR, sid + '.sessionid'), 'w') as f:
            f.write(claude_sid)
    snapshot = fallback_snapshot(provider, model_name)
    ctx_used = (ctx.get('used') if isinstance(ctx, dict) else None)
    ctx_total = (ctx.get('max') if isinstance(ctx, dict) else None) or 0
    ctx_percent = int((ctx_used / ctx_total) * 100) if ctx_used is not None and ctx_total else 0
    return '\\n'.join([
        f"{model_name or 'Unknown Model'}  {'Z.ai' if provider == 'zai' else 'Anthropic'}  --  project",
        f"Ctx {ctx_percent}%  Cost --  5h {snapshot['status']}  Week {snapshot['status']}  Syncing",
    ])

def refresh_provider_cache(provider, model_name):
    return fallback_snapshot(provider, model_name)

if __name__ == '__main__':
    mode = sys.argv[1] if len(sys.argv) > 1 else 'render'
    payload = read_payload() if mode == 'render' else {}
    if mode == 'refresh':
        refresh_provider_cache(sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else '')
    else:
        print(render_statusline(payload))
`;
}

export function buildStatusLineWrapper(pythonPath: string, logPath: string): string {
  if (isWin) {
    return `@echo off\r\npython "${pythonPath}" render 2>>"${logPath}"\r\n`;
  }
  return `#!/bin/sh\n${pythonBin} "${pythonPath}" render 2>>"${logPath}"\n`;
}
```

- [ ] **Step 4: Wire `hook-status.ts` to write both runtime assets**

Update `src/main/hook-status.ts` so the stable wrapper path stays the same while the heavy logic moves into the managed Python helper:

```ts
import { buildStatusLinePython, buildStatusLineWrapper, STATUSLINE_PYTHON_HELPER } from './statusline-template';

const STATUSLINE_PYTHON_PATH = path.join(STATUS_DIR, STATUSLINE_PYTHON_HELPER);

export function installStatusLineScript(): void {
  fs.mkdirSync(STATUS_DIR, { recursive: true, mode: 0o700 });

  fs.writeFileSync(
    STATUSLINE_PYTHON_PATH,
    buildStatusLinePython(STATUS_DIR),
    { mode: 0o755 },
  );

  fs.writeFileSync(
    STATUSLINE_SCRIPT,
    buildStatusLineWrapper(STATUSLINE_PYTHON_PATH, path.join(STATUS_DIR, 'statusline.log')),
    { mode: 0o755 },
  );
}
```

- [ ] **Step 5: Re-run the focused tests**

Run: `npm test -- src/main/statusline-template.test.ts src/main/hook-status.test.ts`

Expected: PASS with both runtime assets written and the wrapper still anchored to `getStatusLineScriptPath()`.

- [ ] **Step 6: Commit**

```bash
git add src/main/statusline-template.ts src/main/statusline-template.test.ts src/main/hook-status.ts src/main/hook-status.test.ts
git commit -m "generate managed hybrid statusline runtime"
```

### Task 3: Add Honest Provider Cache Refresh and Cache Cleanup

**Files:**
- Modify: `src/main/statusline-format.ts`
- Modify: `src/main/statusline-template.ts`
- Modify: `src/main/hook-status.ts`
- Modify: `src/main/hook-status.test.ts`

- [ ] **Step 1: Write the failing tests**

Extend the focused tests to cover cache paths, refresh behavior, and cleanup:

```ts
// src/main/statusline-format.test.ts
import { getProviderQuotaCacheFile, deriveQuotaFreshness } from './statusline-format';

it('uses provider-specific cache file names', () => {
  expect(getProviderQuotaCacheFile('anthropic')).toBe('anthropic.quota.json');
  expect(getProviderQuotaCacheFile('zai')).toBe('zai.quota.json');
});
```

```ts
// src/main/statusline-template.test.ts
it('seeds honest fallback snapshots for unsupported or syncing providers', () => {
  const py = buildStatusLinePython('/tmp/calder');
  expect(py).toContain("calder:no-supported-anthropic-quota-api");
  expect(py).toContain("zai:quota-surface-pending");
  expect(py).toContain("subprocess.Popen");
});
```

```ts
// src/main/hook-status.test.ts
it('cleanupAll removes provider quota cache artifacts', () => {
  vi.mocked(fs.readdirSync).mockReturnValue([
    'anthropic.quota.json',
    'zai.quota.json',
    'statusline.refresh.lock',
  ] as any);

  cleanupAll();

  expect(fs.unlinkSync).toHaveBeenCalledWith(path.join(STATUS_DIR, 'anthropic.quota.json'));
  expect(fs.unlinkSync).toHaveBeenCalledWith(path.join(STATUS_DIR, 'zai.quota.json'));
  expect(fs.unlinkSync).toHaveBeenCalledWith(path.join(STATUS_DIR, 'statusline.refresh.lock'));
});
```

- [ ] **Step 2: Run the focused tests to verify failure**

Run: `npm test -- src/main/statusline-format.test.ts src/main/statusline-template.test.ts src/main/hook-status.test.ts`

Expected: FAIL because cache helpers and refresh/cleanup logic do not exist yet.

- [ ] **Step 3: Add provider cache helpers and baseline refresh snapshots**

Extend `src/main/statusline-format.ts` with cache file helpers:

```ts
export function getProviderQuotaCacheFile(provider: StatuslineProvider): string {
  return `${provider}.quota.json`;
}
```

Fill in `src/main/statusline-template.ts` so the Python helper writes honest fallback snapshots and refreshes in the background without blocking render:

```ts
  return `import json, os, subprocess, sys, time
CONFIG = json.loads(r'''${config}''')
STATUS_DIR = r'''${statusDir}'''
REFRESH_LOCK = os.path.join(STATUS_DIR, 'statusline.refresh.lock')

def quota_cache_path(provider):
    return os.path.join(STATUS_DIR, provider + '.quota.json')

def fallback_snapshot(provider, model_name):
    if provider == 'anthropic':
        return {
            'provider': provider,
            'model': model_name,
            'fiveHour': None,
            'weekly': None,
            'status': 'unsupported',
            'updatedAt': int(time.time() * 1000),
            'source': 'calder:no-supported-anthropic-quota-api',
            'message': 'Claude Code does not expose remaining Pro quota',
        }
    return {
        'provider': provider,
        'model': model_name,
        'fiveHour': None,
        'weekly': None,
        'status': 'syncing',
        'updatedAt': int(time.time() * 1000),
        'source': 'zai:quota-surface-pending',
        'message': 'Waiting for a supported Z.ai quota source',
    }

def refresh_provider_cache(provider, model_name):
    snapshot = fallback_snapshot(provider, model_name)
    with open(quota_cache_path(provider), 'w') as f:
        json.dump(snapshot, f)
    return snapshot

def spawn_refresh(provider, model_name):
    if os.path.exists(REFRESH_LOCK):
        return
    with open(REFRESH_LOCK, 'w') as f:
        f.write(str(int(time.time() * 1000)))
    try:
        subprocess.Popen([sys.executable, __file__, 'refresh', provider, model_name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception:
        try:
            os.unlink(REFRESH_LOCK)
        except OSError:
            pass
`;
```

- [ ] **Step 4: Finish render-time cache reads and cleanup wiring**

Update `src/main/statusline-template.ts` so render mode reads the cache, preserves `.cost`/`.sessionid`, and prints the hybrid string without blocking:

```ts
def read_snapshot(provider):
    try:
        with open(quota_cache_path(provider), 'r') as f:
            return json.load(f)
    except Exception:
        return None

def render_statusline(payload):
    sid = os.environ.get('CLAUDE_IDE_SESSION_ID', '')
    model_name = ((payload.get('model') or {}).get('display_name') or '').strip()
    provider = 'zai' if model_name.lower().startswith('glm-') else 'anthropic'
    cost = payload.get('cost', {})
    ctx = payload.get('context_window', {})
    if sid and (cost or ctx or model_name):
        with open(os.path.join(STATUS_DIR, sid + '.cost'), 'w') as f:
            json.dump({'cost': cost, 'context_window': ctx, 'model': model_name}, f)
    claude_sid = payload.get('session_id', '')
    if sid and claude_sid:
        with open(os.path.join(STATUS_DIR, sid + '.sessionid'), 'w') as f:
            f.write(claude_sid)
    snapshot = read_snapshot(provider)
    if snapshot is None:
        spawn_refresh(provider, model_name)
        snapshot = fallback_snapshot(provider, model_name)
    freshness = 'Syncing' if snapshot.get('status') == 'syncing' else 'Live'
    ctx_used = ctx.get('used') if isinstance(ctx, dict) else None
    ctx_total = ctx.get('max') if isinstance(ctx, dict) else None
    ctx_percent = int((ctx_used / ctx_total) * 100) if ctx_used is not None and ctx_total else 0
    cost_total = cost.get('total') if isinstance(cost, dict) else None
    cost_label = '--' if cost_total in (None, '') else str(cost_total)
    effort = ((payload.get('model') or {}).get('reasoning') or (payload.get('effort') or '') or '--')
    cwd_label = os.path.basename(os.getcwd()) or 'project'
    line1 = f"{model_name or 'Unknown Model'}  {'Z.ai' if provider == 'zai' else 'Anthropic'}  {effort}  {cwd_label}"
    line2 = f"Ctx {ctx_percent}%  Cost {cost_label}  5h {snapshot.get('fiveHour') or snapshot.get('status')}  Week {snapshot.get('weekly') or snapshot.get('status')}  {freshness}"
    return '\\n'.join([line1, line2])
```

Update `src/main/hook-status.ts` cleanup logic so cache artifacts are removed on global cleanup without touching per-session cleanup:

```ts
function isStatuslineArtifact(filename: string): boolean {
  return filename.endsWith('.quota.json')
    || filename === 'statusline.refresh.lock'
    || filename === 'statusline.log';
}

export function cleanupAll(): void {
  stopPolling();
  knownSessionIds.clear();
  if (watcher) {
    watcher.close();
    watcher = null;
  }
  try {
    const files = fs.readdirSync(STATUS_DIR);
    for (const file of files) {
      if (isKnownExtension(file) || isStatuslineArtifact(file) || file.endsWith('.py') || file.endsWith('.cmd') || file.endsWith('.sh')) {
        try { fs.unlinkSync(path.join(STATUS_DIR, file)); } catch {}
      }
    }
    try { fs.rmSync(STATUS_DIR, { recursive: true }); } catch {}
  } catch {}
}
```

- [ ] **Step 5: Re-run the focused tests**

Run: `npm test -- src/main/statusline-format.test.ts src/main/statusline-template.test.ts src/main/hook-status.test.ts`

Expected: PASS with honest fallback snapshots, background refresh hooks, and cache cleanup coverage.

- [ ] **Step 6: Commit**

```bash
git add src/main/statusline-format.ts src/main/statusline-format.test.ts src/main/statusline-template.ts src/main/statusline-template.test.ts src/main/hook-status.ts src/main/hook-status.test.ts
git commit -m "add honest provider quota cache handling"
```

### Task 4: Pin Settings and Claude Provider Compatibility Around the Stable Wrapper Path

**Files:**
- Modify: `src/main/claude-cli.test.ts`
- Modify: `src/main/settings-guard.test.ts`
- Modify: `src/main/providers/claude-provider.test.ts`

- [ ] **Step 1: Write the failing tests**

Add focused compatibility tests so the implementation cannot silently drift to the Python helper path:

```ts
// src/main/claude-cli.test.ts
it('installs the stable wrapper path into Claude settings', () => {
  installStatusLine();
  const withStatusLine = JSON.parse(String(mockWriteFileSync.mock.calls.at(-1)?.[1]));
  expect(withStatusLine.statusLine).toEqual({
    type: 'command',
    command: '/tmp/calder/statusline.sh',
  });
});
```

```ts
// src/main/settings-guard.test.ts
it('accepts the wrapper command and rejects the helper path', () => {
  expect(isCalderStatusLine({ command: '/tmp/calder/statusline.sh' })).toBe(true);
  expect(isCalderStatusLine({ command: '/tmp/calder/statusline.py' })).toBe(false);
});
```

```ts
// src/main/providers/claude-provider.test.ts
vi.mock('../settings-guard', () => ({
  guardedInstall: vi.fn(),
  validateSettings: vi.fn(() => ({ statusLine: 'calder', hooks: 'complete', hookDetails: {} })),
  reinstallSettings: vi.fn(),
}));

it('reinstallSettings refreshes the managed runtime assets', () => {
  provider.reinstallSettings();
  expect(mockInstallStatusLineScript).toHaveBeenCalled();
});

it('installStatusScripts delegates to the managed runtime installer', () => {
  provider.installStatusScripts();
  expect(mockInstallStatusLineScript).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the focused tests to verify failure**

Run: `npm test -- src/main/claude-cli.test.ts src/main/settings-guard.test.ts src/main/providers/claude-provider.test.ts`

Expected: FAIL until the tests and mocks reflect the new runtime split and wrapper-path contract.

- [ ] **Step 3: Update the integration tests and any small compatibility helpers**

Keep production behavior minimal and test-focused:

```ts
// src/main/settings-guard.ts
export function isCalderStatusLine(statusLine: unknown): boolean {
  if (!statusLine || typeof statusLine !== 'object') return false;
  const sl = statusLine as Record<string, unknown>;
  return String(sl.command ?? '') === getStatusLineScriptPath();
}
```

```ts
// src/main/providers/claude-provider.ts
reinstallSettings(): void {
  reinstallSettings();
  installStatusLineScript();
}

installStatusScripts(): void {
  installStatusLineScript();
}
```

The code above already matches the intended contract; the implementation task here is to keep it unchanged while expanding the tests and mocks around it.

- [ ] **Step 4: Re-run the focused tests**

Run: `npm test -- src/main/claude-cli.test.ts src/main/settings-guard.test.ts src/main/providers/claude-provider.test.ts`

Expected: PASS with the wrapper-path contract pinned.

- [ ] **Step 5: Commit**

```bash
git add src/main/claude-cli.test.ts src/main/settings-guard.test.ts src/main/providers/claude-provider.test.ts
git commit -m "pin hybrid statusline integration contracts"
```

### Task 5: Verify End-to-End Behavior and Manual Smoke Cases

**Files:**
- Modify: `src/main/statusline-template.ts`
- Modify: `src/main/hook-status.ts`

- [ ] **Step 1: Run the focused main-process suite**

Run:

```bash
npm test -- src/main/statusline-format.test.ts src/main/statusline-template.test.ts src/main/hook-status.test.ts src/main/claude-cli.test.ts src/main/settings-guard.test.ts src/main/providers/claude-provider.test.ts
```

Expected: PASS for all touched main-process tests.

- [ ] **Step 2: Run the full automated suite**

Run: `npm test`

Expected: PASS with the full Vitest suite green.

- [ ] **Step 3: Run the build**

Run: `npm run build`

Expected: PASS with `tsc`, renderer bundling, and `copy-assets` succeeding.

- [ ] **Step 4: Run manual smoke checks inside Calder**

Run: `npm start`

Expected manual results:
- open a Claude session on a Claude model and confirm line 1 includes `Anthropic`
- confirm line 2 shows `5h unsupported` or `5h unknown`, `Week unsupported` or `Week unknown`, and a final freshness badge such as `Live`
- switch to a `glm-*` model and confirm line 1 flips to `Z.ai`
- delete `/tmp/calder/*.quota.json` while Calder is closed, reopen Calder, and confirm the statusline still renders while cache files are recreated in the background

- [ ] **Step 5: Commit the verified result**

```bash
git add src/main/statusline-format.ts src/main/statusline-format.test.ts src/main/statusline-template.ts src/main/statusline-template.test.ts src/main/hook-status.ts src/main/hook-status.test.ts src/main/claude-cli.test.ts src/main/settings-guard.test.ts src/main/providers/claude-provider.test.ts
git commit -m "ship hybrid claude statusline"
```
