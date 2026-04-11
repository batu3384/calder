import { isWin, pythonBin } from './platform';
import {
  DEFAULT_STATUSLINE_STALE_MS,
  fallbackQuotaStatus,
  getProviderQuotaCacheFile,
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
REFRESH_LOCK = os.path.join(STATUS_DIR, 'statusline.refresh.lock')

def read_payload():
    try:
        return json.load(sys.stdin)
    except Exception:
        return {}

def fallback_snapshot(provider, model_name):
    if provider == 'anthropic':
        return {
            'provider': provider,
            'model': model_name,
            'fiveHour': None,
            'weekly': None,
            'status': CONFIG['anthropicFallback'],
            'updatedAt': int(time.time() * 1000),
            'source': 'calder:no-supported-anthropic-quota-api',
            'message': 'Claude Code does not expose remaining Pro quota',
        }
    return {
        'provider': provider,
        'model': model_name,
        'fiveHour': None,
        'weekly': None,
        'status': CONFIG['zaiFallback'],
        'updatedAt': int(time.time() * 1000),
        'source': 'zai:quota-surface-pending',
        'message': 'Waiting for a supported Z.ai quota source',
    }

def quota_cache_path(provider):
    return os.path.join(STATUS_DIR, '${getProviderQuotaCacheFile('anthropic')}').replace('anthropic', provider)

def read_snapshot(provider):
    try:
        with open(quota_cache_path(provider), 'r') as f:
            return json.load(f)
    except Exception:
        return None

def write_snapshot(provider, snapshot):
    with open(quota_cache_path(provider), 'w') as f:
        json.dump(snapshot, f)

def spawn_refresh(provider, model_name):
    if os.path.exists(REFRESH_LOCK):
        return
    with open(REFRESH_LOCK, 'w') as f:
        f.write(str(int(time.time() * 1000)))
    try:
        subprocess.Popen(
            [sys.executable, __file__, 'refresh', provider, model_name],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    except Exception:
        try:
            os.unlink(REFRESH_LOCK)
        except OSError:
            pass

def basename_label(value):
    if not value:
        return ''
    label = os.path.basename(str(value).rstrip(os.sep))
    return label or str(value)

def latest_cwd_label(sid, payload):
    cwd = payload.get('cwd') or (payload.get('workspace') or {}).get('current_dir')
    if cwd:
        return basename_label(cwd)
    if sid:
        try:
            with open(os.path.join(STATUS_DIR, sid+'.events'), 'r') as f:
                lines = [line.strip() for line in f.readlines() if line.strip()]
            for line in reversed(lines):
                try:
                    event = json.loads(line)
                except Exception:
                    continue
                cwd = event.get('cwd') or event.get('worktree_path')
                if cwd:
                    return basename_label(cwd)
        except Exception:
            pass
    return basename_label(os.getcwd()) or 'project'

def context_percent(ctx):
    if not isinstance(ctx, dict):
        return 0
    used_percentage = ctx.get('used_percentage')
    if isinstance(used_percentage, (int, float)):
        return int(round(used_percentage))
    current_usage = ctx.get('current_usage')
    if isinstance(current_usage, (int, float)):
        return int(round(current_usage * 100 if current_usage <= 1 else current_usage))
    used = ctx.get('used')
    total = ctx.get('max') or ctx.get('context_window_size')
    if used is None:
        input_tokens = ctx.get('total_input_tokens')
        output_tokens = ctx.get('total_output_tokens')
        if isinstance(input_tokens, (int, float)) or isinstance(output_tokens, (int, float)):
            used = (input_tokens or 0) + (output_tokens or 0)
    if isinstance(used, (int, float)) and isinstance(total, (int, float)) and total:
        return int(round((used / total) * 100))
    return 0

def cost_label(cost):
    if not isinstance(cost, dict):
        return '--'
    value = cost.get('total_cost_usd')
    if value is None:
        value = cost.get('total')
    if isinstance(value, (int, float)):
        return '$' + format(value, '.2f')
    return '--'

def render_statusline(payload):
    sid = os.environ.get('CLAUDE_IDE_SESSION_ID', '')
    model_name = ((payload.get('model') or {}).get('display_name') or '').strip()
    provider = 'zai' if model_name.lower().startswith('glm-') else 'anthropic'
    cost = payload.get('cost', {})
    ctx = payload.get('context_window', {})
    if sid and (cost or ctx or model_name):
        with open(os.path.join(STATUS_DIR, sid+'.cost'), 'w') as f:
            json.dump({'cost': cost, 'context_window': ctx, 'model': model_name}, f)
    claude_sid = payload.get('session_id', '')
    if sid and claude_sid:
        with open(os.path.join(STATUS_DIR, sid+'.sessionid'), 'w') as f:
            f.write(claude_sid)
    snapshot = read_snapshot(provider)
    if snapshot is None:
        spawn_refresh(provider, model_name)
        snapshot = fallback_snapshot(provider, model_name)
    ctx_percent = context_percent(ctx)
    freshness = 'Syncing' if snapshot.get('status') == 'syncing' else 'Live'
    cwd_label = latest_cwd_label(sid, payload)
    return '\\n'.join([
        f"{model_name or 'Unknown Model'}  {'Z.ai' if provider == 'zai' else 'Anthropic'}  --  {cwd_label}",
        f"Ctx {ctx_percent}%  Cost {cost_label(cost)}  5h {snapshot['status']}  Week {snapshot['status']}  {freshness}",
    ])

def refresh_provider_cache(provider, model_name):
    snapshot = fallback_snapshot(provider, model_name)
    write_snapshot(provider, snapshot)
    try:
        os.unlink(REFRESH_LOCK)
    except OSError:
        pass
    return snapshot

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
