import { getMobileCopy } from './copy';
import type { MobileUiLanguage } from './copy';
import { renderHeroPanel } from './page-panel-hero';
import { renderMainPanel } from './page-panel-main';
import { renderMobilePageScript } from './page-script';
import { MOBILE_PAGE_STYLES } from './page-styles';

export function renderMobilePage(pairingId: string, language: MobileUiLanguage): string {
  const copy = getMobileCopy(language);
  return `<!doctype html>
<html lang="${copy.language}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
  <title>${copy.title}</title>
  <style>
${MOBILE_PAGE_STYLES}
  </style>
</head>
<body>
  <main class="shell">
    ${renderHeroPanel(copy)}
    ${renderMainPanel(copy)}
  </main>

  <script>
${renderMobilePageScript(pairingId, copy)}
  </script>
</body>
</html>`;
}
