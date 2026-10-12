import { normalizeModelName } from './shared';

export type AiProvider = 'gemini' | 'claude';
export type AiTier = 'advanced' | 'standard';
/** Kinds of input an AI integration sends; Claude reads text, images and PDFs only. */
export type AiInputKind = 'text' | 'image' | 'pdf' | 'docx' | 'audio' | 'video';

// Keep in sync with CLAUDE_MODELS in config/aiModels.ts (tests/config/aiIntegrationsParity.test.ts).
export const CLAUDE_MODEL_IDS = [
  'claude-opus-5-5',
  'claude-sonnet-5-5',
  'claude-haiku-5-5',
  'claude-fable-5-1',
] as const;

export const CLAUDE_INPUTS: readonly AiInputKind[] = ['text', 'image', 'pdf'];

export const providerOf = (model: string): AiProvider =>
  model.startsWith('claude-') ? 'claude' : 'gemini';

/** A current Gemini id or a known Claude id, trimmed; anything else is undefined. */
export function normalizeAiModelId(raw: unknown): string | undefined {
  const gemini = normalizeModelName(raw);
  if (gemini) return gemini;
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  return (CLAUDE_MODEL_IDS as readonly string[]).includes(trimmed)
    ? trimmed
    : undefined;
}

/** Whether a model can read every input kind an integration sends. */
export const modelSupportsInputs = (
  model: string,
  inputs: readonly AiInputKind[]
): boolean =>
  providerOf(model) === 'gemini' ||
  inputs.every((kind) => CLAUDE_INPUTS.includes(kind));
