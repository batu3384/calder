export const STATUSLINE_PYTHON_TEMPLATE_PART_3 = `def infer_provider_from_model_name(model_name):
    text = str(model_name or '').strip().lower()
    if not text:
        return ''
    if text.startswith('glm-') or 'glm-' in text:
        return 'zai'
    if text.startswith('minimax-') or 'minimax-' in text or text.startswith('codex-minimax-') or ' minimax-' in text:
        return 'minimax'
    if text.startswith('qwen') or 'qwen-' in text:
        return 'qwen'
    if text in ('haiku', 'sonnet', 'opus') or text.startswith('claude-'):
        return 'anthropic'
    return ''

def read_provider_sync(session_id):
    if not isinstance(session_id, str) or not session_id:
        return ('', '')
    sync_path = os.path.join(STATUS_DIR, session_id + '.provider_sync.json')
    try:
        with open(sync_path, 'r') as f:
            payload = json.load(f)
        if not isinstance(payload, dict):
            return ('', '')
        provider = str(payload.get('main_provider_family') or payload.get('main_provider') or '').strip().lower()
        model = str(payload.get('main_model_exact') or payload.get('model') or '').strip()
        if provider not in ('anthropic', 'zai', 'minimax', 'qwen'):
            provider = infer_provider_from_model_name(model)
        return (provider, model)
    except Exception:
        return ('', '')

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
`;
