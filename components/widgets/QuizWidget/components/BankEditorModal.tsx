import React, { useMemo, useState } from 'react';
import type {
  LibraryFolder,
  QuestionBankData,
  QuestionTargetTag,
  QuizData,
} from '@/types';
import { QuizEditorModal } from './QuizEditorModal';

interface BankEditorModalProps {
  isOpen: boolean;
  bank: QuestionBankData | null;
  onClose: () => void;
  onSave: (bank: QuestionBankData) => Promise<void>;
  folders?: LibraryFolder[];
  folderId?: string | null;
  onFolderChange?: (folderId: string | null) => void;
  /** `question-bank-ai` && `gemini-functions`; gates "Draft with AI". */
  aiAllowed: boolean;
}

const toQuizData = (bank: QuestionBankData): QuizData => ({
  id: bank.id,
  title: bank.title,
  questions: bank.questions,
  ...(bank.stimuli ? { stimuli: bank.stimuli } : {}),
  ...(bank.language ? { language: bank.language } : {}),
  createdAt: bank.createdAt,
  updatedAt: bank.updatedAt,
});

const sameTargetIds = (
  a: QuestionTargetTag[],
  b: QuestionTargetTag[]
): boolean => a.length === b.length && a.every((t, i) => t.id === b[i]?.id);

/** Question-bank editor: the quiz editor in bank mode plus bank-level targets. */
export const BankEditorModal: React.FC<BankEditorModalProps> = ({
  isOpen,
  bank,
  onClose,
  onSave,
  folders,
  folderId,
  onFolderChange,
  aiAllowed,
}) => {
  const originalTargets = useMemo(() => bank?.targets ?? [], [bank]);
  const [bankTargets, setBankTargets] =
    useState<QuestionTargetTag[]>(originalTargets);
  // Re-seed targets when a different bank opens (adjust state during render).
  const [prevBank, setPrevBank] = useState(bank);
  if (prevBank !== bank) {
    setPrevBank(bank);
    setBankTargets(originalTargets);
  }
  const quiz = useMemo(() => (bank ? toQuizData(bank) : null), [bank]);

  return (
    <QuizEditorModal
      mode="bank"
      isOpen={isOpen}
      quiz={quiz}
      onClose={onClose}
      folders={folders}
      folderId={folderId}
      onFolderChange={onFolderChange}
      aiAllowed={aiAllowed}
      bankTargets={bankTargets}
      onBankTargetsChange={setBankTargets}
      bankTargetsDirty={!sameTargetIds(bankTargets, originalTargets)}
      onSave={async (updated) => {
        if (!bank) return;
        await onSave({
          ...bank,
          title: updated.title,
          questions: updated.questions,
          ...(updated.stimuli && updated.stimuli.length > 0
            ? { stimuli: updated.stimuli }
            : { stimuli: undefined }),
          ...(bankTargets.length > 0
            ? { targets: bankTargets }
            : { targets: undefined }),
          ...(updated.language
            ? { language: updated.language }
            : { language: undefined }),
          updatedAt: updated.updatedAt,
        });
      }}
    />
  );
};
