import { KNOWN_GEMINI_MODELS } from '@/config/geminiModels';

export type AiProvider = 'gemini' | 'claude';

// Must match functions/src/aiModelConfig.ts (tests/config/aiIntegrationsParity.test.ts).
export const DEFAULT_ADVANCED_MODEL = 'gemini-3.7-flash';
export const DEFAULT_STANDARD_MODEL = 'gemini-3.5-flash-lite';
export type AiInputKind = 'text' | 'image' | 'pdf' | 'docx' | 'audio' | 'video';

export interface AiModelOption {
  id: string;
  label: string;
  provider: AiProvider;
  /** USD per million input / output tokens. */
  price?: { input: number; output: number };
  /** A scheduled list-price change, applied to usage on or after `from` (YYYY-MM-DD). */
  priceChange?: { from: string; input: number; output: number };
  note?: string;
}

// Anthropic first-party prices, checked 2026-10-10. Keep ids in sync with CLAUDE_MODEL_IDS in functions/src/aiModels.ts.
export const CLAUDE_MODELS: readonly AiModelOption[] = [
  {
    id: 'claude-sonnet-5-5',
    label: 'Claude Sonnet 5.5',
    provider: 'claude',
    price: { input: 2, output: 10 },
    note: 'Fast, strong all-rounder',
  },
  {
    id: 'claude-opus-5-5',
    label: 'Claude Opus 5.5',
    provider: 'claude',
    price: { input: 4, output: 20 },
    note: 'Smartest everyday Claude; slower',
  },
  {
    id: 'claude-haiku-5-5',
    label: 'Claude Haiku 5.5',
    provider: 'claude',
    price: { input: 0.1, output: 0.5 },
    note: 'Fastest and cheapest; prompts over 100K tokens cost 5x',
  },
  {
    id: 'claude-fable-5-1',
    label: 'Claude Fable 5.1',
    provider: 'claude',
    price: { input: 10, output: 50 },
    note: 'Most capable; slowest and priciest',
  },
];

// Google list prices for text, image and video input, checked 2026-10-12; 3.7/3.8 Flash are introductory until 2027.
const GEMINI_PRICES: Record<
  string,
  Pick<AiModelOption, 'price' | 'priceChange'>
> = {
  'gemini-3.8-flash': {
    price: { input: 0.75, output: 3.75 },
    priceChange: { from: '2027-01-01', input: 1.5, output: 7.5 },
  },
  'gemini-3.7-flash': {
    price: { input: 0.75, output: 3.75 },
    priceChange: { from: '2027-01-01', input: 1.5, output: 7.5 },
  },
  'gemini-3.5-flash-lite': { price: { input: 0.3, output: 2.5 } },
  'gemini-2.5-flash': { price: { input: 0.3, output: 2.5 } },
  'gemini-2.5-flash-lite': { price: { input: 0.1, output: 0.4 } },
};

export const GEMINI_MODEL_OPTIONS: readonly AiModelOption[] =
  KNOWN_GEMINI_MODELS.map((m) => ({
    id: m.value,
    label: m.label,
    provider: 'gemini' as const,
    ...GEMINI_PRICES[m.value],
    note: 'Billed through Google Cloud',
  }));

export const AI_MODEL_OPTIONS: readonly AiModelOption[] = [
  ...GEMINI_MODEL_OPTIONS,
  ...CLAUDE_MODELS,
];

export const providerOf = (model: string): AiProvider =>
  model.startsWith('claude-') ? 'claude' : 'gemini';

const CLAUDE_INPUTS: readonly AiInputKind[] = ['text', 'image', 'pdf'];

/** Gemini reads every input; Claude reads text, images and PDFs, and a Word file falls back to Gemini on the server. */
export const modelReadsInputs = (
  model: string,
  inputs: readonly AiInputKind[]
): boolean =>
  providerOf(model) === 'gemini' ||
  inputs.every((kind) => kind === 'docx' || CLAUDE_INPUTS.includes(kind));

export const aiModelLabel = (model: string): string =>
  AI_MODEL_OPTIONS.find((m) => m.id === model)?.label ?? model;

/** List price for a model on a usage date, or undefined for an unknown model. */
export const modelPriceOn = (
  model: string,
  date: string
): { input: number; output: number } | undefined => {
  const option = AI_MODEL_OPTIONS.find((m) => m.id === model);
  if (option?.priceChange && date >= option.priceChange.from)
    return option.priceChange;
  return option?.price;
};

/** Estimated USD for a day's tokens on one model, from list prices. */
export const estimateAiCost = (
  model: string,
  date: string,
  inputTokens: number,
  outputTokens: number
): number => {
  const price = modelPriceOn(model, date);
  return price
    ? (inputTokens * price.input + outputTokens * price.output) / 1_000_000
    : 0;
};
