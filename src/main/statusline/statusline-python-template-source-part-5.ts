export const STATUSLINE_PYTHON_TEMPLATE_PART_5 = `            **fallback_snapshot('zai', model_name),
            'status': 'syncing',
            'source': 'zai:quota-limit-error',
            'message': 'Z.ai quota refresh failed',
        }

def minimax_remains_entry(entries, model_name):
    if isinstance(entries, dict):
        entries = list(entries.values())
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
    if exact_match or wildcard_match:
        return exact_match or wildcard_match
    normalized_family = normalized_model.replace('-highspeed', '')
    family_match = None
    for item in entries:
        if not isinstance(item, dict):
            continue
        item_name = str(item.get('model_name') or '').strip().lower()
        if not item_name:
            continue
        item_family = item_name.replace('-highspeed', '')
        if item_family == normalized_family:
            family_match = item
            break
    return family_match

def minimax_usage_field_mode(quota_url):
    override = os.environ.get('CALDER_MINIMAX_USAGE_FIELD_MODE', '').strip().lower()
    if override in ('remaining', 'used'):
        return override
    if isinstance(quota_url, str) and '/v1/token_plan/remains' in quota_url:
        # Official Token Plan endpoint exposes "usage_count" fields that represent
        # remaining request budget despite legacy naming.
        return 'remaining'
    # Legacy coding_plan endpoint reports used counts in "usage_count" fields.
    return 'used'

def minimax_count_label(entry, scope, usage_mode):
    if not isinstance(entry, dict):
        return None
    total = numeric_value(entry.get(scope + '_total_count') if entry.get(scope + '_total_count') is not None else entry.get(scope + 'TotalCount'))
    if total is None or total <= 0:
        return None

    remaining = numeric_value(
        entry.get(scope + '_remaining_count')
        if entry.get(scope + '_remaining_count') is not None
        else entry.get(scope + '_remains_count')
    )
    if remaining is None:
        remaining = numeric_value(
            entry.get(scope + 'RemainingCount')
            if entry.get(scope + 'RemainingCount') is not None
            else entry.get(scope + 'RemainsCount')
        )

    if remaining is None:
        used = numeric_value(entry.get(scope + '_used_count') if entry.get(scope + '_used_count') is not None else entry.get(scope + 'UsedCount'))
        if used is not None:
            remaining = max(0.0, total - used)

    if remaining is None:
        usage = numeric_value(entry.get(scope + '_usage_count') if entry.get(scope + '_usage_count') is not None else entry.get(scope + 'UsageCount'))
        if usage is None:
            return None
        if usage_mode == 'remaining':
            remaining = usage
        else:
            remaining = max(0.0, total - usage)

    bounded_remaining = max(0.0, min(total, remaining))
    return str(int(round(bounded_remaining))) + '/' + str(int(round(total))) + ' left'

def minimax_quota_snapshot(model_name):
    auth_token = minimax_auth_token()
    quota_urls = minimax_quota_urls()
    if not auth_token or not quota_urls:
        return fallback_snapshot('minimax', model_name)
    saw_payload = False
    for quota_url in quota_urls:
        try:
            response = fetch_json(quota_url, auth_token)
        except Exception:
            continue

        usage_mode = minimax_usage_field_mode(quota_url)

        if not isinstance(response, dict):
            response = {}
        saw_payload = True

        payload = response.get('data') if isinstance(response.get('data'), dict) else response
        if not isinstance(payload, dict):
            payload = {}

        base_resp = payload.get('base_resp') if isinstance(payload.get('base_resp'), dict) else None
        if not isinstance(base_resp, dict):
            base_resp = response.get('base_resp') if isinstance(response.get('base_resp'), dict) else None
        if isinstance(base_resp, dict) and numeric_value(base_resp.get('status_code')) not in (None, 0):
            return {
                **fallback_snapshot('minimax', model_name),
                'status': 'unknown',
                'source': 'minimax:remains-error',
                'message': str(base_resp.get('status_msg') or 'MiniMax remains endpoint returned an error'),
            }

        entries = payload.get('model_remains') or payload.get('modelRemains') or payload.get('remains')
        if entries is None:
            entries = response.get('model_remains') or response.get('modelRemains') or response.get('remains')

        entry = minimax_remains_entry(entries, model_name)
        if not isinstance(entry, dict):
            continue

`;
