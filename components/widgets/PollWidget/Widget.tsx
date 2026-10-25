import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  increment,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { logError } from '@/utils/logError';
import { useBoardLinkedShareId } from '@/context/boardLinkedShare';
import {
  useGlobalStyle,
  useDashboardActions,
} from '@/context/dashboardCanvasStore';
import { useAuth } from '@/context/useAuth';
import { WidgetData, PollConfig } from '@/types';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Copy,
  Eye,
  EyeOff,
  Lock,
  LockOpen,
  RotateCcw,
  Radio,
} from 'lucide-react';

import { WidgetLayout } from '@/components/widgets/WidgetLayout';
import { useDialog } from '@/context/useDialog';
import { buildPollJoinUrl } from '@/utils/pollCode';
import { withQuestionAt } from '@/utils/pollQuestions';
import { usePollSession } from '@/hooks/usePollSession';
import { useInSubShare } from '@/hooks/useShareContent';
import { tourAttr } from '@/config/tourAnchors';

export const PollWidget: React.FC<{ widget: WidgetData }> = ({ widget }) => {
  const { updateWidget } = useDashboardActions();
  const { showConfirm } = useDialog();
  const globalStyle = useGlobalStyle();
  const config = widget.config as PollConfig & { _announcementId?: string };
  const { _announcementId } = config;
  const isAnnouncement = !!_announcementId;

  const { user, canAccessFeature } = useAuth();
  // A live session belongs to the teacher's account, so a substitute can
  // neither read its votes nor run it: the widget shows the questions only.
  const inShare = useInSubShare();
  // On a Synced or View-Only board the live session may be another member's: read its votes, don't steer it.
  const boardShareId = useBoardLinkedShareId();
  const sessionOwnerUid = config.activePollSessionOwnerUid ?? null;
  const foreignSession =
    !!boardShareId &&
    !!config.activePollSessionId &&
    !!sessionOwnerUid &&
    sessionOwnerUid !== user?.uid;

  const applyConfig = useCallback(
    (next: PollConfig) => updateWidget(widget.id, { config: next }),
    [updateWidget, widget.id]
  );

  const {
    questions,
    currentQuestionIndex,
    currentQuestion,
    isLive: sessionLive,
    displayOptions: liveOptions,
    canGoPrev,
    canGoNext,
    goToQuestion,
    resultsHidden,
    isLocked,
    setRevealed,
    setLocked,
    resetVotes,
    hasCorrectAnswer,
    answerShown,
    setAnswerShown,
  } = usePollSession({
    config,
    // Announcement embeds have no teacher session — tallies come from the
    // announcement subcollection instead.
    teacherUid:
      isAnnouncement || inShare
        ? undefined
        : foreignSession
          ? (sessionOwnerUid ?? undefined)
          : user?.uid,
    onConfigChange: applyConfig,
  });
  const isLive = sessionLive && !inShare;
  const proEnabled = canAccessFeature('poll-pro') && !isAnnouncement;
  const hidden = proEnabled && resultsHidden;
  // Reveal and lock steer the session, so only its owner sees them.
  // On a linked board only the stamped session owner steers; an unstamped session's owner is unknown.
  const canSteer =
    proEnabled &&
    !inShare &&
    (!boardShareId ||
      !config.activePollSessionId ||
      sessionOwnerUid === user?.uid);
  const showRevealControl = canSteer && config.hideResults === true;
  const showLockControl = canSteer && isLive;
  const showAnswerControl = canSteer && hasCorrectAnswer;
  const markCorrect = proEnabled && answerShown;
  const showAnswered = proEnabled && isLive;
  const barColor = proEnabled ? 'bg-brand-blue-primary' : 'bg-indigo-500';

  // Announcements render the first question only — there is no cursor to share.
  const activeQuestion = isAnnouncement ? questions[0] : currentQuestion;
  const activeIndex = isAnnouncement ? 0 : currentQuestionIndex;
  const showNavigation = !isAnnouncement && questions.length > 1;

  // When rendered inside an announcement, votes are stored in Firestore
  // under /announcements/{id}/pollVotes/{optionIndex} so all users share
  // the same live tallies and the admin can collect results.
  const [announcementVotes, setAnnouncementVotes] = useState<
    Record<number, number>
  >({});
  const [userVoted, setUserVoted] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

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

  const vote = (index: number) => {
    if (isLive) return; // Live device-voting: tallies come from participants.
    if (_announcementId) {
      if (userVoted !== null) return; // one vote per session
      setUserVoted(index);
      setDoc(
        doc(db, 'announcements', _announcementId, 'pollVotes', String(index)),
        { count: increment(1) },
        { merge: true }
      ).catch((err) =>
        logError('PollWidget.vote', err, {
          announcementId: _announcementId,
          index,
        })
      );
      return;
    }
    const newOptions = activeQuestion.options.map((o, i) =>
      i === index ? { ...o, votes: o.votes + 1 } : o
    );
    applyConfig(
      withQuestionAt(config, activeIndex, {
        ...activeQuestion,
        options: newOptions,
      })
    );
  };

  const handleReset = async () => {
    const label =
      questions.length > 1
        ? `Reset votes on all ${questions.length} questions?`
        : 'Are you sure you want to reset the poll?';
    const confirmed = await showConfirm(label, {
      title: 'Reset Poll',
      variant: 'warning',
      confirmLabel: 'Reset',
    });
    if (!confirmed) return;
    resetVotes();
  };

  // Three tally modes: live public session > announcement > local config.
  const displayOptions = isLive
    ? liveOptions
    : isAnnouncement
      ? activeQuestion.options.map((o, i) => ({
          ...o,
          votes: announcementVotes[i] ?? 0,
        }))
      : activeQuestion.options;

  const total = displayOptions.reduce((sum, o) => sum + o.votes, 0);

  // On-board join link/QR/code for the live session (gated by anonymous-join).
  const canOfferAnonymousJoin = canAccessFeature('anonymous-join');
  const joinCode =
    isLive && user && canOfferAnonymousJoin ? (config.joinCode ?? '') : '';
  const joinUrl = joinCode ? buildPollJoinUrl(joinCode) : '';
  const qrUrl = useMemo(
    () =>
      joinUrl
        ? `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(
            joinUrl
          )}`
        : '',
    [joinUrl]
  );

  const handleCopy = () => {
    if (!joinUrl) return;
    void navigator.clipboard.writeText(joinUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const questionChars = Math.max(1, activeQuestion.question.length);

  const arrowStyle = {
    width: 'min(28px, 9cqmin)',
    height: 'min(28px, 9cqmin)',
  };

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
            className="flex items-center"
            style={{ gap: 'min(8px, 2cqmin)' }}
          >
            {showNavigation && (
              <button
                onClick={() => goToQuestion(currentQuestionIndex - 1)}
                disabled={!canGoPrev || foreignSession}
                aria-label="Previous question"
                className={`shrink-0 text-slate-400 ${proEnabled ? 'hover:text-brand-blue-primary' : 'hover:text-indigo-600'} disabled:opacity-30 disabled:hover:text-slate-400 transition-colors`}
              >
                <ChevronLeft style={arrowStyle} />
              </button>
            )}
            <div
              className={`flex-1 min-w-0 font-black uppercase ${isAnnouncement ? 'text-white' : 'text-slate-800'} tracking-tight [overflow-wrap:anywhere] font-${globalStyle.fontFamily}`}
              style={{
                // Long questions shrink so the whole question fits in about 40% of the face.
                fontSize: `min(32px, 10cqmin, ${(64 / Math.sqrt(questionChars)).toFixed(2)}cqmin)`,
                lineHeight: 1.1,
              }}
            >
              {activeQuestion.question}
            </div>
            {showNavigation && (
              <button
                {...tourAttr('poll.next-question', widget.id, widget.type)}
                onClick={() => goToQuestion(currentQuestionIndex + 1)}
                disabled={!canGoNext || foreignSession}
                aria-label="Next question"
                className={`shrink-0 text-slate-400 ${proEnabled ? 'hover:text-brand-blue-primary' : 'hover:text-indigo-600'} disabled:opacity-30 disabled:hover:text-slate-400 transition-colors`}
              >
                <ChevronRight style={arrowStyle} />
              </button>
            )}
          </div>
          {(showNavigation || showAnswered) && (
            <div
              className="flex items-center justify-center font-bold text-slate-400 tabular-nums"
              style={{
                gap: 'min(12px, 3cqmin)',
                fontSize: 'min(12px, 4cqmin)',
                marginTop: 'min(4px, 1cqmin)',
              }}
            >
              {showNavigation && (
                <span
                  data-testid="poll-question-indicator"
                  className="font-mono"
                >
                  {currentQuestionIndex + 1} / {questions.length}
                </span>
              )}
              {showAnswered && (
                <span data-testid="poll-answered-count">{total} answered</span>
              )}
              {showAnswered && isLocked && (
                <span
                  className="flex items-center"
                  style={{ gap: 'min(4px, 1cqmin)' }}
                >
                  <Lock
                    style={{
                      width: 'min(12px, 4cqmin)',
                      height: 'min(12px, 4cqmin)',
                    }}
                  />
                  Voting locked
                </span>
              )}
            </div>
          )}
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
          {isAnnouncement && userVoted !== null && (
            <div
              className="text-center font-semibold text-emerald-400"
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
              isAnnouncement && userVoted !== null && !isVoted
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
                disabled={isLive || (isAnnouncement && userVoted !== null)}
                className={buttonCls}
              >
                <div
                  className={`flex justify-between mb-1 uppercase tracking-wider ${isAnnouncement ? 'text-white/90' : 'text-slate-600'} font-${globalStyle.fontFamily}`}
                  style={{
                    fontSize: 'min(16px, 5.5cqmin)',
                    gap: 'min(16px, 3cqmin)',
                  }}
                >
                  <span className="font-bold min-w-0 [overflow-wrap:anywhere]">
                    {markCorrect && o.correct && (
                      <CircleCheck
                        aria-label="Correct answer"
                        className="inline-block align-[-0.15em] text-emerald-700"
                        style={{
                          width: '1em',
                          height: '1em',
                          marginRight: '0.3em',
                        }}
                      />
                    )}
                    {o.label}
                  </span>
                  {!hidden && (
                    <span className="font-mono whitespace-nowrap shrink-0">
                      {o.votes} ({percent}%)
                    </span>
                  )}
                </div>

                <div
                  className="bg-slate-100 rounded-full overflow-hidden relative border border-slate-200/50"
                  style={{ height: 'clamp(16px, 5cqmin, 24px)' }}
                >
                  <div
                    className={`h-full transition-all duration-500 motion-reduce:transition-none shadow-[inset_0_2px_4px_rgba(255,255,255,0.3)] ${isVoted || (markCorrect && o.correct) ? 'bg-emerald-500' : barColor}`}
                    style={{ width: hidden ? '0%' : `${percent}%` }}
                  />
                </div>
              </button>
            );
          })}
        </div>
      }
      footer={
        <>
          {(showRevealControl || showLockControl || showAnswerControl) && (
            <div
              data-testid="poll-results-controls"
              className="flex items-center justify-center whitespace-nowrap"
              style={{
                gap: 'min(8px, 2cqmin)',
                paddingLeft: 'min(16px, 3cqmin)',
                paddingRight: 'min(16px, 3cqmin)',
                paddingBottom: 'min(8px, 1.5cqmin)',
              }}
            >
              {showRevealControl && (
                <button
                  {...tourAttr('poll.reveal-results', widget.id, widget.type)}
                  onClick={() => setRevealed(resultsHidden)}
                  aria-pressed={!resultsHidden}
                  className="relative touch-target-expand flex items-center font-bold text-slate-600 hover:text-brand-blue-primary hover:bg-brand-blue-lighter rounded-lg transition-colors"
                  style={{
                    gap: 'min(6px, 1.5cqmin)',
                    padding: 'min(6px, 1.5cqmin) min(10px, 2.5cqmin)',
                    fontSize: 'min(13px, 4cqmin)',
                  }}
                >
                  {resultsHidden ? (
                    <Eye
                      style={{
                        width: 'min(16px, 4.5cqmin)',
                        height: 'min(16px, 4.5cqmin)',
                      }}
                    />
                  ) : (
                    <EyeOff
                      style={{
                        width: 'min(16px, 4.5cqmin)',
                        height: 'min(16px, 4.5cqmin)',
                      }}
                    />
                  )}
                  {resultsHidden ? 'Show results' : 'Hide results'}
                </button>
              )}
              {showLockControl && (
                <button
                  {...tourAttr('poll.lock-voting', widget.id, widget.type)}
                  onClick={() => setLocked(!isLocked)}
                  aria-pressed={isLocked}
                  className="relative touch-target-expand flex items-center font-bold text-slate-600 hover:text-brand-blue-primary hover:bg-brand-blue-lighter rounded-lg transition-colors"
                  style={{
                    gap: 'min(6px, 1.5cqmin)',
                    padding: 'min(6px, 1.5cqmin) min(10px, 2.5cqmin)',
                    fontSize: 'min(13px, 4cqmin)',
                  }}
                >
                  {isLocked ? (
                    <LockOpen
                      style={{
                        width: 'min(16px, 4.5cqmin)',
                        height: 'min(16px, 4.5cqmin)',
                      }}
                    />
                  ) : (
                    <Lock
                      style={{
                        width: 'min(16px, 4.5cqmin)',
                        height: 'min(16px, 4.5cqmin)',
                      }}
                    />
                  )}
                  {isLocked ? 'Unlock voting' : 'Lock voting'}
                </button>
              )}
              {showAnswerControl && (
                <button
                  {...tourAttr('poll.show-answer', widget.id, widget.type)}
                  onClick={() => setAnswerShown(!answerShown)}
                  aria-pressed={answerShown}
                  className="relative touch-target-expand flex items-center font-bold text-slate-600 hover:text-brand-blue-primary hover:bg-brand-blue-lighter rounded-lg transition-colors"
                  style={{
                    gap: 'min(6px, 1.5cqmin)',
                    padding: 'min(6px, 1.5cqmin) min(10px, 2.5cqmin)',
                    fontSize: 'min(13px, 4cqmin)',
                  }}
                >
                  <CircleCheck
                    style={{
                      width: 'min(16px, 4.5cqmin)',
                      height: 'min(16px, 4.5cqmin)',
                    }}
                  />
                  {answerShown ? 'Hide answer' : 'Show answer'}
                </button>
              )}
            </div>
          )}
          {isLive ? (
            <div
              className="flex items-center justify-center"
              style={{
                gap: 'min(12px, 3cqmin)',
                paddingLeft: 'min(16px, 3cqmin)',
                paddingRight: 'min(16px, 3cqmin)',
                paddingBottom: 'min(8px, 1.5cqmin)',
              }}
            >
              {joinCode ? (
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
                      className="text-slate-500 uppercase font-bold tracking-wider"
                      style={{ fontSize: 'min(10px, 3.2cqmin)' }}
                    >
                      Join at {window.location.host}/poll
                    </span>
                    <code
                      data-testid="poll-join-url"
                      className={`font-black ${proEnabled ? 'text-brand-blue-primary' : 'text-indigo-600'} font-mono tracking-[0.15em]`}
                      style={{ fontSize: 'min(28px, 9cqmin)', lineHeight: 1.1 }}
                    >
                      {joinCode}
                    </code>
                    {/* no-tour-anchor: tours use widget-settings.poll.copy-link */}
                    <button
                      onClick={handleCopy}
                      className={`flex items-center font-bold text-slate-400 ${proEnabled ? 'hover:text-brand-blue-primary' : 'hover:text-indigo-600'} transition-colors`}
                      style={{
                        gap: 'min(4px, 1cqmin)',
                        fontSize: 'min(11px, 3.5cqmin)',
                      }}
                    >
                      {copied ? (
                        <Check
                          style={{
                            width: 'min(12px, 3.5cqmin)',
                            height: 'min(12px, 3.5cqmin)',
                          }}
                        />
                      ) : (
                        <Copy
                          style={{
                            width: 'min(12px, 3.5cqmin)',
                            height: 'min(12px, 3.5cqmin)',
                          }}
                        />
                      )}
                      {copied ? 'Copied' : 'Copy link'}
                    </button>
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
                  {showAnswered && isLocked ? 'Voting locked' : 'Voting open'}
                </span>
              )}
            </div>
          ) : !isAnnouncement && !inShare ? (
            <div
              style={{
                paddingLeft: 'min(16px, 3cqmin)',
                paddingRight: 'min(16px, 3cqmin)',
                paddingBottom: 'min(8px, 1.5cqmin)',
              }}
            >
              <button
                {...tourAttr('poll.reset', widget.id, widget.type)}
                onClick={handleReset}
                className={`w-full flex items-center justify-center font-black uppercase text-slate-400 ${proEnabled ? 'hover:text-brand-blue-primary hover:bg-brand-blue-lighter' : 'hover:text-indigo-600 hover:bg-indigo-50'} rounded-lg transition-all`}
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
          ) : null}
        </>
      }
    />
  );
};
