// Transcribes one scanned page of handwritten paper answers with Gemini (plan D24).
import * as admin from 'firebase-admin';
import { Type, type Part, type Schema } from '@google/genai';
import { parseGeminiJson } from './parseGeminiJson';
import {
  normalizeModelTier,
  type PaperModelTier,
} from './paperHandwritingQuota';

export const ILLEGIBLE_MARK = '[illegible]';
export const MAX_TRANSCRIPT_CHARS = 20000;

export interface PaperTranscribeBox {
  questionId: string;
  storagePath: string;
}

export interface PaperCropImage {
  data: Buffer;
  mimeType: string;
}

export interface PaperTranscribeDeps {
  loadCrop: (storagePath: string) => Promise<PaperCropImage>;
  resolveModel: (tier: PaperModelTier) => Promise<string>;
  generate: (request: {
    model: string;
    parts: Part[];
    schema: Schema;
  }) => Promise<string>;
}

export type PaperBoxTranscript =
  | {
      questionId: string;
      ok: true;
      rawTranscript: string;
      html: string;
      uncertainSpans: { start: number; end: number }[];
      illegibleCount: number;
    }
  | { questionId: string; ok: false; error: string };

export interface PaperPageTranscript {
  model: string;
  boxes: PaperBoxTranscript[];
}

export function modelForTier(
  tier: unknown,
  models: { standardModel: string; advancedModel: string }
): string {
  return normalizeModelTier(tier) === 'advanced'
    ? models.advancedModel
    : models.standardModel;
}

export function buildTranscribeResponseSchema(): Schema {
  return {
    type: Type.OBJECT,
    properties: {
      boxes: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            questionId: { type: Type.STRING },
            text: { type: Type.STRING },
            uncertainSpans: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            illegible: { type: Type.BOOLEAN },
          },
          required: ['questionId', 'text', 'uncertainSpans', 'illegible'],
        },
      },
    },
    required: ['boxes'],
  };
}

export const TRANSCRIBE_PROMPT = `You are transcribing a student's handwritten answers from a scanned paper quiz. Each image that follows is one answer box, introduced by its questionId.

For every box, return one entry with that questionId:
- text: the words exactly as written. Keep the student's spelling, grammar and punctuation. Never correct, complete, summarize or improve anything. Separate paragraphs with a blank line; join lines that only wrap on the ruled paper.
- Write ${ILLEGIBLE_MARK} in place of any word you cannot read. Do not guess.
- uncertainSpans: each word or short phrase in text you are unsure of, copied exactly as it appears in text, in order.
- illegible: true only when nothing in the box can be read.
- Ignore printed rule lines, box borders and stray marks. If the box is empty, return empty text.`;

