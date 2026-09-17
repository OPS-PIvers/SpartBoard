import React, { useState } from 'react';
import { Modal } from '@/components/common/Modal';
import type { FlashcardScoreVisibility } from '@/types';

export type PublishableFlashcardVisibility = Exclude<
  FlashcardScoreVisibility,
  'none'
>;

const OPTIONS: {
  id: PublishableFlashcardVisibility;
  label: string;
  description: string;
}[] = [
  {
    id: 'score',
    label: 'Score only',
    description: 'Students see how many they got right, not which ones.',
  },
  {
    id: 'score-and-answers',
    label: 'Score and correct answers',
    description: 'Students also see the cards they missed with the answers.',
  },
];

interface FlashcardPublishScoresModalProps {
  assignmentTitle: string;
  currentVisibility: FlashcardScoreVisibility | undefined;
  onClose: () => void;
  onConfirm: (visibility: PublishableFlashcardVisibility) => Promise<void>;
}

export const FlashcardPublishScoresModal: React.FC<
  FlashcardPublishScoresModalProps
> = ({ assignmentTitle, currentVisibility, onClose, onConfirm }) => {
  const [visibility, setVisibility] = useState<PublishableFlashcardVisibility>(
    currentVisibility && currentVisibility !== 'none'
      ? currentVisibility
      : 'score'
  );
  const [saving, setSaving] = useState(false);

  const confirm = async (): Promise<void> => {
    setSaving(true);
    try {
      await onConfirm(visibility);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Publish scores"
      maxWidth="max-w-md"
      footer={
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void confirm()}
            className="rounded-xl bg-brand-blue-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
          >
            {saving ? 'Publishing…' : 'Publish'}
          </button>
        </div>
      }
    >
      <p className="text-sm text-slate-600">
        Choose what students see for “{assignmentTitle}”. You can hide scores
        again at any time.
      </p>
      <div className="mt-4 flex flex-col gap-2">
        {OPTIONS.map((option) => (
          <label
            key={option.id}
            className={`flex cursor-pointer gap-3 rounded-2xl border p-3 ${
              visibility === option.id
                ? 'border-brand-blue-primary bg-brand-blue-lighter'
                : 'border-slate-200 hover:bg-slate-50'
            }`}
          >
            <input
              type="radio"
              name="flashcard-score-visibility"
              className="mt-1"
              checked={visibility === option.id}
              onChange={() => setVisibility(option.id)}
            />
            <span>
              <span className="block text-sm font-bold text-slate-800">
                {option.label}
              </span>
              <span className="block text-xs text-slate-500">
                {option.description}
              </span>
            </span>
          </label>
        ))}
      </div>
    </Modal>
  );
};
