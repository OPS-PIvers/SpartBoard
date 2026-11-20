// Writing peer review setup: what partners can do, and who reads whose writing.
import React, { useMemo, useState } from 'react';
import { Loader2, Shuffle } from 'lucide-react';
import type { WritingPeerAccess } from '@/types';
import { Modal } from '@/components/common/Modal';
import { SegmentedControl } from '@/components/common/SegmentedControl';
import { LIBRARY_HEADER_ACCENTS } from '@/components/common/library/libraryAccents';
import { tourFieldAttr, tourTypeAttr } from '@/config/tourAnchors';
import {
  pairAtRandom,
  pairWith,
  peerLinksFor,
  unpair,
  PEER_GROUP_MAX,
  type PeerGroup,
} from '@/utils/writingPeerReview';
import { PEER_PAIRING_STRINGS } from './peerPairingStrings';

const TYPE = 'writing';

export interface PeerStudent {
  uid: string;
  /** "Last, First". */
  name: string;
}

const S = PEER_PAIRING_STRINGS;

export interface PeerPairingModalProps {
  isOpen: boolean;
  onClose: () => void;
  students: PeerStudent[];
  initialGroups?: PeerGroup[];
  initialAccess?: WritingPeerAccess;
  /** Peer review is already running: the main button saves and End shows. */
  running?: boolean;
  /** Resolves false when the save failed. */
  onSave: (groups: PeerGroup[], access: WritingPeerAccess) => Promise<boolean>;
  onEnd?: () => Promise<boolean>;
}

const buttonBase =
  'inline-flex min-h-[40px] items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
const quietButton = `${buttonBase} text-slate-700 hover:bg-slate-100`;

export const PeerPairingModal: React.FC<PeerPairingModalProps> = ({
  isOpen,
  onClose,
  students,
  initialGroups = [],
  initialAccess = 'comment',
  running = false,
  onSave,
  onEnd,
}) => {
  const [access, setAccess] = useState<WritingPeerAccess>(initialAccess);
  // Only students still on the roster keep their place.
  const [groups, setGroups] = useState<PeerGroup[]>(() => {
    const known = new Set(students.map((s) => s.uid));
    return initialGroups
      .map((g) => g.filter((u) => known.has(u)))
      .filter((g) => g.length >= 2);
  });
  const [busy, setBusy] = useState<'save' | 'end' | null>(null);
  const [failed, setFailed] = useState(false);
  const nameOf = useMemo(
    () => new Map(students.map((s) => [s.uid, s.name])),
    [students]
  );
  const uids = useMemo(() => students.map((s) => s.uid), [students]);
  const paired = new Set(groups.flat());
  const left = students.filter((s) => !paired.has(s.uid)).length;

  const run = async (kind: 'save' | 'end') => {
    setBusy(kind);
    setFailed(false);
    const ok = kind === 'save' ? await onSave(groups, access) : await onEnd?.();
    setBusy(null);
    if (ok) onClose();
    else setFailed(true);
  };

  const footer = (
    <div className="flex flex-col items-center gap-2">
      {failed && (
        <p role="alert" className="text-sm font-semibold text-rose-700">
          {S.failed}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-center gap-2">
        {running && onEnd && (
          <button
            type="button"
            {...tourTypeAttr('writing-peer.end', TYPE)}
            disabled={busy !== null}
            onClick={() => void run('end')}
            className={`${buttonBase} text-red-700 hover:bg-red-50`}
          >
            {busy === 'end' && (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            )}
            {S.end}
          </button>
        )}
        <button
          type="button"
          // no-tour-anchor: the shared modal close anchor covers leaving
          onClick={onClose}
          className={quietButton}
        >
          {S.cancel}
        </button>
        <button
          type="button"
          {...tourTypeAttr('writing-peer.start', TYPE)}
          disabled={groups.length === 0 || busy !== null}
          onClick={() => void run('save')}
          className={`${buttonBase} bg-yellow-800 text-white hover:bg-yellow-900`}
        >
          {busy === 'save' && (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          )}
          {running ? S.save : S.start}
        </button>
      </div>
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={S.title}
      accent={LIBRARY_HEADER_ACCENTS.writing}
      maxWidth="max-w-2xl"
      footer={footer}
      contentClassName="px-6 pb-4"
      tourScope="writing-peer-review"
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-semibold text-slate-700">
            {S.access}
          </span>
          <SegmentedControl
            role="radiogroup"
            ariaLabel={S.access}
            value={access}
            onChange={setAccess}
            anchor={tourTypeAttr('writing-peer.access', TYPE)}
            options={(['view', 'comment', 'edit'] as const).map((v) => ({
              value: v,
              label: S.accessOptions[v],
            }))}
          />
        </div>

        {students.length < 2 ? (
          <p className="py-4 text-sm text-slate-600">{S.noStudents}</p>
        ) : (
          <>
            <div className="-ml-4 flex flex-wrap items-center gap-1">
              <button
                type="button"
                {...tourTypeAttr('writing-peer.pair-all', TYPE)}
                onClick={() => setGroups(pairAtRandom(uids))}
                className={quietButton}
              >
                <Shuffle className="h-4 w-4" aria-hidden="true" />
                {S.pairAll}
              </button>
              <button
                type="button"
                {...tourTypeAttr('writing-peer.pair-rest', TYPE)}
                disabled={left < 1 || groups.length === 0}
                onClick={() => setGroups(pairAtRandom(uids, groups))}
                className={quietButton}
              >
                {S.pairRest}
              </button>
              <button
                type="button"
                {...tourTypeAttr('writing-peer.clear', TYPE)}
                disabled={groups.length === 0}
                onClick={() => setGroups([])}
                className={quietButton}
              >
                {S.clear}
              </button>
            </div>
            <p className="-mt-2 text-sm text-slate-600">
              {S.counts(groups.length, left)}
            </p>
            <ul className="divide-y divide-slate-100 border-t border-slate-200">
              {students.map((s, i) => {
                const group = groups.find((g) => g.includes(s.uid));
                const partner = group?.find((u) => u !== s.uid) ?? '';
                const { reviews } = peerLinksFor(groups, s.uid);
                const trio = (group?.length ?? 0) > 2;
                return (
                  <li
                    key={s.uid}
                    className="flex min-h-[48px] flex-wrap items-center gap-x-3 gap-y-1 py-1.5"
                  >
                    <span className="min-w-[12rem] flex-1 text-sm font-semibold text-slate-800">
                      {s.name}
                    </span>
                    {trio && reviews && (
                      <span className="text-xs text-slate-500">
                        {S.reads(nameOf.get(reviews) ?? '')}
                      </span>
                    )}
                    <select
                      {...tourFieldAttr(
                        'writing-peer.partner',
                        TYPE,
                        `row-${i + 1}`
                      )}
                      aria-label={`${S.partner}: ${s.name}`}
                      value={partner}
                      onChange={(e) =>
                        setGroups(
                          e.target.value
                            ? pairWith(groups, s.uid, e.target.value)
                            : unpair(groups, s.uid)
                        )
                      }
                      className="h-9 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-800 sm:w-56"
                    >
                      <option value="">{S.notPaired}</option>
                      {students
                        .filter((o) => o.uid !== s.uid)
                        .map((o) => {
                          const og = groups.find((g) => g.includes(o.uid));
                          const full =
                            !!og &&
                            !og.includes(s.uid) &&
                            og.length >= PEER_GROUP_MAX;
                          return (
                            <option key={o.uid} value={o.uid} disabled={full}>
                              {o.name}
                            </option>
                          );
                        })}
                    </select>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </Modal>
  );
};
