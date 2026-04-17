/**
 * videoActivityImportAdapter — implements `ImportAdapter<VideoActivityData>` for
 * the shared ImportWizard. The parse + validate logic is lifted verbatim from
 * the legacy `components/widgets/VideoActivityWidget/components/Importer.tsx`
 * (pre-Wave-2 implementation): MM:SS → seconds conversion, strictly-increasing
 * timestamp validation, MC answer parsing, per-row time-limit defaulting, etc.
 *
 * The adapter is a factory because two pieces of per-creation context aren't
 * part of the CSV payload itself:
 *   1. `title` + `youtubeUrl` — captured by the Creator's "info" step and
 *      stamped into the `VideoActivityData` object here.
 *   2. `onSave` + optional `generate` / `createTemplateSheet` — provided by
 *      the caller (`Creator.tsx`) so Firestore/Drive writes remain outside
 *      the adapter. Adapters stay pure; persistence is the consumer's job.
 *
 * Consumers:
 *   - Creator.tsx renders `<ImportWizard adapter={...} />` using this factory.
 *   - VideoActivityManager.tsx (future) may also use the adapter for a
 *     direct "Import" CTA if we decide to surface it outside the Creator flow.
 */

import type React from 'react';
import type {
  ImportAdapter,
  ImportParseResult,
  ImportSourcePayload,
  ImportValidationResult,
} from '@/components/common/library/types';
import type { VideoActivityData, VideoActivityQuestion } from '@/types';

/* ─── Parse helpers (lifted from legacy Importer.tsx) ─────────────────────── */

/** Convert MM:SS or M:SS string to total seconds. Returns NaN if invalid. */
export function mmSsToSeconds(value: string): number {
  if (!value) return 0;
  const parts = value.trim().split(':');
  if (parts.length !== 2) return NaN;
  const m = parseInt(parts[0] ?? '0');
  const s = parseInt(parts[1] ?? '0');
  if (isNaN(m) || isNaN(s) || s >= 60) return NaN;
  return m * 60 + s;
}

