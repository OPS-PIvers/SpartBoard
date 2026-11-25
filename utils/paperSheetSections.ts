// Section headings on a response sheet with question text, by the first printed question of each section.
import type { QuizData } from '@/types';
import {
  chooseLineFor,
  sectionOfQuestion,
  sessionSectionsFor,
} from './quizSections';
import {
  sheetSectionHeading,
  type BlockMeasure,
  type SheetStimulusBlock,
} from './paperSheetStimulusBlocks';

/** Tallest heading a sheet prints; a longer one sends the questions to a separate test paper. */
export const MAX_SECTION_HEADING_MM = 30;

/** Each section's heading block, keyed by the first of its questions the sheet prints. */
export function sheetSectionHeadings(
  quiz: QuizData,
  printedIds: readonly string[],
  measure: BlockMeasure
): Record<string, SheetStimulusBlock> {
  const sections = sessionSectionsFor(quiz);
  const out: Record<string, SheetStimulusBlock> = {};
  if (sections.length === 0) return out;
  const headed = new Set<string>();
  for (const id of printedIds) {
    const section = sectionOfQuestion(sections, id);
    if (!section || headed.has(section.id)) continue;
    headed.add(section.id);
    const chooseLine = chooseLineFor(section, printedIds);
    out[id] = sheetSectionHeading(
      {
        title: section.title,
        ...(section.directions ? { directions: section.directions } : {}),
        ...(chooseLine ? { chooseLine } : {}),
      },
      measure
    );
  }
  return out;
}
