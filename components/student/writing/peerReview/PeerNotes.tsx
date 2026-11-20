// The list beside peer-marked text: each comment or suggested edit with who made it.
import React from 'react';
import { Check, MessageSquare, PencilLine, X } from 'lucide-react';
import type { WritingPeerMark } from '@/types';
import { editLabel, PEER_STUDENT_STRINGS as S } from './peerStrings';

const btn =
  'inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition-colors';

export const PeerNotes: React.FC<{
  marks: WritingPeerMark[];
  nameOf: (uid: string) => string;
  /** Writer: Accept, Reject, Done. Partner: Delete. Teacher: every note with its status. */
  role: 'writer' | 'partner' | 'teacher';
  /** The writer can accept only while the piece is open for writing. */
  canAccept?: boolean;
  activeId?: string | null;
  onSelect?: (id: string) => void;
  onAccept?: (id: string) => void;
  onReject?: (id: string) => void;
  onDone?: (id: string) => void;
  onDelete?: (id: string) => void;
}> = ({
  marks,
  nameOf,
  role,
  canAccept = true,
  activeId,
  onSelect,
  onAccept,
  onReject,
  onDone,
  onDelete,
}) => {
  const open =
    role === 'teacher' ? marks : marks.filter((m) => m.status === 'open');
  if (open.length === 0)
    return <p className="py-2 text-sm text-slate-500">{S.noNotes}</p>;
  return (
    <ul className="divide-y divide-slate-100">
      {open.map((m) => {
        const Icon = m.kind === 'comment' ? MessageSquare : PencilLine;
        const active = activeId === m.id;
        return (
          <li
            key={m.id}
            className={`py-3 ${active ? 'border-l-2 border-yellow-700 pl-3' : 'border-l-2 border-transparent pl-3'}`}
          >
            <button
              type="button"
              // no-tour-anchor: student page; live tours run in the teacher app
              onClick={() => onSelect?.(m.id)}
              className="flex w-full items-start gap-2 text-left"
            >
              <Icon
                className={`mt-0.5 h-4 w-4 shrink-0 ${m.kind === 'comment' ? 'text-amber-700' : 'text-sky-700'}`}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-bold text-slate-600">
                  {m.kind === 'comment'
                    ? S.commented(nameOf(m.by))
                    : S.suggested(nameOf(m.by))}
                </span>
                <span className="block text-sm text-slate-800">
                  {m.kind === 'comment' ? m.body : editLabel(m)}
                </span>
                {role === 'teacher' && (
                  <span className="block text-xs font-semibold text-slate-500">
                    {S.status[m.status]}
                  </span>
                )}
              </span>
            </button>
            <div className="mt-1 flex flex-wrap gap-1 pl-3">
              {role === 'writer' && m.kind === 'edit' && (
                <>
                  {canAccept && (
                    // no-tour-anchor: student page; live tours run in the teacher app
                    <button
                      type="button"
                      onClick={() => onAccept?.(m.id)}
                      className={`${btn} text-emerald-800 hover:bg-emerald-50`}
                    >
                      <Check className="h-4 w-4" aria-hidden="true" />
                      {S.accept}
                    </button>
                  )}
                  {/* no-tour-anchor: student page; live tours run in the teacher app */}
                  <button
                    type="button"
                    onClick={() => onReject?.(m.id)}
                    className={`${btn} text-slate-700 hover:bg-slate-100`}
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                    {S.reject}
                  </button>
                </>
              )}
              {role === 'writer' && m.kind === 'comment' && (
                // no-tour-anchor: student page; live tours run in the teacher app
                <button
                  type="button"
                  onClick={() => onDone?.(m.id)}
                  className={`${btn} text-slate-700 hover:bg-slate-100`}
                >
                  <Check className="h-4 w-4" aria-hidden="true" />
                  {S.done}
                </button>
              )}
              {role === 'partner' && (
                // no-tour-anchor: student page; live tours run in the teacher app
                <button
                  type="button"
                  onClick={() => onDelete?.(m.id)}
                  className={`${btn} text-slate-700 hover:bg-slate-100`}
                >
                  {S.delete}
                </button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
};
