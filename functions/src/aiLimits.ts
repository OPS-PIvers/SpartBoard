import { isAiIntegrationId, type AiIntegrationId } from './aiIntegrations';
import type { AiTier } from './aiModels';

// Mirrored in config/aiLimits.ts (aiLimitsParity test).
export const DEFAULT_MAX_INPUT_CHARS = 50_000;
export const INPUT_CHARS_DEFAULTS: Partial<Record<AiIntegrationId, number>> = {
  'mini-app': 200_000,
};
export const MIN_INPUT_CHARS = 1_000;
export const MAX_INPUT_CHARS = 1_000_000;
export const MIN_OUTPUT_TOKENS = 1_000;
export const MAX_OUTPUT_TOKENS = 64_000;
export const CLAUDE_OUTPUT_TOKENS_DEFAULTS: Record<AiTier, number> = {
  advanced: 32_000,
  standard: 16_000,
};

/** Integrations whose typed prompt goes through generateWithAI's input-size check. */
export const PROMPT_LIMITED_INTEGRATIONS: readonly AiIntegrationId[] = [
  'mini-app',
  'poll',
  'dashboard-layout',
  'instructional-routine',
  'quiz',
  'ocr',
  'blooms-ai',
  'video-activity-recommend',
];

export interface AiIntegrationLimits {
  maxInputChars?: number;
  maxOutputTokens?: number;
}

const bounded = (raw: unknown, min: number, max: number): number | undefined =>
  typeof raw === 'number' && Number.isFinite(raw)
    ? Math.min(max, Math.max(min, Math.round(raw)))
    : undefined;

/** Admin-saved limits for known integrations, clamped to the allowed range. */
export function parseIntegrationLimits(
  raw: unknown
): Partial<Record<AiIntegrationId, AiIntegrationLimits>> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Partial<Record<AiIntegrationId, AiIntegrationLimits>> = {};
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!isAiIntegrationId(id) || !value || typeof value !== 'object') continue;
    const v = value as Record<string, unknown>;
    const limits: AiIntegrationLimits = {};
    const input = bounded(v.maxInputChars, MIN_INPUT_CHARS, MAX_INPUT_CHARS);
    const output = bounded(
      v.maxOutputTokens,
      MIN_OUTPUT_TOKENS,
      MAX_OUTPUT_TOKENS
    );
    if (input !== undefined) limits.maxInputChars = input;
    if (output !== undefined) limits.maxOutputTokens = output;
    if (Object.keys(limits).length > 0) out[id] = limits;
  }
  return out;
}

/** The saved input limit, else the integration's default. */
export const maxInputCharsFor = (
  id: AiIntegrationId,
  limits: Partial<Record<AiIntegrationId, AiIntegrationLimits>>
): number =>
  limits[id]?.maxInputChars ??
  INPUT_CHARS_DEFAULTS[id] ??
  DEFAULT_MAX_INPUT_CHARS;
