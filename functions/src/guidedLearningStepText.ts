// Recorder step-text drafting (docs/plans/shipped/GUIDED_LEARNING_STUDIO.md P3-3): request parsing, prompt and output clamping.
import { HttpsError } from 'firebase-functions/v2/https';
import { sanitizePrompt } from './sanitize';

export const STEP_TEXT_MAX_STEPS = 20;
export const STEP_TEXT_MAX_LABEL_WORDS = 4;
export const STEP_TEXT_MAX_TEXT_WORDS = 25;
const MAX_IMAGE_BASE64_CHARS = 1_500_000;
const MAX_FIELD_CHARS = 200;
const MAX_GOAL_CHARS = 300;
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

export interface StepTextInput {
  imageBase64: string;
  mimeType: string;
  anchorLabel: string;
  accessibleName: string;
  action: 'click' | 'observe';
}

export interface StepTextRequest {
  steps: StepTextInput[];
  goal: string;
}

export interface DraftedStepText {
  label: string;
  text: string;
}

const str = (v: unknown, max: number): string =>
  typeof v === 'string' ? v.trim().slice(0, max) : '';

export function parseStepTextRequest(raw: unknown): StepTextRequest {
  const data = (raw ?? {}) as Record<string, unknown>;
  const steps = Array.isArray(data.steps) ? (data.steps as unknown[]) : [];
  if (steps.length === 0)
    throw new HttpsError('invalid-argument', 'At least one step is required.');
  if (steps.length > STEP_TEXT_MAX_STEPS)
    throw new HttpsError(
      'invalid-argument',
      `Draft at most ${STEP_TEXT_MAX_STEPS} steps at a time.`
    );
  return {
    goal: str(data.goal, MAX_GOAL_CHARS),
    steps: steps.map((s) => {
      const step = (s ?? {}) as Record<string, unknown>;
      const imageBase64 =
        typeof step.imageBase64 === 'string' ? step.imageBase64 : '';
      if (!imageBase64 || imageBase64.length > MAX_IMAGE_BASE64_CHARS)
        throw new HttpsError(
          'invalid-argument',
          'Every step needs an image under 1 MB.'
        );
      const mimeType = str(step.mimeType, 40) || 'image/png';
      if (!IMAGE_TYPES.has(mimeType))
        throw new HttpsError('invalid-argument', 'Unsupported image type.');
      return {
        imageBase64,
        mimeType,
        anchorLabel: str(step.anchorLabel, MAX_FIELD_CHARS),
        accessibleName: str(step.accessibleName, MAX_FIELD_CHARS),
        action: step.action === 'observe' ? 'observe' : 'click',
      };
    }),
  };
}

export const STEP_TEXT_SYSTEM_INSTRUCTION = `You write the words for a click-by-click software walkthrough that teachers follow on a classroom dashboard.
Each step comes with a cropped screenshot of the control, its name and whether the learner clicks it or just looks at it.

Return ONLY valid JSON: {"steps": [{"label": "string", "text": "string"}]} with exactly one entry per input step, in order.

Rules:
- label: 1 to 4 words naming the control (for example "Import button").
- text: one or two sentences, 25 words at most, second person.
- Imperative voice for click steps ("Click Import to add your file."), declarative for look steps ("The timeline lists every step.").
- Plain words. No "Let's", "Simply", "Just", "Now", "Great", "Notice", "explore", "journey", no exclamation marks, no em-dashes, no questions.
- Never mention the screenshot, the tour or step numbers.`;

type Part = { text?: string; inlineData?: { mimeType: string; data: string } };

export function buildStepTextParts(request: StepTextRequest): Part[] {
  const parts: Part[] = [
    {
      text: request.goal
        ? `Goal of the walkthrough: ${sanitizePrompt(request.goal)}`
        : 'Write the walkthrough text for these steps.',
    },
  ];
  request.steps.forEach((step, i) => {
    const name = sanitizePrompt(step.accessibleName || step.anchorLabel);
    parts.push({
      text: `Step ${i + 1}: ${step.action === 'observe' ? 'look at' : 'click'} "${name || 'unnamed control'}"${
        step.anchorLabel && step.anchorLabel !== step.accessibleName
          ? ` (${sanitizePrompt(step.anchorLabel)})`
          : ''
      }`,
    });
    parts.push({
      inlineData: { mimeType: step.mimeType, data: step.imageBase64 },
    });
  });
  return parts;
}

const words = (s: string) => s.split(/\s+/).filter(Boolean);

const tidy = (s: string) =>
  s
    .replace(/\s*[—–]\s*/g, ', ')
    .replace(/!+/g, '.')
    .replace(/\s+/g, ' ')
    .trim();

/** Holds a drafted step to the writing rules' lengths, whatever the model returned. */
export function clampStepText(raw: unknown): DraftedStepText {
  const step = (raw ?? {}) as Record<string, unknown>;
  const label = words(
    tidy(typeof step.label === 'string' ? step.label : '').replace(
      /[.,;:]+$/,
      ''
    )
  )
    .slice(0, STEP_TEXT_MAX_LABEL_WORDS)
    .join(' ');
  const all = words(tidy(typeof step.text === 'string' ? step.text : ''));
  let text = all.slice(0, STEP_TEXT_MAX_TEXT_WORDS).join(' ');
  if (all.length > STEP_TEXT_MAX_TEXT_WORDS)
    text = `${text.replace(/[,;:]+$/, '')}.`;
  return { label, text };
}

/** One clamped draft per input step; missing entries come back empty. */
export function clampStepTextResponse(
  parsed: unknown,
  count: number
): DraftedStepText[] {
  const list = Array.isArray((parsed as { steps?: unknown } | null)?.steps)
    ? (parsed as { steps: unknown[] }).steps
    : [];
  return Array.from({ length: count }, (_, i) => clampStepText(list[i]));
}
