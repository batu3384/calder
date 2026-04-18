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
    minimaxFallback: fallbackQuotaStatus('minimax'),
    qwenFallback: fallbackQuotaStatus('qwen'),
  });

  return `import datetime, json, os, subprocess, sys, time, urllib.parse, urllib.request
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
    if provider == 'minimax':
        return {
            'provider': provider,
            'model': model_name,
            'fiveHour': None,
            'weekly': None,
            'weeklyLabel': 'Week',
            'status': CONFIG['minimaxFallback'],
            'updatedAt': int(time.time() * 1000),
            'source': 'minimax:quota-surface-pending',
            'message': 'Waiting for a supported MiniMax quota source',
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
    target_path = quota_cache_path(provider)
    temp_path = target_path + '.tmp'
    with open(temp_path, 'w') as f:
        json.dump(snapshot, f)
        f.flush()
        os.fsync(f.fileno())
    os.replace(temp_path, target_path)

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
    if isinstance(current_usage, dict):
        total = ctx.get('max') or ctx.get('context_window_size') or ctx.get('context_window_tokens')
        used_from_usage = (
            (current_usage.get('input_tokens') or 0)
            + (current_usage.get('cache_creation_input_tokens') or 0)
            + (current_usage.get('cache_read_input_tokens') or 0)
        )
        if isinstance(total, (int, float)) and total:
            return int(round((used_from_usage / total) * 100))
    elif isinstance(current_usage, (int, float)):
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

def count_remaining_label(usage_count, total_count):
    usage = numeric_value(usage_count)
    total = numeric_value(total_count)
    if usage is None or total is None or total <= 0:
        return None
    remaining = max(0, int(round(total - usage)))
    return str(remaining) + '/' + str(int(round(total))) + ' left'

def reset_time_label_from_ms(value):
    reset_ms = numeric_value(value)
    if reset_ms is None:
        return None
    try:
        return time.strftime('%H:%M', time.localtime(reset_ms / 1000))
    except Exception:
        return None

def reset_time_label_from_epoch_seconds(value):
    reset_seconds = numeric_value(value)
    if reset_seconds is None:
        return None
    try:
        return time.strftime('%H:%M', time.localtime(reset_seconds))
    except Exception:
        return None

def reset_time_label_from_iso(value):
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        normalized = value.strip().replace('Z', '+00:00')
        parsed = datetime.datetime.fromisoformat(normalized)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=datetime.timezone.utc)
        return time.strftime('%H:%M', time.localtime(parsed.timestamp()))
    except Exception:
        return None

def quota_with_reset_label(label, reset_label):
    if label and reset_label:
        return label + ' · resets ' + reset_label
    return label

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

def format_claude_model_name(model_id):
    if not isinstance(model_id, str):
        return ''
    normalized = model_id.strip().lower()
    if not normalized.startswith('claude-'):
        return ''
    parts = normalized.split('-')
    if len(parts) < 4:
        return ''
    family = parts[1]
    major = parts[2]
    minor = parts[3]
    if family not in ('opus', 'sonnet', 'haiku'):
        return ''
    if not major.isdigit() or not minor.isdigit():
        return ''
    return family.capitalize() + ' ' + major + '.' + minor

def derive_model_name(payload):
    display_name = ((payload.get('model') or {}).get('display_name') or '').strip()
    model_usage = payload.get('modelUsage')
    if not isinstance(model_usage, dict) or not model_usage:
        return display_name

    selected_model_id = ''
    selected_score = -1.0
    for model_id, usage in model_usage.items():
        if not isinstance(model_id, str) or not model_id.strip():
            continue
        score = 0.0
        if isinstance(usage, dict):
            for field in ('inputTokens', 'outputTokens', 'cacheCreationInputTokens', 'cacheReadInputTokens'):
                value = numeric_value(usage.get(field))
                if value is not None:
                    score += value
        if selected_model_id == '' or score > selected_score:
            selected_model_id = model_id
            selected_score = score

    usage_name = format_claude_model_name(selected_model_id)
    if not usage_name:
        return display_name
    if not display_name:
        return usage_name

    display_lower = display_name.lower()
    usage_lower = usage_name.lower()
    for family in ('opus', 'sonnet', 'haiku'):
        if display_lower.startswith(family) and usage_lower.startswith(family) and display_lower != usage_lower:
            return usage_name
    return display_name

def anthropic_rate_limit_snapshot(payload, model_name):
    rate_limits = payload.get('rate_limits')
    if not isinstance(rate_limits, dict):
        return None
    five_hour = rate_limits.get('five_hour') or {}
    seven_day = rate_limits.get('seven_day') or {}
    five_hour_label = quota_remaining_label(five_hour.get('used_percentage')) if isinstance(five_hour, dict) else None
    five_hour_reset = None
    if isinstance(five_hour, dict):
        five_hour_reset = (
            reset_time_label_from_epoch_seconds(five_hour.get('resets_at') or five_hour.get('reset_at'))
            or reset_time_label_from_iso(five_hour.get('resets_at') or five_hour.get('reset_at'))
        )
    weekly_label = quota_remaining_label(seven_day.get('used_percentage')) if isinstance(seven_day, dict) else None
    if not five_hour_label and not weekly_label:
        return None
    return {
        'provider': 'anthropic',
        'model': model_name,
        'fiveHour': five_hour_label,
        'fiveHourReset': five_hour_reset,
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

def minimax_base_url():
    for env_key in ('CALDER_MINIMAX_BASE_URL', 'MINIMAX_BASE_URL', 'ANTHROPIC_BASE_URL'):
        value = os.environ.get(env_key, '').strip()
        if not value:
            continue
        if env_key == 'ANTHROPIC_BASE_URL' and 'minimax' not in value.lower():
            continue
        parsed = urllib.parse.urlparse(value)
        if parsed.scheme and parsed.netloc:
            return parsed.scheme + '://' + parsed.netloc
    return 'https://api.minimax.io'

def minimax_quota_url():
    override = os.environ.get('CALDER_MINIMAX_QUOTA_REMAINS_URL', '').strip()
    if override:
        return override
    return minimax_base_url().rstrip('/') + '/v1/api/openplatform/coding_plan/remains'

def minimax_auth_token():
    for env_key in ('CALDER_MINIMAX_AUTH_TOKEN', 'MINIMAX_API_KEY'):
        value = os.environ.get(env_key, '').strip()
        if not value:
            continue
        return value if value.lower().startswith('bearer ') else 'Bearer ' + value
    anthropic_token = os.environ.get('ANTHROPIC_AUTH_TOKEN', '').strip()
    anthropic_base = os.environ.get('ANTHROPIC_BASE_URL', '').strip().lower()
    if anthropic_token and 'minimax' in anthropic_base:
        return anthropic_token if anthropic_token.lower().startswith('bearer ') else 'Bearer ' + anthropic_token
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
        five_hour_reset = None
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
                    five_hour_reset = reset_time_label_from_ms(item.get('nextResetTime'))
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
            'fiveHourReset': five_hour_reset,
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

def minimax_remains_entry(entries, model_name):
    if not isinstance(entries, list):
        return None
    normalized_model = str(model_name or '').strip().lower()
    exact_match = None
    wildcard_match = None
    for item in entries:
        if not isinstance(item, dict):
            continue
        item_name = str(item.get('model_name') or '').strip()
        if not item_name:
            continue
        lowered = item_name.lower()
        if lowered == normalized_model:
            exact_match = item
            break
        if normalized_model.startswith('minimax-m') and lowered == 'minimax-m*':
            wildcard_match = item
    return exact_match or wildcard_match

def minimax_quota_snapshot(model_name):
    auth_token = minimax_auth_token()
    quota_url = minimax_quota_url()
    if not auth_token or not quota_url:
        return fallback_snapshot('minimax', model_name)
    try:
        response = fetch_json(quota_url, auth_token)
        if not isinstance(response, dict):
            response = {}
        base_resp = response.get('base_resp')
        if isinstance(base_resp, dict) and numeric_value(base_resp.get('status_code')) not in (None, 0):
            return {
                **fallback_snapshot('minimax', model_name),
                'status': 'unknown',
                'source': 'minimax:remains-error',
                'message': str(base_resp.get('status_msg') or 'MiniMax remains endpoint returned an error'),
            }
        entry = minimax_remains_entry(response.get('model_remains'), model_name)
        if not isinstance(entry, dict):
            return {
                **fallback_snapshot('minimax', model_name),
                'status': 'unknown',
                'source': 'minimax:remains-empty',
                'message': 'MiniMax remains endpoint returned no recognizable quota entry',
            }
        five_hour = count_remaining_label(
            entry.get('current_interval_usage_count'),
            entry.get('current_interval_total_count'),
        )
        five_hour_reset = reset_time_label_from_ms(entry.get('end_time'))
        weekly = count_remaining_label(
            entry.get('current_weekly_usage_count'),
            entry.get('current_weekly_total_count'),
        )
        if not five_hour and not weekly:
            return {
                **fallback_snapshot('minimax', model_name),
                'status': 'unknown',
                'source': 'minimax:remains-empty',
                'message': 'MiniMax remains entry did not include usable quotas',
            }
        return {
            'provider': 'minimax',
            'model': model_name,
            'fiveHour': five_hour,
            'fiveHourReset': five_hour_reset,
            'weekly': weekly,
            'weeklyLabel': 'Week',
            'status': 'unknown',
            'updatedAt': int(time.time() * 1000),
            'source': 'minimax:remains',
        }
    except Exception:
        return {
            **fallback_snapshot('minimax', model_name),
            'status': 'syncing',
            'source': 'minimax:remains-error',
            'message': 'MiniMax quota refresh failed',
        }

def render_statusline(payload):
    sid = os.environ.get('CLAUDE_IDE_SESSION_ID', '') or os.environ.get('CALDER_SESSION_ID', '')
    model_name = derive_model_name(payload)
    lower_model_name = model_name.lower()
    if lower_model_name.startswith('glm-'):
        provider = 'zai'
        provider_label = 'Z.ai'
    elif lower_model_name.startswith('minimax-'):
        provider = 'minimax'
        provider_label = 'MiniMax'
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
        if provider == 'zai' or provider == 'minimax':
            spawn_refresh(provider, model_name)
        snapshot = fallback_snapshot(provider, model_name)
    elif (provider == 'zai' or provider == 'minimax') and (snapshot.get('status') == 'syncing' or snapshot_is_stale(snapshot)):
        spawn_refresh(provider, model_name)
    ctx_percent = context_percent(ctx)
    freshness = 'Syncing' if snapshot.get('status') == 'syncing' else 'Live'
    cwd_label = latest_cwd_label(sid, payload)
    five_hour_label = snapshot.get('fiveHour') or snapshot['status']
    five_hour_display = quota_with_reset_label(five_hour_label, snapshot.get('fiveHourReset'))
    weekly_name = snapshot.get('weeklyLabel') or 'Week'
    weekly_value = snapshot.get('weekly') or snapshot['status']
    quota_parts = [f"5h {five_hour_display}"]
    if provider != 'zai':
        quota_parts.append(f"{weekly_name} {weekly_value}")
    return '\\n'.join([
        f"{model_name or 'Unknown Model'}  {provider_label}  --  {cwd_label}",
        '  '.join([f"Ctx {ctx_percent}%", f"Cost {cost_label(cost)}"] + quota_parts + [freshness]),
    ])

def refresh_provider_cache(provider, model_name):
    if provider == 'zai':
        snapshot = zai_quota_snapshot(model_name)
    elif provider == 'minimax':
        snapshot = minimax_quota_snapshot(model_name)
    else:
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
