// Where each question's stimulus block goes on a response sheet with question text, across versions.
import type { QuizQuestion } from '@/types';
import type { PaperSheetEntry } from './paperPageMap';
import {
  promptHeaderRows,
  questionSlotLines,
  questionSlotsFor,
} from './paperPageMap';
import { BLOCK_GAP_MM } from './paperSheetStimulusBlocks';
import {
  QUESTION_CHOICE_TOP_MM,
  QUESTION_GRID_BOTTOM_MM,
  QUESTION_GRID_TOP_MM,
  QUESTION_STEM_H_MM,
  WRITTEN_LINE_PITCH_MM,
} from './paperSheetLayout';
import { PAPER_FULL_PAGE_LINES, paperBoxLines } from './paperWritten';
import type {
  SheetResourcePage,
  SheetStimuliPlan,
  SheetStimulusBlock,
} from './paperSheetStimulusBlocks';

/** One printed set (the quiz, or one version) and the page map id of each of its entries. */
export interface SheetStimuliSet {
  entries: readonly PaperSheetEntry[];
  /** Page map id per entry: the entry's own id, or the template's for a version. */
  mapIds: readonly string[];
  /** The entry the page map plans at each index: the template's for a version, whose box is the largest any version needs. */
  slots?: readonly PaperSheetEntry[];
  plan: SheetStimuliPlan;
}

/** True when a written box and the block above it fit one question-text page. */
function fitsInFlow(slot: PaperSheetEntry, blockMm: number): boolean {
  if (slot.kind !== 'written') return true;
  const lines = questionSlotLines(questionSlotsFor(slot.size));
  const room =
    blockMm + 2 * BLOCK_GAP_MM - (QUESTION_CHOICE_TOP_MM - QUESTION_STEM_H_MM);
  return (
    QUESTION_CHOICE_TOP_MM + room + lines * WRITTEN_LINE_PITCH_MM <=
    QUESTION_GRID_BOTTOM_MM - QUESTION_GRID_TOP_MM
  );
}

/** One set's blocks, keyed the way its print job looks them up. */
export interface SheetStimuliForSet {
  /** By question id, for the question-text row of an MC question. */
  rows: Map<string, SheetStimulusBlock>;
  /** By page map id: a written box printed in the flow of the page. */
  written: Record<string, SheetStimulusBlock>;
  /** By page map id: a written box on a page of its own, whose header carries the block. */
  prompts: Record<string, SheetStimulusBlock>;
  /** By page map id: stimulus pages printed just before the question's page. */
  pagesBefore: Record<string, SheetResourcePage[]>;
}

export interface SheetStimuliLayout {
  sets: SheetStimuliForSet[];
  /** Room each row reserves, by page map id: the tallest block any set prints there. */
  stimulusMm: Record<string, number>;
  /** Page map ids that print their prompt and block on a page of their own. */
  promptIds: Set<string>;
}

/** A written box on its own page, or one too tall to share a page with its block, carries the block in its header; a smaller one prints it above the box. */
export function layoutSheetStimuli(
  sets: readonly SheetStimuliSet[],
  promptIds: ReadonlySet<string>
): SheetStimuliLayout {
  const stimulusMm: Record<string, number> = {};
  const prompted = new Set<string>();
  const out = sets.map((set): SheetStimuliForSet => {
    const rows = new Map<string, SheetStimulusBlock>();
    const written: Record<string, SheetStimulusBlock> = {};
    const prompts: Record<string, SheetStimulusBlock> = {};
    const pagesBefore: Record<string, SheetResourcePage[]> = {};
    set.entries.forEach((entry, i) => {
      const block = set.plan.blocks.get(entry.questionId);
      const mapId = set.mapIds[i] ?? entry.questionId;
      const before = set.plan.pagesBefore.get(entry.questionId);
      if (before) pagesBefore[mapId] = before;
      if (!block) return;
      const slot = set.slots?.[i] ?? entry;
      if (
        slot.kind === 'written' &&
        (promptIds.has(mapId) ||
          paperBoxLines(slot.size) >= PAPER_FULL_PAGE_LINES ||
          !fitsInFlow(slot, block.heightMm))
      ) {
        prompts[mapId] = block;
        prompted.add(mapId);
        return;
      }
      if (entry.kind === 'mc') rows.set(entry.questionId, block);
      else written[mapId] = block;
      stimulusMm[mapId] = Math.max(stimulusMm[mapId] ?? 0, block.heightMm);
    });
    return { rows, written, prompts, pagesBefore };
  });
  return { sets: out, stimulusMm, promptIds: prompted };
}

/** Header rows for each prompt that prints a block, the most any set needs. */
export function blockPromptRows(
  layout: SheetStimuliLayout,
  sets: readonly SheetStimuliSet[],
  questionsById: ReadonlyMap<string, Pick<QuizQuestion, 'text'>>,
  labelled: boolean
): Record<string, number> {
  const out: Record<string, number> = {};
  layout.sets.forEach((forSet, k) => {
    const set = sets[k];
    set.entries.forEach((entry, i) => {
      const mapId = set.mapIds[i] ?? entry.questionId;
      const block = forSet.prompts[mapId];
      if (!block) return;
      const text = questionsById.get(entry.questionId)?.text ?? '';
      const rows = promptHeaderRows(text, 0, labelled, block.heightMm);
      out[mapId] = Math.max(out[mapId] ?? 0, rows);
    });
  });
  return out;
}
