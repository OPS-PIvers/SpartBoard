import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { QuestionBankMetadata, QuizQuestion, QuizStimulus } from '@/types';
import { Z_INDEX } from '@/config/zIndex';
import { isEscapeFromWidgetInput } from '@/utils/domHelpers';
import { inputClass, labelClass } from './quizEditorFieldStyles';
import { referencedStimuli } from './bankSlotHelpers';
import type { QuizEditorBankApi } from './QuizEditorModal';

export interface SaveToBankModalProps {
  bankApi: QuizEditorBankApi;
  questions: QuizQuestion[];
  /** Quiz stimuli; only those the questions reference are sent along. */
  stimuli: QuizStimulus[];
  onClose: () => void;
  onSaved: (meta: QuestionBankMetadata) => void;
}

const NEW_BANK = '__new__';

export const SaveToBankModal: React.FC<SaveToBankModalProps> = ({
  bankApi,
  questions,
  stimuli,
  onClose,
  onSaved,
}) => {
  const personal = bankApi.sources.filter((s) => s.kind === 'personal');
  const [choice, setChoice] = useState<string>(personal[0]?.bankId ?? NEW_BANK);
  const [newTitle, setNewTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || isEscapeFromWidgetInput(event)) return;
      event.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const isNew = choice === NEW_BANK;
  const canSave =
    questions.length > 0 && !saving && (!isNew || newTitle.trim().length > 0);

  const submit = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const meta = await bankApi.appendQuestionsToBank(
        isNew ? { newTitle: newTitle.trim() } : { bankId: choice },
        questions,
        referencedStimuli(questions, stimuli)
      );
      onSaved(meta);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save to bank.');
    } finally {
      setSaving(false);
    }
  };

  const n = questions.length;

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/40 p-4"
      style={{ zIndex: Z_INDEX.modalNestedContent }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-label="Save to question bank"
        className="w-full max-w-md max-h-[85vh] flex flex-col rounded-xl bg-white shadow-2xl border border-slate-200"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <h4 className="text-sm font-bold text-slate-900">
            Save {n} {n === 1 ? 'question' : 'questions'} to a bank
          </h4>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1 rounded text-slate-500 hover:bg-slate-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-3 space-y-3">
          <p className="text-xs text-slate-600">
            Copies go into the bank; the questions here stay as they are.
          </p>
          {personal.length > 0 && (
            <div>
              <label className={labelClass} htmlFor="save-to-bank-target">
                Bank
              </label>
              <select
                id="save-to-bank-target"
                value={choice}
                onChange={(e) => setChoice(e.target.value)}
                className={`${inputClass} appearance-none`}
              >
                {personal.map((s) => (
                  <option key={s.bankId} value={s.bankId}>
                    {s.title} ({s.questionCount})
                  </option>
                ))}
                <option value={NEW_BANK}>New bank…</option>
              </select>
            </div>
          )}
          {isNew && (
            <div>
              <label className={labelClass} htmlFor="save-to-bank-title">
                New bank title
              </label>
              <input
                id="save-to-bank-title"
                autoFocus
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g. Unit 4 — Cells"
                className={inputClass}
              />
            </div>
          )}
          {error && (
            <p className="p-2.5 bg-brand-red-lighter/40 border border-brand-red-primary/20 rounded-lg text-xs text-brand-red-dark font-bold">
              {error}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-slate-200">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm font-semibold rounded-lg text-slate-700 hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!canSave}
            className="px-3 py-1.5 text-sm font-semibold rounded-lg bg-brand-blue-primary text-white hover:bg-brand-blue-dark disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving…' : 'Save to bank'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
