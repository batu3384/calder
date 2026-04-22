export const STATUSLINE_PYTHON_TEMPLATE_PART_2 = `        try:
            os.unlink(lock_path)
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

`;
