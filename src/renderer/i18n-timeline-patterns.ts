import type { PatternTranslation } from './i18n-pattern-translations.js';

type Translate = (value: string) => string;

export function createTimelinePatterns(translate: Translate): PatternTranslation[] {
  return [
    {
      pattern: /^Agent stopped: (.+)$/u,
      replace: (match) => `Ajan durdu: ${match[1]}`,
    },
    {
      pattern: /^Auto-approval (.+): (.+)$/u,
      replace: (match) => `Otomatik onay ${translate(match[1])}: ${translate(match[2])}`,
    },
    {
      pattern: /^(\d+) modules$/u,
      replace: (match) => `${match[1]} modül`,
    },
    {
      pattern: /^Config: (.+)$/u,
      replace: (match) => `Yapılandırma: ${match[1]}`,
    },
    {
      pattern: /^Teammate idle: (.+)$/u,
      replace: (match) => `Ekip arkadaşı boşta: ${match[1]}`,
    },
  ];
}
