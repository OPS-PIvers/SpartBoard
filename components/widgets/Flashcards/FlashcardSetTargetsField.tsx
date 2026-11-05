import React from 'react';
import type { QuestionTargetTag } from '@/types';
import { TargetsField } from '@/components/quiz/targets/TargetsField';

interface FlashcardSetTargetsFieldProps {
  targets: QuestionTargetTag[] | undefined;
  /** Receives undefined when the last tag is removed, so an untagged set stays free of the key. */
  onChange: (targets: QuestionTargetTag[] | undefined) => void;
  labelClassName?: string;
}

/** Set-level learning targets: Quiz's targets field and picker, applied to every card in the set. */
export const FlashcardSetTargetsField: React.FC<
  FlashcardSetTargetsFieldProps
> = ({
  targets,
  onChange,
  labelClassName = 'mb-1 block text-xxs font-black uppercase tracking-widest text-slate-500',
}) => (
  <TargetsField
    targets={targets}
    onChange={onChange}
    labelClassName={labelClassName}
  />
);
