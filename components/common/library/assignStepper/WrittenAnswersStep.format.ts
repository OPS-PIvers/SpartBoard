// Written answers step: its value, default and one-line summary.
import type { PaperBoxSize } from '@/types';
import type { PaperBoxStylePick } from '@/utils/paperWritten';

export type WrittenAnswersWhere = 'device' | 'paper';

export interface WrittenAnswersValue {
  where: WrittenAnswersWhere;
  spares: number;
  /** Box sizes picked here, by question id. */
  boxSizes: Record<string, PaperBoxSize>;
  /** Paper types picked here, by question id. */
  boxStyles: Record<string, PaperBoxStylePick>;
}

export const DEFAULT_WRITTEN_ANSWERS: WrittenAnswersValue = {
  where: 'device',
  spares: 2,
  boxSizes: {},
  boxStyles: {},
};

export const formatWrittenAnswersValue = (
  value: WrittenAnswersValue,
  count: number
): string =>
  value.where === 'device'
    ? 'On the device'
    : `On paper, ${count} question${count === 1 ? '' : 's'}`;
