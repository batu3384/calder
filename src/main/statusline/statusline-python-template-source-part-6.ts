export const STATUSLINE_PYTHON_TEMPLATE_PART_6 = `        five_hour = minimax_count_label(entry, 'current_interval', usage_mode)
        five_hour_reset = reset_time_label_from_ms(entry.get('end_time') if entry.get('end_time') is not None else entry.get('endTime'))
        weekly = minimax_count_label(entry, 'current_weekly', usage_mode)

        if not five_hour and not weekly:
            continue

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

    if saw_payload:
        return {
            **fallback_snapshot('minimax', model_name),
            'status': 'unknown',
            'source': 'minimax:remains-empty',
            'message': 'MiniMax remains endpoint returned no recognizable quota entry',
        }

    return {
        **fallback_snapshot('minimax', model_name),
        'status': 'syncing',
        'source': 'minimax:remains-error',
        'message': 'MiniMax quota refresh failed',
    }

def render_statusline(payload):
    sid = os.environ.get('CLAUDE_IDE_SESSION_ID', '') or os.environ.get('CALDER_SESSION_ID', '')
    model_name = derive_model_name(payload)
    sync_provider, sync_model = read_provider_sync(sid)
    display_model_name = model_name or sync_model
    direct_model_provider = infer_provider_from_model_name(model_name)
    sync_model_provider = infer_provider_from_model_name(sync_model)
    provider = sync_provider if sync_provider in ('anthropic', 'zai', 'minimax', 'qwen') else ''
    if direct_model_provider and provider and direct_model_provider != provider:
        # When model changes quickly, provider_sync can lag one render behind.
        # Trust the explicit display model in that conflict window.
        provider = direct_model_provider
    if not provider:
        provider = direct_model_provider or infer_provider_from_model_name(display_model_name) or sync_model_provider
    if provider not in ('anthropic', 'zai', 'minimax', 'qwen'):
        provider = 'anthropic'
    if provider == 'zai':
        provider_label = 'Z.ai'
    elif provider == 'minimax':
        provider_label = 'MiniMax'
    elif provider == 'qwen':
        provider_label = 'Qwen'
    else:
        provider_label = 'Anthropic'
    quota_model_name = display_model_name
    if provider == 'zai' or provider == 'minimax':
        if model_name and infer_provider_from_model_name(model_name) == provider:
            quota_model_name = model_name
        elif sync_model and infer_provider_from_model_name(sync_model) == provider:
            quota_model_name = sync_model
    cost = payload.get('cost', {})
    ctx = payload.get('context_window', {})
    if sid and (cost or ctx or display_model_name):
        with open(os.path.join(STATUS_DIR, sid+'.cost'), 'w') as f:
            json.dump({'cost': cost, 'context_window': ctx, 'model': display_model_name}, f)
    claude_sid = payload.get('session_id', '')
    if sid and claude_sid:
        with open(os.path.join(STATUS_DIR, sid+'.sessionid'), 'w') as f:
            f.write(claude_sid)
    snapshot = anthropic_rate_limit_snapshot(payload, quota_model_name) if provider == 'anthropic' else None
    if snapshot is None and provider != 'qwen':
        snapshot = read_snapshot(provider)
    if snapshot is None:
        if provider == 'zai' or provider == 'minimax':
            spawn_refresh(provider, quota_model_name)
        snapshot = fallback_snapshot(provider, quota_model_name)
    is_stale_snapshot = snapshot_is_stale(snapshot)
    if (provider == 'zai' or provider == 'minimax') and (snapshot.get('status') == 'syncing' or is_stale_snapshot):
        spawn_refresh(provider, quota_model_name)
    ctx_percent = context_percent(ctx)
    freshness = 'Syncing' if snapshot.get('status') == 'syncing' else ('Stale' if is_stale_snapshot else 'Live')
    cwd_label = latest_cwd_label(sid, payload)
    five_hour_label = snapshot.get('fiveHour') or snapshot['status']
    five_hour_display = quota_with_reset_label(five_hour_label, snapshot.get('fiveHourReset'))
    weekly_name = snapshot.get('weeklyLabel') or 'Week'
    weekly_value = snapshot.get('weekly') or snapshot['status']
    quota_parts = [f"5h {five_hour_display}"]
    if provider != 'zai':
        quota_parts.append(f"{weekly_name} {weekly_value}")
    return '\\n'.join([
        f"{display_model_name or 'Unknown Model'}  {provider_label}  --  {cwd_label}",
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
    clear_refresh_locks(provider)
    return snapshot

if __name__ == '__main__':
    mode = sys.argv[1] if len(sys.argv) > 1 else 'render'
    payload = read_payload() if mode == 'render' else {}
    if mode == 'refresh':
        refresh_provider_cache(sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else '')
    else:
        print(render_statusline(payload))`;
