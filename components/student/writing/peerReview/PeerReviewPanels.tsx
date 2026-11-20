// Writing peer review on the student page: reviewing a partner's writing, and the notes partners left on mine.
import React, { useMemo, useRef, useState } from 'react';
import { Loader2, MessageSquare, PencilLine } from 'lucide-react';
import type { WritingPeerAccess, WritingPeerMark } from '@/types';
import type { NewPeerMark, PartnerWriting } from '@/hooks/useWritingPeerReview';
import { peerPlainText, placeMarks, textOffset } from '@/utils/writingPeerText';
import { PeerMarkedText } from './PeerMarkedText';
import { PeerNotes } from './PeerNotes';
import { PEER_STUDENT_STRINGS as S } from './peerStrings';

const BOX =
  'relative min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white px-6 py-5 pb-6';
const SIDE =
  'w-full shrink-0 rounded-2xl border border-slate-200 bg-white px-4 py-3 pb-4 lg:w-80';
const BTN =
  'inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-lg px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50';

type Draft = {
  kind: 'comment' | 'edit';
  start: number;
  end: number;
  quote: string;
  text: string;
};

/** The partner's writing, with my comments and suggested edits on it. */
export const PartnerReviewPanel: React.FC<{
  partner: PartnerWriting | null;
  failed: boolean;
  access: WritingPeerAccess;
  onAdd: (mark: NewPeerMark) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
}> = ({ partner, failed, access, onAdd, onDelete }) => {
  const textRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLElement>(null);
  const [pick, setPick] = useState<{
    start: number;
    end: number;
    quote: string;
    top: number;
    left: number;
  } | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const text = useMemo(() => peerPlainText(partner?.html ?? ''), [partner]);
  const marks = useMemo(
    () => placeMarks(text, partner?.marks ?? []),
    [text, partner]
  );

  const canComment = access === 'comment' || access === 'edit';
  const canEdit = access === 'edit';

  // A selection inside the text offers Comment and Suggest edit just above it.
  const onPointerUp = () => {
    if (!canComment || draft) return;
    const sel = document.getSelection();
    const root = textRef.current;
    const box = boxRef.current;
    if (!sel || sel.isCollapsed || !root || !box || sel.rangeCount === 0)
      return setPick(null);
    const r = sel.getRangeAt(0);
    if (!root.contains(r.startContainer) || !root.contains(r.endContainer))
      return setPick(null);
    const start = textOffset(root, r.startContainer, r.startOffset);
    const end = textOffset(root, r.endContainer, r.endOffset);
    const quote = text.slice(start, end);
    if (!quote.trim()) return setPick(null);
    const rect = r.getBoundingClientRect();
    const host = box.getBoundingClientRect();
    setPick({
      start,
      end,
      quote,
      top: Math.max(8, rect.top - host.top - 52),
      left: Math.min(
        Math.max(8, rect.left - host.left),
        Math.max(8, host.width - 280)
      ),
    });
  };

  const open = (kind: Draft['kind']) => {
    if (!pick) return;
    setDraft({
      kind,
      start: pick.start,
      end: pick.end,
      quote: pick.quote,
      text: kind === 'edit' ? pick.quote : '',
    });
    setPick(null);
    setError(false);
  };

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    const ok = await onAdd(
      draft.kind === 'comment'
        ? {
            kind: 'comment',
            start: draft.start,
            end: draft.end,
            quote: draft.quote,
            body: draft.text.trim(),
          }
        : {
            kind: 'edit',
            start: draft.start,
            end: draft.end,
            quote: draft.quote,
            insert: draft.text,
          }
    );
    setSaving(false);
    if (ok) setDraft(null);
    else setError(true);
  };

  const hint =
    access === 'edit'
      ? S.canEdit
      : access === 'comment'
        ? S.canComment
        : S.canView;

  if (!partner)
    return failed ? (
      <p className="text-sm font-semibold text-rose-700">{S.loadFailed}</p>
    ) : (
      <div className="flex justify-center py-10 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
      </div>
    );

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">{hint}</p>
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        <section ref={boxRef} className={BOX} onPointerUp={onPointerUp}>
          {!partner.started || !text ? (
            <p className="text-sm text-slate-500">{S.notStarted}</p>
          ) : (
            <PeerMarkedText
              ref={textRef}
              text={text}
              marks={marks}
              nameOf={() => S.you}
              activeId={active}
              onSelectMark={setActive}
            />
          )}
          {pick && (
            <div
              className="absolute z-10 flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-lg"
              style={{ top: pick.top, left: pick.left }}
            >
              {/* no-tour-anchor: student page; live tours run in the teacher app */}
              <button
                type="button"
                onPointerUp={(e) => e.stopPropagation()}
                onClick={() => open('comment')}
                className={`${BTN} min-h-[36px] px-3 text-slate-800 hover:bg-slate-100`}
              >
                <MessageSquare
                  className="h-4 w-4 text-amber-700"
                  aria-hidden="true"
                />
                {S.comment}
              </button>
              {canEdit && (
                // no-tour-anchor: student page; live tours run in the teacher app
                <button
                  type="button"
                  onPointerUp={(e) => e.stopPropagation()}
                  onClick={() => open('edit')}
                  className={`${BTN} min-h-[36px] px-3 text-slate-800 hover:bg-slate-100`}
                >
                  <PencilLine
                    className="h-4 w-4 text-sky-700"
                    aria-hidden="true"
                  />
                  {S.suggest}
                </button>
              )}
            </div>
          )}
        </section>
        <aside className={SIDE}>
          {draft && (
            <div className="mb-3 space-y-2 border-b border-slate-100 pb-3">
              <p className="text-xs font-bold text-slate-600">
                {draft.kind === 'comment' ? S.comment : S.suggest}
              </p>
              <p className="line-clamp-2 text-sm text-slate-500">
                &ldquo;{draft.quote}&rdquo;
              </p>
              <textarea
                // no-tour-anchor: student page; live tours run in the teacher app
                autoFocus
                value={draft.text}
                maxLength={2000}
                onChange={(e) => setDraft({ ...draft, text: e.target.value })}
                rows={3}
                aria-label={draft.kind === 'comment' ? S.comment : S.suggest}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-yellow-700 focus:outline-hidden"
              />
              {error && (
                <p className="text-sm font-semibold text-rose-700">
                  {S.saveFailed}
                </p>
              )}
              <div className="flex justify-end gap-1">
                {/* no-tour-anchor: student page; live tours run in the teacher app */}
                <button
                  type="button"
                  onClick={() => setDraft(null)}
                  className={`${BTN} text-slate-700 hover:bg-slate-100`}
                >
                  {S.cancel}
                </button>
                {/* no-tour-anchor: student page; live tours run in the teacher app */}
                <button
                  type="button"
                  disabled={
                    saving ||
                    (draft.kind === 'comment'
                      ? !draft.text.trim()
                      : draft.text === draft.quote)
                  }
                  onClick={() => void save()}
                  className={`${BTN} bg-yellow-800 text-white hover:bg-yellow-900`}
                >
                  {S.save}
                </button>
              </div>
            </div>
          )}
          <h2 className="text-sm font-bold text-slate-800">{S.yourNotes}</h2>
          <PeerNotes
            marks={marks}
            nameOf={() => S.you}
            role="partner"
            activeId={active}
            onSelect={setActive}
            onDelete={(id) => void onDelete(id)}
          />
        </aside>
      </div>
    </div>
  );
};

