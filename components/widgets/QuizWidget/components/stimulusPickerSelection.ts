import type { QuizStimulus } from '@/types';

/** Selection id for the Add a stimulus row. */
export const PICKER_ADD = '__add__';

/** The row a picker opens on: the first attached stimulus, else the first one, else Add. */
export const initialPickerSelection = (
  stimuli: QuizStimulus[],
  attachedIds: string[] | undefined
): string =>
  attachedIds?.find((id) => stimuli.some((s) => s.id === id)) ??
  stimuli[0]?.id ??
  PICKER_ADD;
