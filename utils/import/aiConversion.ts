// Client side of Import's AI Conversions (docs/plans/IMPORT.md D8, D10, D11); the server is functions/src/importConversion.ts.
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/config/firebase';
import type { ImportBlock } from './contract';
import type { ImportSource } from './guessTargets';

/** The targets an AI Conversion can produce in this slice. */
export type AiConversionTarget = 'flashcards' | 'activityWall' | 'board';

/** Plain text handed to the AI, with where it came from. */
export interface ConversionInput {
  title: string;
  url: string;
  text: string;
}

export interface FlashcardsConversionResult {
  target: 'flashcards';
  title: string;
  cards: { term: string; definition: string }[];
  truncated: boolean;
}

export type WallConversionLayout = 'wall' | 'columns' | 'wordcloud';

export interface ActivityWallConversionResult {
  target: 'activityWall';
  title: string;
  prompt: string;
  layout: WallConversionLayout;
  columns: string[];
  truncated: boolean;
}

export interface BoardConversionResult {
  target: 'board';
  title: string;
  templateId: string;
  slots: {
    zoneId: string;
    widgetType: string;
    config: Record<string, unknown>;
  }[];
  truncated: boolean;
}

export type ConversionResultFor<T extends AiConversionTarget> = Extract<
  | FlashcardsConversionResult
  | ActivityWallConversionResult
  | BoardConversionResult,
  { target: T }
>;

/** Shown wherever a teacher starts an AI Conversion. */
export const AI_CONVERSION_LIMIT_NOTE =
  'Converting with AI counts toward your daily AI limit.';

/** Shown on every review screen an AI Conversion lands in. */
export const AI_CONVERSION_REVIEW_NOTE =
  'Made with AI. Check it before you save.';

/** Shown when the Source was longer than the AI could read. */
export const AI_CONVERSION_TRUNCATED_NOTE =
  'This was long, so only the first part was read.';

/** Turns read blocks into plain text, keeping headings, list items and table rows on their own lines. */
export function blocksToText(blocks: readonly ImportBlock[]): string {
  return blocks
    .map((block) => {
      switch (block.type) {
        case 'heading':
          return `${'#'.repeat(Math.min(6, Math.max(1, block.level)))} ${block.text}`;
        case 'listItem':
          return `- ${block.text}`;
        case 'quote':
          return `> ${block.text}`;
        case 'paragraph':
          return block.text;
        case 'table':
          return block.rows.map((row) => row.cells.join('\t')).join('\n');
      }
    })
    .filter((line) => line.trim())
    .join('\n\n');
}

/** The text an AI Conversion reads from a Source; null when the Source has no text yet (a bare URL or an unread file). */
export function conversionInputFromSource(
  source: ImportSource
): ConversionInput | null {
  switch (source.kind) {
    case 'send': {
      const text = blocksToText(source.item.blocks);
      return text
        ? { title: source.item.title, url: source.item.url, text }
        : null;
    }
    case 'text':
      return source.text.trim()
        ? { title: '', url: '', text: source.text }
        : null;
    case 'file':
      return source.text?.trim()
        ? { title: source.fileName, url: '', text: source.text }
        : null;
    case 'url':
      return null;
  }
}

interface ConvertRequest {
  target: AiConversionTarget;
  source: ConversionInput;
  allowedWidgets?: string[];
}

/** Runs one AI Conversion; `allowedWidgets` (board only) limits the widgets to the ones the teacher can use. */
export async function convertWithAi<T extends AiConversionTarget>(
  target: T,
  source: ConversionInput,
  options: { allowedWidgets?: string[] } = {}
): Promise<ConversionResultFor<T>> {
  const call = httpsCallable<ConvertRequest, ConversionResultFor<T>>(
    functions,
    'importConvertV1',
    { timeout: 310_000 }
  );
  try {
    const result = await call({
      target,
      source,
      ...(target === 'board' && options.allowedWidgets
        ? { allowedWidgets: options.allowedWidgets }
        : {}),
    });
    return result.data;
  } catch (error) {
    throw new Error(
      error instanceof Error && error.message
        ? error.message
        : 'The AI could not convert this. Try again.'
    );
  }
}
