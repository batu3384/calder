import * as sessionInsightsModule from '../../session-insights.js';

type SessionInsightsModule = typeof sessionInsightsModule;
const sessionInsights = sessionInsightsModule as SessionInsightsModule;

export const onAlert: SessionInsightsModule['onAlert'] = (...args) =>
  sessionInsights.onAlert(...args);
export const dismissInsight: SessionInsightsModule['dismissInsight'] = (...args) =>
  sessionInsights.dismissInsight(...args);
export const markFreshSession: SessionInsightsModule['markFreshSession'] = (...args) =>
  sessionInsights.markFreshSession(...args);
