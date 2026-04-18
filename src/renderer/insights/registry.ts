import type { InitialContextSnapshot } from '../../shared/types.js';
import type { InsightAnalyzer, InsightResult } from './types.js';
import { bigInitialContext } from './big-initial-context.js';

const BUILT_IN_ANALYZERS: InsightAnalyzer[] = [bigInitialContext];
const analyzers: InsightAnalyzer[] = [...BUILT_IN_ANALYZERS];

export function registerAnalyzer(analyzer: InsightAnalyzer): void {
  analyzers.push(analyzer);
}

export function analyzeInitialContext(snapshot: InitialContextSnapshot): InsightResult[] {
  const results: InsightResult[] = [];
  for (const analyzer of analyzers) {
    results.push(...analyzer.analyze(snapshot));
  }
  return results;
}

/** @internal Test-only helper to reset registry global state. */
export function _resetAnalyzersForTest(): void {
  analyzers.length = 0;
  analyzers.push(...BUILT_IN_ANALYZERS);
}
