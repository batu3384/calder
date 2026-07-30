const DEFAULT_PROMPT_LITERAL_MAX_LENGTH = 200;
const DEFAULT_PROMPT_BODY_MAX_LENGTH = 4000;

export function escapePromptLiteral(value: string, maxLength = DEFAULT_PROMPT_LITERAL_MAX_LENGTH): string {
  const truncated =
    value.length > maxLength ? `${value.slice(0, Math.max(0, maxLength - 1))}…` : value;
  return truncated.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r?\n/g, ' ');
}

export function sanitizePromptBody(value: string, maxLength = DEFAULT_PROMPT_BODY_MAX_LENGTH): string {
  return escapePromptLiteral(value, maxLength);
}

export function formatShadowHostClause(shadowHostSelectors?: string[][]): string {
  if (!shadowHostSelectors?.length) return '';
  const hosts = shadowHostSelectors
    .map((options) => options.find((value) => value.trim().length > 0))
    .filter((value): value is string => Boolean(value));
  if (hosts.length === 0) return '';
  return `, shadow: '${escapePromptLiteral(hosts.join(' > '))}'`;
}

export function formatShadowHostStepLine(shadowHostSelectors?: string[][]): string {
  const clause = formatShadowHostClause(shadowHostSelectors);
  return clause ? `\n   ${clause.slice(2)}` : '';
}
