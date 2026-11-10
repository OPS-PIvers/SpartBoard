import React from 'react';
import { useTranslation } from 'react-i18next';
import { numberMarkupComments, onInk } from '@/utils/paperMarkupRender';
import { tourTypeAttr } from '@/config/tourAnchors';
import { inkOf, markupColorOf } from './markupStyle';
import type { PaperMarkupEditor } from './usePaperMarkupEditor';

/** The numbered comments under the image, as they will print (K10); a row opens its comment. */
export const MarkupCommentList: React.FC<{ editor: PaperMarkupEditor }> = ({
  editor,
}) => {
  const { t } = useTranslation();
  const comments = numberMarkupComments(editor.shown);
  if (comments.length === 0) return null;
  const byId = new Map(editor.shown.map((i) => [i.id, i]));
  return (
    <ol
      aria-label={t('quizMediaResponse.grading.paper.markup.commentList')}
      className="flex flex-col gap-0.5"
    >
      {comments.map((c) => {
        const item = byId.get(c.itemId);
        return (
          <li key={c.itemId}>
            <button
              type="button"
              onClick={() => editor.openComment(c.itemId)}
              aria-current={editor.selectedId === c.itemId ? 'true' : undefined}
              {...tourTypeAttr('quiz-grading.markup-comment-row', 'quiz')}
              className={`flex w-full items-start gap-2 rounded-lg px-1.5 py-1 text-left text-xs leading-relaxed text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-brand-blue-primary ${
                editor.selectedId === c.itemId ? 'bg-brand-blue-primary/5' : ''
              }`}
            >
              <span
                className="mt-px inline-flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold tabular-nums"
                style={{
                  background: item ? inkOf(markupColorOf(item)) : undefined,
                  color: item ? onInk(inkOf(markupColorOf(item))) : '#fff',
                }}
              >
                {c.number}
              </span>
              <span className="min-w-0 flex-1 whitespace-pre-wrap wrap-break-word">
                {c.text}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
};
