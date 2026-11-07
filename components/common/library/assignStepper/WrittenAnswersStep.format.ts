// Written answers step: its value, default and one-line summary.
export type WrittenAnswersWhere = 'device' | 'paper';

export interface WrittenAnswersValue {
  where: WrittenAnswersWhere;
  spares: number;
}

export const DEFAULT_WRITTEN_ANSWERS: WrittenAnswersValue = {
  where: 'device',
  spares: 2,
};

export const formatWrittenAnswersValue = (
  value: WrittenAnswersValue,
  count: number
): string =>
  value.where === 'device'
    ? 'On the device'
    : `On paper, ${count} question${count === 1 ? '' : 's'}`;
