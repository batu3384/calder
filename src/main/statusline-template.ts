import { isWin, pythonBin } from './platform';
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
        with open(os.path.join(STATUS_DIR, sid+'.cost'), 'w') as f:
            json.dump({'cost': cost, 'context_window': ctx, 'model': model_name}, f)
    claude_sid = payload.get('session_id', '')
    if sid and claude_sid:
        with open(os.path.join(STATUS_DIR, sid+'.sessionid'), 'w') as f:
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
