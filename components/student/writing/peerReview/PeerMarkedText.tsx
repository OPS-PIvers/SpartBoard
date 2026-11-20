// A piece's plain text with a partner's comments and suggested edits drawn in, each tied to who made it.
import React, { forwardRef } from 'react';
import type { WritingPeerMark } from '@/types';
import {
  PEER_SKIP_ATTR,
  editParts,
  type PlacedMark,
} from '@/utils/writingPeerText';

export interface PeerMarkedTextProps {
  /** Plain text; newlines are kept as they are. */
  text: string;
  /** Notes already placed on `text` (`placeMarks`). */
  marks: PlacedMark[];
  nameOf: (uid: string) => string;
  activeId?: string | null;
  onSelectMark?: (id: string) => void;
}

const skip = { [PEER_SKIP_ATTR]: '' };

/** Open notes drawn inline, left to right; a note overlapping an earlier one is listed but not drawn. */
function drawn(marks: PlacedMark[]): WritingPeerMark[] {
  const out: WritingPeerMark[] = [];
  let end = -1;
  for (const m of [...marks]
    .filter((x) => x.placed && x.status === 'open')
    .sort((a, b) => a.start - b.start)) {
    if (m.start < end) continue;
    out.push(m);
    end = m.end;
  }
  return out;
}

export const PeerMarkedText = forwardRef<HTMLDivElement, PeerMarkedTextProps>(
  ({ text, marks, nameOf, activeId, onSelectMark }, ref) => {
    const parts: React.ReactNode[] = [];
    let at = 0;
    for (const m of drawn(marks)) {
      if (m.start > at) parts.push(text.slice(at, m.start));
      const active = activeId === m.id;
      const select = () => onSelectMark?.(m.id);
      if (m.kind === 'comment') {
        parts.push(
          <mark
            key={m.id}
            title={nameOf(m.by)}
            onClick={select}
            className={`cursor-pointer rounded-sm text-inherit ${active ? 'bg-amber-200' : 'bg-amber-100'}`}
          >
            {m.quote}
          </mark>
        );
      } else {
        const p = editParts(m.quote, m.insert ?? '');
        parts.push(
          <span
            key={m.id}
            title={nameOf(m.by)}
            onClick={select}
            className={`cursor-pointer rounded-sm ${active ? 'bg-sky-50 ring-1 ring-sky-300' : ''}`}
          >
            {p.before}
            {p.removed && (
              <del className="bg-rose-50 text-rose-700 decoration-rose-600 decoration-2">
                {p.removed}
              </del>
            )}
            {p.added && (
              <ins
                {...skip}
                className="bg-sky-50 text-sky-800 underline decoration-sky-600 decoration-2 underline-offset-4"
              >
                {p.added}
              </ins>
            )}
            {p.after}
          </span>
        );
      }
      at = m.end;
    }
    if (at < text.length) parts.push(text.slice(at));
    return (
      <div
        ref={ref}
        className="whitespace-pre-wrap text-base leading-8 text-slate-800"
      >
        {parts}
      </div>
    );
  }
);
PeerMarkedText.displayName = 'PeerMarkedText';
