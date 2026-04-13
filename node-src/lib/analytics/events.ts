export const AnalyticsEvent = {
  CLI_STORYBOOK_BUILD_FAILED: 'CLI_STORYBOOK_BUILD_FAILED',
} as const;

export type AnalyticsEvent = (typeof AnalyticsEvent)[keyof typeof AnalyticsEvent];
