/* eslint-disable react-refresh/only-export-components -- dev harness entry */
import React, { useState } from 'react';
import { DEFAULT_FLASHCARD_ASSIGN_FORM } from '@/components/widgets/Flashcards/utils/flashcardAssign';
import { FlashcardsCheckStep } from './FlashcardsCheckStep';
import {
  formatFlashcardsCheckValue,
  type FlashcardsCheckValue,
} from './flashcardsCheckValue';

const { collectSubmission: _omit, ...DEFAULT_VALUE } =
  DEFAULT_FLASHCARD_ASSIGN_FORM;

const Demo: React.FC<{ initial: FlashcardsCheckValue; cardCount: number }> = ({
  initial,
  cardCount,
}) => {
  const [value, setValue] = useState(initial);
  return (
    <div className="w-[36rem] space-y-3 rounded-xl border border-brand-blue-primary/40 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-bold text-slate-800">
          How students are checked
        </span>
        <span className="text-sm text-slate-500">
          {formatFlashcardsCheckValue(value)}
        </span>
      </div>
      <FlashcardsCheckStep
        value={value}
        onChange={setValue}
        cardCount={cardCount}
      />
    </div>
  );
};

export default {
  title: 'Flashcards: How students are checked',
  render: () => (
    <div className="flex flex-wrap gap-6">
      <Demo initial={DEFAULT_VALUE} cardCount={24} />
      <Demo initial={{ ...DEFAULT_VALUE, checkMode: 'test' }} cardCount={24} />
      <Demo
        initial={{ ...DEFAULT_VALUE, checkMode: 'test', strict: true }}
        cardCount={3}
      />
    </div>
  ),
};
