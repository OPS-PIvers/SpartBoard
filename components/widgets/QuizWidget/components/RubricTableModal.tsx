// Full rubric as a table, opened from the grader's rubric panel; the student's picks are highlighted.
import React from 'react';
import type {
  Rubric,
  RubricLevelOrder,
  WrittenAnswerRubricScore,
} from '@/types';
import { Modal } from '@/components/common/Modal';
import { tourTypeAttr } from '@/config/tourAnchors';
import { RubricGuideExamples } from '@/components/quiz/RubricGuideExamples';
import { criterionMaxPoints, orderRubricLevels } from '@/utils/rubricPoints';

interface RubricTableModalProps {
  rubric: Rubric;
  order: RubricLevelOrder;
  scores: Map<string, WrittenAnswerRubricScore>;
  onClose: () => void;
}

export const RubricTableModal: React.FC<RubricTableModalProps> = ({
  rubric,
  order,
  scores,
  onClose,
}) => {
  const columns = rubric.criteria.reduce(
    (n, c) => Math.max(n, c.levels.length),
    0
  );
  return (
    <Modal
      isOpen
      onClose={onClose}
      title={rubric.title}
      maxWidth="max-w-6xl"
      zIndex="z-modal-deep"
      allowFullscreen
      ariaLabel={rubric.title}
      footer={
        <div className="flex justify-center">
          <button
            type="button"
            onClick={onClose}
            {...tourTypeAttr('quiz-grading.rubric-table-close', 'quiz')}
            className="rounded-lg bg-brand-blue-primary px-6 py-2 text-sm font-bold text-white transition-colors hover:bg-brand-blue-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue-primary"
          >
            Close
          </button>
        </div>
      }
    >
      {rubric.description && (
        <p className="mb-3 text-sm leading-relaxed text-slate-600">
          {rubric.description}
        </p>
      )}
      <div className="overflow-x-auto pb-1">
        <table className="w-full min-w-[40rem] table-fixed border-collapse text-left">
          <colgroup>
            <col className="w-48" />
            {Array.from({ length: columns }, (_, i) => (
              <col key={i} />
            ))}
          </colgroup>
          <tbody>
            {rubric.criteria.map((criterion) => {
              const picked = scores.get(criterion.id);
              const levels = orderRubricLevels(criterion.levels, order);
              return (
                <tr key={criterion.id} className="align-top">
                  <th
                    scope="row"
                    className="border border-slate-200 bg-slate-50 p-3 font-normal"
                  >
                    <span className="block break-words text-sm font-bold text-slate-900">
                      {criterion.name}
                    </span>
                    {criterion.description && (
                      <span className="mt-1 block whitespace-pre-line text-xs leading-relaxed text-slate-600">
                        {criterion.description}
                      </span>
                    )}
                    {criterion.guide && (
                      <RubricGuideExamples
                        examples={criterion.guide.examples ?? []}
                      />
                    )}
                    <span className="mt-1 block text-xs font-semibold tabular-nums text-slate-500">
                      {picked
                        ? `${picked.points} / ${criterionMaxPoints(criterion)}`
                        : `${criterionMaxPoints(criterion)} pts`}
                    </span>
                  </th>
                  {Array.from({ length: columns }, (_, i) => {
                    const level = levels[i];
                    if (!level)
                      return <td key={i} className="border border-slate-200" />;
                    const isPicked = picked?.levelId === level.id;
                    return (
                      <td
                        key={level.id}
                        aria-current={isPicked || undefined}
                        className={`border p-3 ${
                          isPicked
                            ? 'border-brand-blue-primary bg-brand-blue-primary text-white'
                            : 'border-slate-200 text-slate-900'
                        }`}
                      >
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="break-words text-sm font-semibold">
                            {level.label}
                          </span>
                          <span className="shrink-0 text-sm font-bold tabular-nums">
                            {level.points}
                          </span>
                        </span>
                        {level.description && (
                          <span
                            className={`mt-1 block whitespace-pre-line text-xs leading-relaxed ${
                              isPicked ? 'text-white' : 'text-slate-600'
                            }`}
                          >
                            {level.description}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Modal>
  );
};