/** Format seconds as MM:SS (used in the preview list). */
export function secondsToMmSs(seconds: number): string {
  const m = Math.floor(Math.max(0, seconds) / 60);
  const s = Math.floor(Math.max(0, seconds) % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * Lifted from the legacy Importer.tsx `parseCSV` helper. Same quoting rules,
 * same per-row error messages, same "MC" type default.
 */
function parseCsv(content: string): VideoActivityQuestion[] {
  const lines = content.split(/\r?\n/).filter((line) => line.trim() !== '');
  if (lines.length === 0) throw new Error('CSV is empty');

  return lines.map((line, index) => {
    // Simple CSV split (handles quotes roughly)
    const parts = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);

    const timestampStr = parts[0]?.replace(/^"|"$/g, '').trim() || '00:00';
    const text = parts[1]?.replace(/^"|"$/g, '').trim() || '';
    const correctAnswer = parts[2]?.replace(/^"|"$/g, '').trim() || '';
    const incorrect1 = parts[3]?.replace(/^"|"$/g, '').trim() || '';
    const incorrect2 = parts[4]?.replace(/^"|"$/g, '').trim() || '';
    const incorrect3 = parts[5]?.replace(/^"|"$/g, '').trim() || '';
    const timeLimit = parseInt(parts[6]?.replace(/^"|"$/g, '') || '30');

    const timestamp = mmSsToSeconds(timestampStr);
    if (isNaN(timestamp)) {
      throw new Error(
        `Invalid timestamp format on line ${index + 1}: ${timestampStr}. Use MM:SS.`
      );
    }

    if (!text || !correctAnswer) {
      throw new Error(
        `Missing question text or correct answer on line ${index + 1}`
      );
    }

    const incorrectAnswers = [incorrect1, incorrect2, incorrect3].filter(
      (a) => a !== ''
    );

    return {
      id: crypto.randomUUID(),
      timestamp,
      text,
      type: 'MC',
      correctAnswer,
      incorrectAnswers,
      timeLimit: isNaN(timeLimit) ? 30 : timeLimit,
    } as VideoActivityQuestion;
  });
}

/* ─── Validation (strictly-increasing timestamps) ─────────────────────────── */

/**
 * Validates parsed question list. Mirrors the legacy invariants:
 *   - at least one question
 *   - timestamps strictly increasing
 *   - each question has text + correctAnswer (re-checked post-parse in case
 *     the data arrived via a non-CSV source like `aiAssist`)
 */
export function validateVideoActivityData(
  data: VideoActivityData
): ImportValidationResult {
  const errors: string[] = [];
  const { questions } = data;

  if (questions.length === 0) {
    errors.push('No questions found. Add at least one row.');
    return { ok: false, errors };
  }

  let lastTs = -Infinity;
  questions.forEach((q, i) => {
    if (!q.text) errors.push(`Question ${i + 1}: missing question text.`);
    if (!q.correctAnswer)
      errors.push(`Question ${i + 1}: missing correct answer.`);
    if (q.timestamp <= lastTs) {
      errors.push(
        `Question ${i + 1}: timestamp ${secondsToMmSs(q.timestamp)} is not after the previous question's timestamp.`
      );
    }
    lastTs = q.timestamp;
  });

  return { ok: errors.length === 0, errors };
}

/* ─── Adapter factory ─────────────────────────────────────────────────────── */

export interface VideoActivityImportAdapterOptions {
  /** Title of the activity being created — stamped onto the saved data. */
  title: string;
  /** YouTube URL of the activity being created — stamped onto saved data. */
  youtubeUrl: string;
  /**
   * Persist the completed activity. Consumer owns Firestore + Drive writes;
   * the adapter hands over the hydrated `VideoActivityData` and the
   * (possibly user-edited) title from the wizard.
   */
  onSave: (activity: VideoActivityData, savedTitle: string) => Promise<void>;
  /**
   * Optional Google-Sheet template creator for the wizard's template
   * helper affordance. If omitted, the helper card is not rendered.
   */
  createTemplateSheet?: () => Promise<string>;
  /**
   * Optional preview-instructions node rendered by the wizard's template
   * helper. If omitted, the wizard renders an empty instructions slot.
   */
  templateInstructions?: React.ReactNode;
  /**
   * Optional AI-assist hook. When provided, surfaced as the wizard's
   * "Generate with AI" path — e.g. Gemini video-understanding generation.
   */
  aiAssist?: {
    promptPlaceholder: string;
    generate: (ctx: { prompt: string }) => Promise<VideoActivityData>;
  };
}

/**
 * Build an `ImportAdapter<VideoActivityData>` closed over the Creator's
 * current title + youtubeUrl. Call this fresh whenever those inputs change
 * (e.g. on every render of the Creator import step) — the adapter captures
 * them at build time.
 */
export function createVideoActivityImportAdapter(
  options: VideoActivityImportAdapterOptions
): ImportAdapter<VideoActivityData> {
  const {
    title,
    youtubeUrl,
    onSave,
    createTemplateSheet,
    templateInstructions,
    aiAssist,
  } = options;

  const parse = async (
    source: ImportSourcePayload
  ): Promise<ImportParseResult<VideoActivityData>> => {
    let csvText = '';
    const warnings: string[] = [];

    if (source.kind === 'csv') {
      csvText = source.text;
    } else if (source.kind === 'file') {
      csvText = await source.file.text();
    } else if (source.kind === 'sheet') {
      // We don't fetch Sheets directly here — the wizard's template helper
      // guides the user to paste CSV. If a raw Sheets URL was provided with
      // no paste, surface a warning so the adapter still returns cleanly.
      throw new Error(
        'Paste the CSV content from the Sheet into the CSV tab — direct Sheet fetch is not supported.'
      );
    } else if (source.kind === 'json') {
      // JSON imports are not a first-class VA format; fall through to CSV-
      // shaped parsing if the payload looks like CSV, else reject.
      throw new Error(
        'JSON import is not supported for Video Activities. Please use CSV.'
      );
    }

    const questions = parseCsv(csvText.trim());
    // Sort by timestamp — preserves the legacy behavior and helps the
    // strictly-increasing validator surface duplicates clearly.
    questions.sort((a, b) => a.timestamp - b.timestamp);

    const now = Date.now();
    const data: VideoActivityData = {
      id: crypto.randomUUID(),
      title,
      youtubeUrl,
      questions,
      createdAt: now,
      updatedAt: now,
    };

    return { data, warnings };
  };

  const adapter: ImportAdapter<VideoActivityData> = {
    widgetLabel: 'Video Activity',
    supportedSources: ['csv', 'file'],
    ...(createTemplateSheet
      ? {
          templateHelper: {
            createTemplate: async () => {
              const url = await createTemplateSheet();
              return { url };
            },
            instructions: templateInstructions ?? null,
          },
        }
      : {}),
    parse,
    validate: validateVideoActivityData,
    renderPreview: () => null,
    save: async (data, savedTitle) => {
      // Re-stamp identity fields at save time so any late edits to the
      // wizard's title field flow through.
      const activity: VideoActivityData = {
        ...data,
        title: savedTitle.trim() || data.title,
        updatedAt: Date.now(),
      };
      await onSave(activity, activity.title);
    },
    ...(aiAssist
      ? {
          aiAssist: {
            promptPlaceholder: aiAssist.promptPlaceholder,
            generate: async (ctx) => {
              const generated = await aiAssist.generate(ctx);
              // Preserve the user-supplied title/URL context if the AI path
              // didn't fill them in.
              return {
                ...generated,
                title: generated.title || title,
                youtubeUrl: generated.youtubeUrl || youtubeUrl,
              };
            },
          },
        }
      : {}),
  };

  return adapter;
}
