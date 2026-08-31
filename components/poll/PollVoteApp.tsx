import React, { useEffect, useMemo, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { auth, db } from '@/config/firebase';
import { signInAnonymously } from 'firebase/auth';
import { collection, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { type PollSessionDoc } from '@/types';
import { normalizePollCode } from '@/utils/pollCode';
import { clampQuestionIndex } from '@/utils/pollQuestions';
import {
  aggregateVotes,
  lookupPollSessionByCode,
  type PollVoteEntry,
} from './pollSession';

type Status = 'loading' | 'error' | 'ready';

const Shell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="h-screen overflow-y-auto bg-slate-100">
    <div className="min-h-full flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-xl bg-white rounded-2xl shadow-xl overflow-hidden">
        {children}
      </div>
    </div>
  </div>
);

/**
 * Anonymous, audience-facing poll voting app served at `/poll?code=XXXXX`.
 * The code resolves to a `poll_sessions` doc; the participant signs in
 * anonymously, then follows the teacher's `currentQuestionIndex` in lockstep,
 * writing one `{questionIndex}_{uid}` vote doc per question. Re-tapping a
 * different option overwrites that question's vote (one per device).
 */
export const PollVoteApp: React.FC = () => {
  const code = useMemo(
    () =>
      normalizePollCode(
        new URLSearchParams(window.location.search).get('code') ?? ''
      ),
    []
  );

  const [status, setStatus] = useState<Status>('loading');
  const [sessionId, setSessionId] = useState('');
  const [session, setSession] = useState<PollSessionDoc | null>(null);
  const [votes, setVotes] = useState<PollVoteEntry[]>([]);
  const [uid, setUid] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [writeRejected, setWriteRejected] = useState(false);

  // Sign in anonymously, then resolve the join code to its session doc. Both
  // are external-system calls — the correct use of an effect.
  useEffect(() => {
    if (!code) {
      setStatus('error');
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        if (!auth.currentUser) {
          await signInAnonymously(auth);
        }
        if (cancelled) return;
        setUid(auth.currentUser?.uid ?? '');
        const found = await lookupPollSessionByCode(code);
        if (cancelled) return;
        if (!found) {
          setStatus('error');
          return;
        }
        setSessionId(found.sessionId);
        setSession(found.data);
        setStatus('ready');
      } catch {
        if (!cancelled) setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code]);

  // One listener for every question's votes, plus the session doc — the latter
  // drives both the waiting/closed banners and the teacher's question cursor.
  useEffect(() => {
    if (!sessionId) return;
    const unsubVotes = onSnapshot(
      collection(db, 'poll_sessions', sessionId, 'votes'),
      (snap) => {
        setVotes(
          snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<PollVoteEntry, 'id'>),
          }))
        );
      }
    );
    const unsubSession = onSnapshot(
      doc(db, 'poll_sessions', sessionId),
      (snap) => {
        if (snap.exists()) setSession(snap.data() as PollSessionDoc);
      }
    );
    return () => {
      unsubVotes();
      unsubSession();
    };
  }, [sessionId]);

  const questions = session?.questions ?? [];
  const questionIndex = clampQuestionIndex(
    session?.currentQuestionIndex,
    questions.length
  );
  const question = questions[questionIndex];
  const started = session?.startedAt != null;
  const isActive = session?.active === true;
  const closed = (started && !isActive) || writeRejected;

  const options = question?.options ?? [];
  const tally = aggregateVotes(votes, questionIndex, options.length);
  const total = tally.reduce((sum, n) => sum + n, 0);
  const votedIndex =
    votes.find((v) => v.id === `${questionIndex}_${uid}`)?.optionIndex ?? null;
  const hasVoted = votedIndex !== null;

  const castVote = async (index: number) => {
    if (!sessionId) return;
    setSubmitting(true);
    try {
      // Prefer the uid from the sign-in credential over reading auth.currentUser
      // afterward — robust even if the SDK ever deferred the currentUser update.
      let voterUid = uid || auth.currentUser?.uid;
      if (!voterUid) {
        const credential = await signInAnonymously(auth);
        voterUid = credential.user.uid;
        setUid(voterUid);
      }
      await setDoc(
        doc(
          db,
          'poll_sessions',
          sessionId,
          'votes',
          `${questionIndex}_${voterUid}`
        ),
        {
          questionIndex,
          optionIndex: index,
          votedAt: Date.now(),
        }
      );
      setWriteRejected(false);
    } catch {
      // A rejected write means the session went inactive between the snapshot
      // and the tap. Show the same clean closed state.
      setWriteRejected(true);
    } finally {
      setSubmitting(false);
    }
  };

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center gap-3 p-4">
        <Loader2 className="w-5 h-5 animate-spin" />
        Finding your poll…
      </div>
    );
  }

  if (status === 'error' || !question) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-4 text-center">
        This poll isn&apos;t available right now. Check the code with your
        teacher.
      </div>
    );
  }

  if (!started) {
    return (
      <Shell>
        <div className="bg-brand-blue-primary text-white px-5 py-4">
          <p className="text-xs uppercase tracking-widest font-bold opacity-90">
            Poll {code}
          </p>
          <h1 className="text-xl font-black">You&apos;re in!</h1>
        </div>
        <div className="p-8 flex flex-col items-center gap-3 text-center">
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
          <p className="text-slate-600 font-semibold">
            Waiting for your teacher to open voting…
          </p>
          <p className="text-slate-500 text-sm">
            Keep this page open — the first question appears automatically.
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="bg-brand-blue-primary text-white px-5 py-4">
        <p className="text-xs uppercase tracking-widest font-bold opacity-90">
          {questions.length > 1
            ? `Question ${questionIndex + 1} of ${questions.length}`
            : 'Poll'}
        </p>
        <h1 className="text-xl font-black">{question.question}</h1>
      </div>

      <div className="p-5 space-y-3">
        {hasVoted && (
          <div className="flex items-center justify-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-2 text-emerald-700 text-sm font-bold">
            <Check className="w-4 h-4" />
            {closed
              ? 'Your vote is in!'
              : 'Your vote is in! Tap another option to change it.'}
          </div>
        )}

        {closed && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-2 text-amber-700 text-sm font-medium text-center">
            Voting is closed.
          </div>
        )}

        {options.map((option, index) => {
          const count = tally[index] ?? 0;
          const percent = total === 0 ? 0 : Math.round((count / total) * 100);
          const isMine = votedIndex === index;
          return (
            <button
              key={option.id}
              type="button"
              disabled={submitting || closed}
              onClick={() => {
                void castVote(index);
              }}
              className={`w-full text-left rounded-xl border p-4 transition-all active:scale-[0.99] disabled:opacity-60 ${
                isMine
                  ? 'border-emerald-400 bg-emerald-50'
                  : 'border-slate-300 bg-white hover:border-brand-blue-primary'
              }`}
              aria-pressed={isMine}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-bold text-slate-800">{option.label}</span>
                {hasVoted && (
                  <span
                    className="font-mono text-sm text-slate-500 whitespace-nowrap"
                    data-testid={`poll-tally-${index}`}
                  >
                    {count} ({percent}%)
                  </span>
                )}
              </div>
              {hasVoted && (
                <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 ${
                      isMine ? 'bg-emerald-500' : 'bg-indigo-500'
                    }`}
                    style={{ width: `${percent}%` }}
                  />
                </div>
              )}
            </button>
          );
        })}

        {submitting && (
          <div className="flex items-center justify-center gap-2 text-slate-500 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            Sending your vote…
          </div>
        )}
      </div>
    </Shell>
  );
};
