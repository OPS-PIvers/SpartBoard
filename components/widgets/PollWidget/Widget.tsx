import React, { useState, useEffect } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  increment,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import { WidgetData, PollConfig, DEFAULT_GLOBAL_STYLE } from '@/types';
import { RotateCcw, Radio } from 'lucide-react';

import { WidgetLayout } from '@/components/widgets/WidgetLayout';
import { useDialog } from '@/context/useDialog';
import { buildPublicPollLink } from '@/components/poll/pollLink';
import {
  aggregateVotes,
  makePollSessionId,
} from '@/components/poll/pollSession';

export const PollWidget: React.FC<{ widget: WidgetData }> = ({ widget }) => {
  const { updateWidget, activeDashboard } = useDashboard();
  const { showConfirm } = useDialog();
  const globalStyle = activeDashboard?.globalStyle ?? DEFAULT_GLOBAL_STYLE;
  const config = widget.config as PollConfig & { _announcementId?: string };
  const { question = 'Vote Now!', _announcementId } = config;
  const options = Array.isArray(config.options) ? config.options : [];

  const { user, canAccessFeature } = useAuth();
  const activePollSessionId = config.activePollSessionId ?? null;
  const isLive = !!activePollSessionId;

  // Live device-voting tallies, aggregated from the votes subcollection.
  const [sessionTally, setSessionTally] = useState<number[]>([]);

  // When rendered inside an announcement, votes are stored in Firestore
  // under /announcements/{id}/pollVotes/{optionIndex} so all users share
  // the same live tallies and the admin can collect results.
  const [announcementVotes, setAnnouncementVotes] = useState<
    Record<number, number>
  >({});
  const [userVoted, setUserVoted] = useState<number | null>(null);

  useEffect(() => {
    if (!_announcementId) return;
    const unsub = onSnapshot(
      collection(db, 'announcements', _announcementId, 'pollVotes'),
      (snap) => {
        const counts: Record<number, number> = {};
        snap.forEach((d) => {
          const data = d.data() as { count: number };
          counts[Number(d.id)] = data.count ?? 0;
        });
        setAnnouncementVotes(counts);
      }
    );
    return unsub;
  }, [_announcementId]);

  // Subscribe to the public voting session's votes subcollection while a
  // session is live. Aggregated counts replace the local/announcement tally
  // on the board. Synchronisation with Firestore — the correct use of effect.
  useEffect(() => {
    if (!activePollSessionId || !user) return;
    const sessionId = makePollSessionId(user.uid, activePollSessionId);
    const unsub = onSnapshot(
      collection(db, 'poll_sessions', sessionId, 'votes'),
      (snap) => {
        const votes = snap.docs.map((d) => d.data() as { optionIndex: number });
        setSessionTally(aggregateVotes(votes, options.length));
      }
    );
    return unsub;
  }, [activePollSessionId, user, options.length]);

  const vote = (index: number) => {
    if (isLive) return; // Live device-voting: tallies come from participants.
    if (_announcementId) {
      if (userVoted !== null) return; // one vote per session
      setUserVoted(index);
      void setDoc(
        doc(db, 'announcements', _announcementId, 'pollVotes', String(index)),
        { count: increment(1) },
        { merge: true }
      );
      return;
    }
    const newOptions = [...options];
    newOptions[index] = {
      ...newOptions[index],
      votes: newOptions[index].votes + 1,
    };
    updateWidget(widget.id, {
      config: { ...config, options: newOptions } as PollConfig,
    });
  };

  const handleReset = async () => {
    const confirmed = await showConfirm(
      'Are you sure you want to reset the poll?',
      { title: 'Reset Poll', variant: 'warning', confirmLabel: 'Reset' }
    );
    if (!confirmed) return;
    updateWidget(widget.id, {
      config: {
        ...config,
        options: options.map((o) => ({ ...o, votes: 0 })),
      } as PollConfig,
    });
  };

  // Three tally modes: live public session > announcement > local config.
  const displayOptions = isLive
    ? options.map((o, i) => ({ ...o, votes: sessionTally[i] ?? 0 }))
    : _announcementId
      ? options.map((o, i) => ({ ...o, votes: announcementVotes[i] ?? 0 }))
      : options;

  const total = displayOptions.reduce((sum, o) => sum + o.votes, 0);

  // On-board join link/QR for the live session (gated by anonymous-join).
  const joinUrl =
    isLive && user && canAccessFeature('anonymous-join')
      ? buildPublicPollLink({
          id: activePollSessionId,
          question,
          options: options.map((o) => ({ id: o.id, label: o.label })),
          teacherUid: user.uid,
        })
      : '';
  const qrUrl = joinUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(
        joinUrl
      )}`
    : '';

  return (
    <WidgetLayout
      padding="p-0"
      header={
        <div
          style={{
            paddingLeft: 'min(16px, 3cqmin)',
            paddingRight: 'min(16px, 3cqmin)',
            paddingTop: 'min(16px, 3cqmin)',
            paddingBottom: 'min(8px, 1.5cqmin)',
          }}
        >
          <div
            className={`font-black uppercase ${_announcementId ? 'text-white' : 'text-slate-800'} tracking-tight font-${globalStyle.fontFamily}`}
            style={{ fontSize: 'min(32px, 10cqmin)', lineHeight: 1.1 }}
          >
            {question}
          </div>
        </div>
      }
      content={
        <div
          className="w-full h-full overflow-y-auto custom-scrollbar flex flex-col"
          style={{
            padding: 'min(16px, 3cqmin)',
            gap: 'min(16px, 3cqmin)',
          }}
        >
          {_announcementId && userVoted !== null && (
            <div
              className={`text-center font-semibold ${_announcementId ? 'text-emerald-400' : 'text-emerald-600'}`}
              style={{ fontSize: 'min(14px, 4cqmin)' }}
            >
              ✓ Vote recorded!
            </div>
          )}
          {displayOptions.map((o, i: number) => {
            const percent =
              total === 0 ? 0 : Math.round((o.votes / total) * 100);
            const isVoted = userVoted === i;

            const buttonCls = [
              'w-full text-left group',
              isVoted ? 'opacity-100' : '',
              _announcementId && userVoted !== null && !isVoted
                ? 'opacity-60'
                : '',
            ]
              .filter(Boolean)
              .join(' ');

            return (
              <button
                key={o.id ?? i}
                onClick={() => {
                  vote(i);
                }}
                disabled={
                  isLive ||
                  (_announcementId !== undefined && userVoted !== null)
                }
                className={buttonCls}
              >
                <div
                  className={`flex justify-between mb-1 uppercase tracking-wider ${_announcementId ? 'text-white/90' : 'text-slate-600'} font-${globalStyle.fontFamily}`}
                  style={{ fontSize: 'min(16px, 5.5cqmin)' }}
                >
                  <span className="font-bold truncate pr-4">{o.label}</span>
                  <span className="font-mono whitespace-nowrap">
                    {o.votes} ({percent}%)
                  </span>
                </div>

                <div className="h-[min(5cqmin)] min-h-[16px] bg-slate-100 rounded-full overflow-hidden relative border border-slate-200/50">
                  <div
                    className={`h-full transition-all duration-500 shadow-[inset_0_2px_4px_rgba(255,255,255,0.3)] ${isVoted ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                    style={{ width: `${percent}%` }}
                  />
                </div>
              </button>
            );
          })}
        </div>
      }
      footer={
        isLive ? (
          <div
            className="flex items-center justify-center"
            style={{
              gap: 'min(12px, 3cqmin)',
              paddingLeft: 'min(16px, 3cqmin)',
              paddingRight: 'min(16px, 3cqmin)',
              paddingBottom: 'min(8px, 1.5cqmin)',
            }}
          >
            {qrUrl ? (
              <>
                <img
                  src={qrUrl}
                  alt="Join QR code"
                  className="rounded bg-white"
                  style={{
                    width: 'min(72px, 22cqmin)',
                    height: 'min(72px, 22cqmin)',
                    padding: 'min(4px, 1cqmin)',
                  }}
                />
                <div className="flex flex-col min-w-0">
                  <span
                    className="flex items-center font-black uppercase text-emerald-600"
                    style={{
                      gap: 'min(4px, 1cqmin)',
                      fontSize: 'min(12px, 4cqmin)',
                    }}
                  >
                    <Radio
                      style={{
                        width: 'min(12px, 4cqmin)',
                        height: 'min(12px, 4cqmin)',
                      }}
                    />
                    Voting open
                  </span>
                  <code
                    data-testid="poll-join-url"
                    className="truncate text-indigo-500 font-mono"
                    style={{ fontSize: 'min(11px, 3.5cqmin)' }}
                  >
                    {joinUrl}
                  </code>
                </div>
              </>
            ) : (
              <span
                className="flex items-center font-black uppercase text-emerald-600"
                style={{
                  gap: 'min(4px, 1cqmin)',
                  fontSize: 'min(12px, 4cqmin)',
                }}
              >
                <Radio
                  style={{
                    width: 'min(12px, 4cqmin)',
                    height: 'min(12px, 4cqmin)',
                  }}
                />
                Voting open
              </span>
            )}
          </div>
        ) : !_announcementId ? (
          <div
            style={{
              paddingLeft: 'min(16px, 3cqmin)',
              paddingRight: 'min(16px, 3cqmin)',
              paddingBottom: 'min(8px, 1.5cqmin)',
            }}
          >
            <button
              onClick={handleReset}
              className="w-full flex items-center justify-center font-black uppercase text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
              style={{
                gap: 'min(8px, 2cqmin)',
                padding: 'min(8px, 1.5cqmin)',
                fontSize: 'min(14px, 4cqmin)',
              }}
            >
              <RotateCcw
                style={{
                  width: 'min(16px, 4cqmin)',
                  height: 'min(16px, 4cqmin)',
                }}
              />{' '}
              Reset Poll
            </button>
          </div>
        ) : null
      }
    />
  );
};
