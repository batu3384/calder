export const STATUSLINE_PYTHON_TEMPLATE_PART_4 = `        value = os.environ.get(env_key, '').strip()
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
    for env_key in ('CALDER_ZAI_AUTH_TOKEN', 'ZAI_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_API_KEY'):
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
    return minimax_base_url().rstrip('/') + '/v1/token_plan/remains'

def minimax_quota_urls():
    override = os.environ.get('CALDER_MINIMAX_QUOTA_REMAINS_URL', '').strip()
    if override:
        return [override]
    base = minimax_base_url().rstrip('/')
    return [
        base + '/v1/token_plan/remains',
        base + '/v1/api/openplatform/coding_plan/remains',
    ]

def minimax_auth_token():
    for env_key in ('CALDER_MINIMAX_AUTH_TOKEN', 'MINIMAX_API_KEY'):
        value = os.environ.get(env_key, '').strip()
        if not value:
            continue
        return value if value.lower().startswith('bearer ') else 'Bearer ' + value
    anthropic_token = os.environ.get('ANTHROPIC_AUTH_TOKEN', '').strip() or os.environ.get('ANTHROPIC_API_KEY', '').strip()
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
        if isinstance(limits, dict):
            limits = list(limits.values())
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
`;
