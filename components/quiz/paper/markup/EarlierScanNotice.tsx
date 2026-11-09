import React from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';
import { tourTypeAttr } from '@/config/tourAnchors';
import type { PaperMarkupEditor } from './usePaperMarkupEditor';

const ACTION =
  'inline-flex h-7 items-center rounded-lg px-2 text-xs font-bold transition-colors focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-amber-700 [@media(pointer:coarse)]:h-11';

/** Marks drawn on an earlier scan of this answer (K12): keep them, or clear them in one undoable step. */
export const EarlierScanNotice: React.FC<{
  editor: PaperMarkupEditor;
  onLooksRight: () => void;
}> = ({ editor, onLooksRight }) => {
  const { t } = useTranslation();
  const tm = (key: string) =>
    t(`quizMediaResponse.grading.paper.markup.earlierScan.${key}`);
  return (
    <div
      role="status"
      {...tourTypeAttr('quiz-grading.markup-earlier-scan', 'quiz')}
      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900"
    >
      <span className="inline-flex min-w-0 items-center gap-1.5">
        <AlertTriangle aria-hidden className="h-3.5 w-3.5 shrink-0" />
        {tm('text')}
      </span>
      <span className="ml-auto inline-flex items-center gap-1">
        <button
          type="button"
          onClick={onLooksRight}
          {...tourTypeAttr('quiz-grading.markup-earlier-scan-keep', 'quiz')}
          className={`${ACTION} border border-amber-300 bg-white text-amber-900 hover:bg-amber-100`}
        >
          {tm('keep')}
        </button>
        <button
          type="button"
          onClick={editor.clearAll}
          {...tourTypeAttr('quiz-grading.markup-earlier-scan-clear', 'quiz')}
          className={`${ACTION} text-amber-900 hover:bg-amber-100`}
        >
          {tm('clear')}
        </button>
      </span>
    </div>
  );
};
