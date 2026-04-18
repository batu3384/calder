function fallbackEscapeCssIdentifier(value: string): string {
  if (!value) return '';

  return Array.from(value)
    .map((char, index) => {
      const codePoint = char.codePointAt(0) ?? 0;
      const isControl = (codePoint >= 0x01 && codePoint <= 0x1f) || codePoint === 0x7f;
      if (isControl) return `\\${codePoint.toString(16)} `;

      const isDigit = codePoint >= 0x30 && codePoint <= 0x39;
      const startsWithHyphenDigit = index === 1 && isDigit && value[0] === '-';
      if ((index === 0 && isDigit) || startsWithHyphenDigit) {
        return `\\${codePoint.toString(16)} `;
      }

      if (index === 0 && char === '-' && value.length === 1) return '\\-';

      if (/^[A-Za-z0-9_-]$/.test(char)) return char;
      return `\\${char}`;
    })
    .join('');
}

export function escapeCssIdentifier(value: string): string {
  const cssEscape = (globalThis as { CSS?: { escape?: (input: string) => string } }).CSS?.escape;
  if (typeof cssEscape === 'function') return cssEscape(value);
  return fallbackEscapeCssIdentifier(value);
}

export function escapeCssAttributeValue(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\a ')
    .replace(/\r/g, '\\d ')
    .replace(/\f/g, '\\c ');
}
