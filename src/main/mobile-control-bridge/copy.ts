import * as http from 'node:http';

import { MOBILE_PAGE_COPY } from './copy-data';
import type { MobilePageCopy, MobileUiLanguage } from './copy-types';

export type { MobilePageCopy, MobileUiLanguage } from './copy-types';

export function normalizeMobileLanguage(input: unknown): MobileUiLanguage {
  return input === 'tr' ? 'tr' : 'en';
}

export function getMobileCopy(language: MobileUiLanguage): MobilePageCopy {
  return MOBILE_PAGE_COPY[normalizeMobileLanguage(language)];
}

export function getRequestLanguage(url: URL, req: http.IncomingMessage): MobileUiLanguage {
  if (url.searchParams.get('lang') === 'tr') {
    return 'tr';
  }
  const acceptLanguage = req.headers['accept-language'];
  if (typeof acceptLanguage === 'string' && /\btr\b/i.test(acceptLanguage)) {
    return 'tr';
  }
  if (Array.isArray(acceptLanguage) && acceptLanguage.some((value) => /\btr\b/i.test(value))) {
    return 'tr';
  }
  return 'en';
}
