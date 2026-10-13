import type { AiTier } from '@/config/aiIntegrations';

// Mirrors functions/src/aiLimits.ts (aiIntegrationsParity test).
export const DEFAULT_MAX_INPUT_CHARS = 50_000;
export const INPUT_CHARS_DEFAULTS: Readonly<Record<string, number>> = {
  'mini-app': 200_000,
};
export const MIN_INPUT_CHARS = 1_000;
export const MAX_INPUT_CHARS = 1_000_000;
export const MIN_OUTPUT_TOKENS = 1_000;
export const MAX_OUTPUT_TOKENS = 64_000;
export const CLAUDE_OUTPUT_TOKENS_DEFAULTS: Readonly<Record<AiTier, number>> = {
  advanced: 32_000,
  standard: 16_000,
};

/** Integrations whose typed prompt has an input limit. */
export const PROMPT_LIMITED_INTEGRATIONS: readonly string[] = [
  'mini-app',
  'poll',
  'dashboard-layout',
  'instructional-routine',
  'quiz',
  'ocr',
  'blooms-ai',
  'video-activity-recommend',
];

export const defaultInputChars = (id: string): number =>
  INPUT_CHARS_DEFAULTS[id] ?? DEFAULT_MAX_INPUT_CHARS;
