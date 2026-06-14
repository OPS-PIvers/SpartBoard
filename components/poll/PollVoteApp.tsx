import React, { useEffect, useMemo, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { auth, db } from '@/config/firebase';
import { signInAnonymously } from 'firebase/auth';
import { collection, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { type PollVoteDoc } from '@/types';
import { decodePollPayload, type PollVotePayload } from './pollLink';
import { aggregateVotes, makePollSessionId } from './pollSession';

type State = { kind: 'ready'; payload: PollVotePayload } | { kind: 'error' };

/**
 * Anonymous, audience-facing poll voting app served at `/poll/:pollId`.
 * The `?data=` payload is authoritative (no Firestore read needed to render);
 * the participant signs in anonymously, writes one uid-keyed vote doc, and
 * sees the live tally. Re-tapping a different option overwrites the prior
 * vote (one vote per device) until the teacher closes voting.
 */
export const PollVoteApp: React.FC = () => {
  // Parse synchronously at mount so URL launches render with no loading flash.
  const payload = useMemo(() => decodePollPayload(), []);
  const [state] = useState<State>(() =>
    payload ? { kind: 'ready', payload } : { kind: 'error' }
  );

  const ready = state.kind === 'ready' ? state.payload : null;
  const sessionId = useMemo(
    () => (ready ? makePollSessionId(ready.teacherUid, ready.id) : ''),
    [ready]
  );

  const [votedIndex, setVotedIndex] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [closed, setClosed] = useState(false);
  const [tally, setTally] = useState<number[]>([]);

  // Subscribe to the live votes subcollection AND the session doc (reads are
  // open to any authed user — anonymous vote docs carry no PII). Sign in
  // anonymously first so the reads are authorized. The session-doc listener
  // drives the `closed` banner reactively from the `active` flag, so a
  // participant learns the teacher closed voting without having to attempt a
  // (guaranteed-to-fail) write first. Synchronisation with an external system,
  // which is what useEffect is for.
  useEffect(() => {
    if (!ready) return;
    let unsubVotes: () => void = () => undefined;
    let unsubSession: () => void = () => undefined;
    let cancelled = false;
    void (async () => {
      try {
        if (!auth.currentUser) {
          await signInAnonymously(auth);
        }
      } catch {
        // If anonymous sign-in fails the listeners simply won't attach;
        // the vote attempt below will surface the error.
      }
      if (cancelled) return;
      unsubVotes = onSnapshot(
        collection(db, 'poll_sessions', sessionId, 'votes'),
        (snap) => {
          const votes = snap.docs.map((d) => d.data() as PollVoteDoc);
          setTally(aggregateVotes(votes, ready.options.length));
        }
      );
      unsubSession = onSnapshot(doc(db, 'poll_sessions', sessionId), (snap) => {
        const active =
          snap.exists() &&
          (snap.data() as { active?: boolean }).active === true;
        setClosed(!active);
      });
    })();
    return () => {
      cancelled = true;
      unsubVotes();
      unsubSession();
    };
  }, [ready, sessionId]);

  const castVote = async (index: number) => {
    if (!ready) return;
    setSubmitting(true);
    try {
      // Prefer the uid from the sign-in credential over reading auth.currentUser
      // afterward — robust even if the SDK ever deferred the currentUser update.
      let uid = auth.currentUser?.uid;
      if (!uid) {
        const credential = await signInAnonymously(auth);
        uid = credential.user.uid;
      }
      await setDoc(doc(db, 'poll_sessions', sessionId, 'votes', uid), {
        optionIndex: index,
        votedAt: Date.now(),
      });
      setVotedIndex(index);
      setClosed(false);
    } catch {
      // A rejected write means the session is inactive (closed) or the link
      // is no longer valid. Show the same clean closed state either way.
      setClosed(true);
    } finally {
      setSubmitting(false);
    }
  };

  if (!ready) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-4 text-center">
        This poll isn&apos;t available right now. Ask your teacher for a new
        link.
      </div>
    );
  }

  const total = tally.reduce((sum, n) => sum + n, 0);
  const hasVoted = votedIndex !== null;

  return (
    <div className="h-screen overflow-y-auto bg-slate-100">
      <div className="min-h-full flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-xl bg-white rounded-2xl shadow-xl overflow-hidden">
          <div className="bg-brand-blue-primary text-white px-5 py-4">
            <p className="text-xs uppercase tracking-widest font-bold opacity-90">
              Poll
            </p>
            <h1 className="text-xl font-black">{ready.question}</h1>
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

            {ready.options.map((option, index) => {
              const count = tally[index] ?? 0;
              const percent =
                total === 0 ? 0 : Math.round((count / total) * 100);
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
                    <span className="font-bold text-slate-800">
                      {option.label}
                    </span>
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
              <div className="flex items-center justify-center gap-2 text-slate-400 text-sm">
                <Loader2 className="w-4 h-4 animate-spin" />
                Sending your vote…
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
