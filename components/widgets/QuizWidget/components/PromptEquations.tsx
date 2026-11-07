// Equations in the question prompt: the insert/edit panel and the drawn preview under the prompt box.
import React from 'react';
import { MathText } from '@/components/common/MathText';
import { tourTypeAttr } from '@/config/tourAnchors';

const MathAnswerField = React.lazy(
  () => import('@/components/student/keyboards/MathAnswerField')
);

/** An equation being written; `start`/`end` is the prompt range it replaces. */
export interface PromptEquationDraft {
  start: number;
  end: number;
  math: string;
  editing: boolean;
}

export const PromptEquationPanel: React.FC<{
  draft: PromptEquationDraft;
  onDraftChange: (math: string) => void;
  onCancel: () => void;
  onSave: () => void;
}> = ({ draft, onDraftChange, onCancel, onSave }) => (
  <div className="mt-2 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
    <React.Suspense fallback={null}>
      <MathAnswerField
        value={draft.math}
        autoFocus
        ariaLabel="Equation"
        className="min-h-11! py-0! px-3! border-2! rounded-lg! bg-white border-slate-200 focus-within:border-brand-blue-primary"
        onChange={(plain) => onDraftChange(plain)}
        onEnter={onSave}
      />
    </React.Suspense>
    <div className="flex justify-center gap-2">
      <button
        type="button"
        onClick={onCancel}
        className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100"
        {...tourTypeAttr('quiz-editor.prompt-equation-cancel', 'quiz')}
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={onSave}
        className="px-3 py-1.5 rounded-lg text-xs font-bold bg-brand-blue-primary text-white hover:bg-brand-blue-dark"
        {...tourTypeAttr('quiz-editor.prompt-equation-save', 'quiz')}
      >
        {draft.editing ? 'Update' : 'Insert'}
      </button>
    </div>
  </div>
);

/** How the prompt looks to students, with each equation a button that opens it for editing. */
export const PromptMathPreview: React.FC<{
  text: string;
  onEdit: (index: number) => void;
}> = ({ text, onEdit }) => (
  <p
    className="mt-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 whitespace-pre-line wrap-break-word"
    {...tourTypeAttr('quiz-editor.prompt-math-preview', 'quiz')}
  >
    <MathText
      text={text}
      onEquationClick={onEdit}
      equationLabel="Edit equation"
    />
  </p>
);
