#!/usr/bin/env node

import { execSync } from 'node:child_process';

const BROWSER_TAB_PREFIX = 'src/renderer/components/browser-tab/';

let output = '';
try {
  execSync('npx tsc -p tsconfig.browser-tab.json --noEmit', {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
} catch (error) {
  output = `${error.stdout ?? ''}${error.stderr ?? ''}`;
}

const browserTabErrors = output
  .split('\n')
  .filter((line) => line.startsWith(BROWSER_TAB_PREFIX) && line.includes('error TS'));

if (browserTabErrors.length > 0) {
  console.error('[typecheck:browser-tab] FAILED\n' + browserTabErrors.join('\n'));
  process.exit(1);
}

const transitiveErrorCount = (output.match(/error TS/g) ?? []).length;
if (transitiveErrorCount > 0) {
  console.warn(
    `[typecheck:browser-tab] PASS — ${transitiveErrorCount} transitive renderer errors outside browser-tab (tracked debt)`,
  );
} else {
  console.log('[typecheck:browser-tab] PASS');
}
