export const STATUSLINE_PYTHON_TEMPLATE_PART_1 = `import datetime, json, os, subprocess, sys, time, urllib.parse, urllib.request
CONFIG = json.loads(r'''__CALDER_CONFIG_JSON__''')
STATUS_DIR = r'''__CALDER_STATUS_DIR__'''
LEGACY_REFRESH_LOCK = os.path.join(STATUS_DIR, 'statusline.refresh.lock')

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
    return os.path.join(STATUS_DIR, '__CALDER_ANTHROPIC_QUOTA_CACHE_FILE__').replace('anthropic', provider)

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

def refresh_lock_path(provider):
    return os.path.join(STATUS_DIR, 'statusline.refresh.' + str(provider) + '.lock')

def refresh_lock_is_active(provider):
    lock_path = refresh_lock_path(provider)
    if os.path.exists(lock_path):
        try:
            age_ms = int(time.time() * 1000) - int(os.path.getmtime(lock_path) * 1000)
            if age_ms > CONFIG['staleAfterMs']:
                os.unlink(lock_path)
                return False
        except OSError:
            return False
        except Exception:
            pass
        return True
    return False

def clear_refresh_locks(provider):
    for lock_path in (refresh_lock_path(provider), LEGACY_REFRESH_LOCK):
        try:
            os.unlink(lock_path)
        except OSError:
            pass

def clear_stale_legacy_refresh_lock():
    if not os.path.exists(LEGACY_REFRESH_LOCK):
        return
    try:
        age_ms = int(time.time() * 1000) - int(os.path.getmtime(LEGACY_REFRESH_LOCK) * 1000)
        if age_ms > CONFIG['staleAfterMs']:
            os.unlink(LEGACY_REFRESH_LOCK)
    except OSError:
        pass
    except Exception:
        pass

def spawn_refresh(provider, model_name):
    clear_stale_legacy_refresh_lock()
    lock_path = refresh_lock_path(provider)
    if refresh_lock_is_active(provider):
        return
    with open(lock_path, 'w') as f:
        f.write(str(int(time.time() * 1000)))
    try:
        subprocess.Popen(
            [sys.executable, __file__, 'refresh', provider, model_name],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    except Exception:
`;
