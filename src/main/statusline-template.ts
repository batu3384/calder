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
    qwenFallback: fallbackQuotaStatus('qwen'),
  });

  return `import json, os, subprocess, sys, time, urllib.parse, urllib.request
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
            'weeklyLabel': 'Week',
            'status': CONFIG['anthropicFallback'],
            'updatedAt': int(time.time() * 1000),
            'source': 'calder:no-supported-anthropic-quota-api',
            'message': 'Claude Code did not provide OAuth rate limits in this payload',
        }
    if provider == 'qwen':
        return {
            'provider': provider,
            'model': model_name,
            'fiveHour': None,
            'weekly': None,
            'weeklyLabel': 'Week',
            'status': CONFIG['qwenFallback'],
            'updatedAt': int(time.time() * 1000),
            'source': 'qwen:no-supported-quota-api',
            'message': 'Qwen Code did not provide quota details in this payload',
        }
    return {
        'provider': provider,
        'model': model_name,
        'fiveHour': None,
        'weekly': None,
        'weeklyLabel': 'Cycle',
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

def refresh_lock_is_active():
    if os.path.exists(REFRESH_LOCK):
        try:
            age_ms = int(time.time() * 1000) - int(os.path.getmtime(REFRESH_LOCK) * 1000)
            if age_ms > CONFIG['staleAfterMs']:
                os.unlink(REFRESH_LOCK)
                return False
        except OSError:
            return False
        except Exception:
            pass
        return True
    return False

def spawn_refresh(provider, model_name):
    if refresh_lock_is_active():
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

def numeric_value(value):
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value.rstrip('%').strip())
        except Exception:
            return None
    return None

def quota_remaining_label(used_percentage):
    used = numeric_value(used_percentage)
    if used is None:
        return None
    remaining = int(round(max(0, min(100, 100 - used))))
    return str(remaining) + '% left'

def zai_secondary_window_label(next_reset_time):
    reset_ms = numeric_value(next_reset_time)
    if reset_ms is None:
        return 'Cycle'
    remaining_ms = reset_ms - int(time.time() * 1000)
    if remaining_ms <= 8 * 24 * 60 * 60 * 1000:
        return 'Week'
    return 'Cycle'

def snapshot_is_stale(snapshot):
    if not isinstance(snapshot, dict):
        return True
    updated_at = numeric_value(snapshot.get('updatedAt'))
    if updated_at is None:
        return True
    return int(time.time() * 1000) - updated_at > CONFIG['staleAfterMs']

def anthropic_rate_limit_snapshot(payload, model_name):
    rate_limits = payload.get('rate_limits')
    if not isinstance(rate_limits, dict):
        return None
    five_hour = rate_limits.get('five_hour') or {}
    seven_day = rate_limits.get('seven_day') or {}
    five_hour_label = quota_remaining_label(five_hour.get('used_percentage')) if isinstance(five_hour, dict) else None
    weekly_label = quota_remaining_label(seven_day.get('used_percentage')) if isinstance(seven_day, dict) else None
    if not five_hour_label and not weekly_label:
        return None
    return {
        'provider': 'anthropic',
        'model': model_name,
        'fiveHour': five_hour_label,
        'weekly': weekly_label,
        'weeklyLabel': 'Week',
        'status': 'unknown',
        'updatedAt': int(time.time() * 1000),
        'source': 'claude-code:rate_limits',
    }

def zai_base_url():
    for env_key in ('CALDER_ZAI_BASE_URL', 'ZAI_BASE_URL', 'ANTHROPIC_BASE_URL'):
        value = os.environ.get(env_key, '').strip()
        if not value:
            continue
        if env_key == 'ANTHROPIC_BASE_URL' and (
            'api.z.ai' not in value and 'open.bigmodel.cn' not in value and 'dev.bigmodel.cn' not in value
        ):
            continue
        return value
    return 'https://open.bigmodel.cn/api/anthropic'

def zai_quota_url():
    override = os.environ.get('CALDER_ZAI_QUOTA_LIMIT_URL', '').strip()
    if override:
        return override
    parsed = urllib.parse.urlparse(zai_base_url())
    if not parsed.scheme or not parsed.netloc:
        return None
    return parsed.scheme + '://' + parsed.netloc + '/api/monitor/usage/quota/limit'

def zai_auth_token():
    for env_key in ('CALDER_ZAI_AUTH_TOKEN', 'ZAI_API_KEY', 'ANTHROPIC_AUTH_TOKEN'):
        value = os.environ.get(env_key, '').strip()
        if not value:
            continue
        return value if value.lower().startswith('bearer ') else 'Bearer ' + value
    return ''

def fetch_json(url, auth_token):
    request = urllib.request.Request(
        url,
        headers={
            'Authorization': auth_token,
            'Accept-Language': 'en-US,en',
            'Content-Type': 'application/json',
        },
    )
    with urllib.request.urlopen(request, timeout=5) as response:
        return json.loads(response.read().decode('utf-8'))

def zai_quota_snapshot(model_name):
    auth_token = zai_auth_token()
    quota_url = zai_quota_url()
    if not auth_token or not quota_url:
        return fallback_snapshot('zai', model_name)
    try:
        response = fetch_json(quota_url, auth_token)
        data = response.get('data') if isinstance(response, dict) else None
        if not isinstance(data, dict):
            data = response if isinstance(response, dict) else {}
        limits = data.get('limits')
        five_hour = None
        monthly = None
        secondary_label = 'Cycle'
        if isinstance(limits, list):
            for item in limits:
                if not isinstance(item, dict):
                    continue
                limit_type = str(item.get('type') or '').upper()
                label = quota_remaining_label(item.get('percentage'))
                if not label:
                    continue
                if limit_type == 'TOKENS_LIMIT' or ('TOKEN' in limit_type and '5' in limit_type):
                    five_hour = label
                elif limit_type == 'TIME_LIMIT' or 'MCP' in limit_type:
                    monthly = label
                    secondary_label = zai_secondary_window_label(item.get('nextResetTime'))
        if not five_hour and not monthly:
            return {
                **fallback_snapshot('zai', model_name),
                'status': 'unknown',
                'source': 'zai:quota-limit-empty',
                'message': 'Z.ai quota endpoint returned no recognizable limits',
            }
        return {
            'provider': 'zai',
            'model': model_name,
            'fiveHour': five_hour,
            'weekly': monthly,
            'weeklyLabel': secondary_label,
            'status': 'unknown',
            'updatedAt': int(time.time() * 1000),
            'source': 'zai:quota-limit',
        }
    except Exception:
        return {
            **fallback_snapshot('zai', model_name),
            'status': 'syncing',
            'source': 'zai:quota-limit-error',
            'message': 'Z.ai quota refresh failed',
        }

def render_statusline(payload):
    sid = os.environ.get('CLAUDE_IDE_SESSION_ID', '') or os.environ.get('CALDER_SESSION_ID', '')
    model_name = ((payload.get('model') or {}).get('display_name') or '').strip()
    lower_model_name = model_name.lower()
    if lower_model_name.startswith('glm-'):
        provider = 'zai'
        provider_label = 'Z.ai'
    elif lower_model_name.startswith('qwen'):
        provider = 'qwen'
        provider_label = 'Qwen'
    else:
        provider = 'anthropic'
        provider_label = 'Anthropic'
    cost = payload.get('cost', {})
    ctx = payload.get('context_window', {})
    if sid and (cost or ctx or model_name):
        with open(os.path.join(STATUS_DIR, sid+'.cost'), 'w') as f:
            json.dump({'cost': cost, 'context_window': ctx, 'model': model_name}, f)
    claude_sid = payload.get('session_id', '')
    if sid and claude_sid:
        with open(os.path.join(STATUS_DIR, sid+'.sessionid'), 'w') as f:
            f.write(claude_sid)
    snapshot = anthropic_rate_limit_snapshot(payload, model_name) if provider == 'anthropic' else None
    if snapshot is None and provider != 'qwen':
        snapshot = read_snapshot(provider)
    if snapshot is None:
        if provider == 'zai':
            spawn_refresh(provider, model_name)
        snapshot = fallback_snapshot(provider, model_name)
    elif provider == 'zai' and (snapshot.get('status') == 'syncing' or snapshot_is_stale(snapshot)):
        spawn_refresh(provider, model_name)
    ctx_percent = context_percent(ctx)
    freshness = 'Syncing' if snapshot.get('status') == 'syncing' else 'Live'
    cwd_label = latest_cwd_label(sid, payload)
    five_hour_label = snapshot.get('fiveHour') or snapshot['status']
    weekly_name = snapshot.get('weeklyLabel') or 'Week'
    weekly_value = snapshot.get('weekly') or snapshot['status']
    return '\\n'.join([
        f"{model_name or 'Unknown Model'}  {provider_label}  --  {cwd_label}",
        f"Ctx {ctx_percent}%  Cost {cost_label(cost)}  5h {five_hour_label}  {weekly_name} {weekly_value}  {freshness}",
    ])

def refresh_provider_cache(provider, model_name):
    snapshot = zai_quota_snapshot(model_name) if provider == 'zai' else fallback_snapshot(provider, model_name)
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
