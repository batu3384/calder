import { isDerivedCost, isEstimatedCost, type CostInfo } from '../session-cost.js';
import type { ContextWindowInfo } from '../session-context.js';

function formatTokens(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(n);
}

export function revealSessionStatusBar(container: HTMLElement): void {
  const bar = container.querySelector('.session-status-bar');
  if (bar) bar.classList.remove('hidden');
}

export function renderCostDisplay(el: Element, cost: CostInfo): void {
  const derived = isDerivedCost(cost);
  const estimated = isEstimatedCost(cost);
  const estimatedPrefix = !estimated
    ? ''
    : derived
      ? 'Derived · '
      : 'Estimated · ';
  const costStr = derived && cost.totalCostUsd <= 0
    ? '--'
    : `$${cost.totalCostUsd.toFixed(4)}`;
  const modelPrefix = cost.model ? `${cost.model}  \u00b7  ` : '';
  if (cost.totalInputTokens > 0 || cost.totalOutputTokens > 0) {
    el.textContent = `${modelPrefix}${estimatedPrefix}${costStr}  \u00b7  ${formatTokens(cost.totalInputTokens)} in / ${formatTokens(cost.totalOutputTokens)} out`;
    const durationSec = (cost.totalDurationMs / 1000).toFixed(1);
    const apiDurationSec = (cost.totalApiDurationMs / 1000).toFixed(1);
    const estimateNote = !estimated
      ? ''
      : derived
        ? 'Derived from hook usage metadata · '
        : 'Estimated from terminal output · ';
    (el as HTMLElement).title = `${estimateNote}Cache read: ${formatTokens(cost.cacheReadTokens)} · Cache create: ${formatTokens(cost.cacheCreationTokens)} · Duration: ${durationSec}s · API: ${apiDurationSec}s`;
    return;
  }

  el.textContent = `${modelPrefix}${estimatedPrefix}${costStr}`;
  (el as HTMLElement).title = !estimated
    ? ''
    : derived
      ? 'Derived from hook usage metadata'
      : 'Estimated from terminal output';
}

export function renderContextDisplay(el: HTMLElement, info: ContextWindowInfo): void {
  const pct = Math.min(Math.round(info.usedPercentage), 100);
  const filledCount = Math.round(pct / 10);
  const emptyCount = 10 - filledCount;
  const bar = '='.repeat(filledCount) + '-'.repeat(emptyCount);
  const tokenStr = formatTokens(info.totalTokens);

  el.textContent = `[${bar}] ${pct}% ${tokenStr} tokens`;
  el.title = `${info.totalTokens.toLocaleString()} / ${info.contextWindowSize.toLocaleString()} tokens`;

  el.classList.remove('warning', 'critical');
  if (pct >= 90) {
    el.classList.add('critical');
  } else if (pct >= 70) {
    el.classList.add('warning');
  }
}
