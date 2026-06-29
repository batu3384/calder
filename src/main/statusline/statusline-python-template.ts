import {
  DEFAULT_STATUSLINE_STALE_MS,
  fallbackQuotaStatus,
  getProviderQuotaCacheFile,
} from './statusline-format';
import { STATUSLINE_PYTHON_TEMPLATE } from './statusline-python-template-source';

const CONFIG_PLACEHOLDER = '__CALDER_CONFIG_JSON__';
const STATUS_DIR_PLACEHOLDER = '__CALDER_STATUS_DIR__';
const QUOTA_CACHE_FILE_PLACEHOLDER = '__CALDER_ANTHROPIC_QUOTA_CACHE_FILE__';

export function buildStatusLinePythonTemplate(statusDir: string): string {
  const config = JSON.stringify({
    staleAfterMs: DEFAULT_STATUSLINE_STALE_MS,
    anthropicFallback: fallbackQuotaStatus('anthropic'),
    zaiFallback: fallbackQuotaStatus('zai'),
    minimaxFallback: fallbackQuotaStatus('minimax'),
    qwenFallback: fallbackQuotaStatus('qwen'),
  });

  return STATUSLINE_PYTHON_TEMPLATE.replace(CONFIG_PLACEHOLDER, config)
    .replace(STATUS_DIR_PLACEHOLDER, statusDir)
    .replace(QUOTA_CACHE_FILE_PLACEHOLDER, getProviderQuotaCacheFile('anthropic'));
}