/** My writing with the notes partners left; Accept puts a suggested edit into the piece. */
export const PartnerFeedbackPanel: React.FC<{
  html: string;
  notes: WritingPeerMark[];
  nameOf: (uid: string) => string;
  /** Accept needs the piece open for writing. */
  canAccept: boolean;
  onAccept: (mark: WritingPeerMark) => boolean;
  onClose: (
    id: string,
    status: 'accepted' | 'rejected' | 'resolved'
  ) => Promise<boolean>;
}> = ({ html, notes, nameOf, canAccept, onAccept, onClose }) => {
  const [active, setActive] = useState<string | null>(null);
  const [gone, setGone] = useState<string | null>(null);
  const text = useMemo(() => peerPlainText(html), [html]);
  const marks = useMemo(() => placeMarks(text, notes), [text, notes]);
  // The note closes first, so a failed save never leaves an applied edit open to accept twice.
  const accept = async (id: string) => {
    const m = marks.find((x) => x.id === id);
    if (!m) return;
    if (!m.placed) return setGone(id);
    setGone(null);
    if (await onClose(id, 'accepted')) onAccept(m);
  };
  return (
    <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
      <section className={BOX}>
        {text ? (
          <PeerMarkedText
            text={text}
            marks={marks}
            nameOf={nameOf}
            activeId={active}
            onSelectMark={setActive}
          />
        ) : (
          <p className="text-sm text-slate-500">{S.noNotes}</p>
        )}
      </section>
      <aside className={SIDE}>
        <h2 className="text-sm font-bold text-slate-800">{S.fromPartner}</h2>
        {gone && (
          <p role="status" className="mt-1 text-sm text-slate-700">
            {S.textChanged}
          </p>
        )}
        <PeerNotes
          marks={marks}
          nameOf={nameOf}
          role="writer"
          canAccept={canAccept}
          activeId={active}
          onSelect={setActive}
          onAccept={(id) => void accept(id)}
          onReject={(id) => void onClose(id, 'rejected')}
          onDone={(id) => void onClose(id, 'resolved')}
        />
      </aside>
    </div>
  );
};
