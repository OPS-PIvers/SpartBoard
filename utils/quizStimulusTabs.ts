// Stimulus tabs beside a question (docs/plans/QUIZ_MCA_PRACTICE.md M11–M15).
import type { QuizStimulus, QuizStimulusType } from '@/types';
import { isDocShapedStimulus } from './quizStimuli';

/** Types that can be a tab in the panel; audio and video stay in the question (M13). */
export function hasStimulusTab(type: QuizStimulusType): boolean {
  return type === 'image' || isDocShapedStimulus(type);
}

/** How many questions point at each stimulus id. */
export function stimulusUseCounts(
  questions: readonly { stimulusIds?: string[] }[]
): Map<string, number> {
  const out = new Map<string, number>();
  for (const q of questions) {
    for (const id of new Set(q.stimulusIds ?? []))
      out.set(id, (out.get(id) ?? 0) + 1);
  }
  return out;
}

/** True when a picture belongs beside the question: shared by two or more questions, unless the teacher overrode it. */
export function imageInPanel(
  s: Pick<QuizStimulus, 'id' | 'type' | 'placement'>,
  useCounts: ReadonlyMap<string, number>
): boolean {
  if (s.type !== 'image') return false;
  if (s.placement === 'panel') return true;
  if (s.placement === 'inline') return false;
  return (useCounts.get(s.id) ?? 0) >= 2;
}

/** The tabbed layout's split: panel stimuli with the calculator last, and those that stay in the question. */
export function splitStimuliForTabs(
  stimuli: readonly QuizStimulus[],
  useCounts: ReadonlyMap<string, number>
): { panel: QuizStimulus[]; inline: QuizStimulus[] } {
  const panel: QuizStimulus[] = [];
  const calculators: QuizStimulus[] = [];
  const inline: QuizStimulus[] = [];
  for (const s of stimuli) {
    if (s.type === 'calculator') calculators.push(s);
    else if (isDocShapedStimulus(s.type) || imageInPanel(s, useCounts))
      panel.push(s);
    else inline.push(s);
  }
  return { panel: [...panel, ...calculators], inline };
}

/** Words the tab labels need, translated by the caller. */
export interface StimulusTabWords {
  calculator: string;
  numbered: (n: number) => string;
}

const ENGLISH_TAB_WORDS: StimulusTabWords = {
  calculator: 'Calculator',
  numbered: (n) => `Tab ${n}`,
};

/** What each panel tab says: the calculator is "Calculator", a named tab its name, the rest numbered. */
export function stimulusTabLabels(
  panel: readonly QuizStimulus[],
  words: StimulusTabWords = ENGLISH_TAB_WORDS
): string[] {
  return panel.map((s, i) => {
    if (s.type === 'calculator') return words.calculator;
    const name = s.tabLabel?.trim();
    if (name) return name;
    return words.numbered(i + 1);
  });
}

/** The tab to show: the one already open if this question still has it, else the first. */
export function activeStimulusTab(
  panel: readonly QuizStimulus[],
  chosenId: string | null
): string | null {
  if (panel.length === 0) return null;
  return chosenId && panel.some((s) => s.id === chosenId)
    ? chosenId
    : panel[0].id;
}