export function buildTranscribeParts(
  boxes: { questionId: string; image: PaperCropImage }[]
): Part[] {
  const parts: Part[] = [{ text: TRANSCRIBE_PROMPT }];
  for (const box of boxes) {
    parts.push({ text: `questionId: ${box.questionId}` });
    parts.push({
      inlineData: {
        mimeType: box.image.mimeType,
        data: box.image.data.toString('base64'),
      },
    });
  }
  return parts;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Model text normalized for storage: no control characters, `\n` line ends, capped length. */
export function normalizeTranscript(text: string): string {
  return (
    text
      .replace(/\r\n?/g, '\n')
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
      .trim()
      .slice(0, MAX_TRANSCRIPT_CHARS)
  );
}

/** One `<p>` per paragraph, everything escaped; `''` for an empty transcript. */
export function transcriptToHtml(text: string): string {
  return normalizeTranscript(text)
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
    .filter((p) => p.length > 0)
    .map((p) => `<p>${escapeHtml(p)}</p>`)
    .join('');
}

export function countIllegible(text: string): number {
  return text.split(ILLEGIBLE_MARK).length - 1;
}

/** Locates each phrase in order; phrases not found or overlapping an earlier one are dropped. */
export function locateUncertainSpans(
  text: string,
  phrases: unknown
): { start: number; end: number }[] {
  if (!Array.isArray(phrases)) return [];
  const spans: { start: number; end: number }[] = [];
  let from = 0;
  for (const phrase of phrases) {
    if (typeof phrase !== 'string') continue;
    const needle = phrase.trim();
    if (!needle) continue;
    let start = text.indexOf(needle, from);
    if (start < 0) start = text.indexOf(needle);
    if (start < 0) continue;
    const end = start + needle.length;
    if (spans.some((s) => start < s.end && end > s.start)) continue;
    spans.push({ start, end });
    from = end;
  }
  return spans.sort((a, b) => a.start - b.start);
}

/** Results in `questionIds` order; a missing box or unparseable reply fails that box, never throws. */
export function parseTranscribeResponse(
  raw: string,
  questionIds: string[]
): PaperBoxTranscript[] {
  let entries: unknown[] = [];
  let error = 'missing from the model reply';
  try {
    const parsed = parseGeminiJson<{ boxes?: unknown }>(raw);
    if (Array.isArray(parsed?.boxes)) entries = parsed.boxes;
    else error = 'model reply had no boxes';
  } catch {
    error = 'unparseable model reply';
  }
  const byId = new Map<string, Record<string, unknown>>();
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    if (typeof e.questionId !== 'string' || byId.has(e.questionId)) continue;
    byId.set(e.questionId, e);
  }
  return questionIds.map((questionId): PaperBoxTranscript => {
    const e = byId.get(questionId);
    if (!e || typeof e.text !== 'string')
      return { questionId, ok: false, error };
    const rawTranscript = normalizeTranscript(e.text);
    const marks = countIllegible(rawTranscript);
    return {
      questionId,
      ok: true,
      rawTranscript,
      html: transcriptToHtml(rawTranscript),
      uncertainSpans: locateUncertainSpans(rawTranscript, e.uncertainSpans),
      illegibleCount: e.illegible === true ? Math.max(1, marks) : marks,
    };
  });
}

export async function transcribePaperPage(
  boxes: PaperTranscribeBox[],
  tier: PaperModelTier,
  deps: PaperTranscribeDeps
): Promise<PaperPageTranscript> {
  const [model, images] = await Promise.all([
    deps.resolveModel(tier),
    Promise.all(boxes.map((b) => deps.loadCrop(b.storagePath))),
  ]);
  const raw = await deps.generate({
    model,
    parts: buildTranscribeParts(
      boxes.map((b, i) => ({ questionId: b.questionId, image: images[i] }))
    ),
    schema: buildTranscribeResponseSchema(),
  });
  return {
    model,
    boxes: parseTranscribeResponse(
      raw,
      boxes.map((b) => b.questionId)
    ),
  };
}

// ── Default deps ───────────────────────────────────────────────────────────

export function cropMimeType(storagePath: string): string {
  return storagePath.toLowerCase().endsWith('.png')
    ? 'image/png'
    : 'image/webp';
}

export function buildDefaultPaperTranscribeDeps(): PaperTranscribeDeps {
  return {
    loadCrop: async (storagePath) => {
      const [data] = await admin
        .storage()
        .bucket()
        .file(storagePath)
        .download();
      return { data, mimeType: cropMimeType(storagePath) };
    },
    resolveModel: async (tier) => {
      const ai = await import('./aiGeneration');
      return modelForTier(
        tier,
        await ai.getGeminiModelConfig(admin.firestore())
      );
    },
    generate: async ({ model, parts, schema }) => {
      const [{ GoogleGenAI }, ai] = await Promise.all([
        import('@google/genai'),
        import('./aiGeneration'),
      ]);
      const client = new GoogleGenAI(ai.vertexClientOptions());
      const result = await client.models.generateContent({
        model,
        contents: [{ role: 'user', parts }],
        config: {
          temperature: 0,
          responseMimeType: 'application/json',
          responseSchema: schema,
        },
      });
      return result.text ?? '';
    },
  };
}
