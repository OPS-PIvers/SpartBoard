/**
 * RemoteActivityWallControl
 *
 * Phone remote for the Activity Wall widget. Lets a teacher:
 *   • Open / close the active wall (writes `acceptingResponses` to both the
 *     library entry and the mirrored session doc, exactly like the widget).
 *   • Moderate the live queue — approve pending posts or remove them.
 *   • Show a join QR for the student link.
 *
 * Walls are read from `useActivityWallLibrary` (the source of truth) rather
 * than the deprecated `config.activities`, and the student link comes from
 * the shared `utils/activityWallLinks` builder so the remote and the widget
 * can never drift apart.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Check, Lock, QrCode, Trash2, Unlock } from 'lucide-react';
import { WidgetData, ActivityWallConfig } from '@/types';
import { useAuth } from '@/context/useAuth';
import { useActivityWallLibrary } from '@/hooks/useActivityWallLibrary';
import { db } from '@/config/firebase';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import {
  activityWallSessionId,
  buildStudentWallLink,
} from '@/utils/activityWallLinks';

interface RemoteActivityWallControlProps {
  widget: WidgetData;
  updateWidget: (id: string, updates: Partial<WidgetData>) => void;
}

/** Live submission shape mirrored from the widget's onSnapshot map. */
interface RemoteSubmission {
  id: string;
  content: string;
  submittedAt: number;
  status?: 'approved' | 'pending';
  participantLabel?: string;
}

export const RemoteActivityWallControl: React.FC<
  RemoteActivityWallControlProps
> = ({ widget, updateWidget }) => {
  const { user, canAccessFeature } = useAuth();
  const config = (widget.config ?? {}) as ActivityWallConfig;
  const canOfferAnonymousJoin = canAccessFeature('anonymous-join');
  const { activities, saveActivity } = useActivityWallLibrary(user?.uid);

  const activeActivity = useMemo(
    () =>
      activities.find((entry) => entry.id === config.activeActivityId) ?? null,
    [activities, config.activeActivityId]
  );
  const isOpen = activeActivity?.acceptingResponses !== false;

  const [submissions, setSubmissions] = useState<RemoteSubmission[]>([]);
  const [showQr, setShowQr] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const sessionId =
    activeActivity && user
      ? activityWallSessionId(user.uid, activeActivity.id)
      : null;

  const participantUrl = useMemo(() => {
    if (!sessionId || !activeActivity) return '';
    return buildStudentWallLink(
      window.location.origin,
      sessionId,
      activeActivity.allowGuests ?? false
    );
  }, [activeActivity, sessionId]);

  const qrUrl = useMemo(() => {
    if (!participantUrl) return '';
    return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(
      participantUrl
    )}`;
  }, [participantUrl]);

  useEffect(() => {
    if (!sessionId) return;
    const unsubscribe = onSnapshot(
      collection(db, 'activity_wall_sessions', sessionId, 'submissions'),
      (snap) => {
        setSubmissions(
          snap.docs.map((docSnap) => {
            const data = docSnap.data();
            return {
              id: docSnap.id ?? (data.id as string),
              content: data.content as string,
              submittedAt: data.submittedAt as number,
              status: data.status as 'approved' | 'pending' | undefined,
              participantLabel: data.participantLabel as string | undefined,
            };
          })
        );
      }
    );
    return () => {
      unsubscribe();
      setSubmissions([]);
    };
  }, [sessionId]);

  const pending = useMemo(
    () => submissions.filter((s) => s.status === 'pending'),
    [submissions]
  );

  const submissionRef = (submissionId: string) =>
    doc(
      db,
      'activity_wall_sessions',
      sessionId ?? '',
      'submissions',
      submissionId
    );

  const approve = (submissionId: string) => {
    if (!sessionId) return;
    setActionError(null);
    void updateDoc(submissionRef(submissionId), { status: 'approved' }).catch(
      (err) => {
        console.error('[RemoteActivityWall] approve failed:', err);
        setActionError(
          "Couldn't update the submission. Check your connection and try again."
        );
      }
    );
  };

  const remove = (submissionId: string) => {
    if (!sessionId) return;
    setActionError(null);
    void deleteDoc(submissionRef(submissionId)).catch((err) => {
      console.error('[RemoteActivityWall] remove failed:', err);
      setActionError(
        "Couldn't update the submission. Check your connection and try again."
      );
    });
  };

  const toggleOpen = () => {
    if (!activeActivity || !sessionId) {
      // No wall selected yet — pick the most recent one so the remote can act.
      const first = activities[0];
      if (!first) return;
      updateWidget(widget.id, {
        config: { ...config, activeActivityId: first.id },
      });
      return;
    }
    const next = !isOpen;
    setActionError(null);
    void (async () => {
      try {
        await saveActivity({
          ...activeActivity,
          acceptingResponses: next,
          updatedAt: Date.now(),
        });
        await setDoc(
          doc(db, 'activity_wall_sessions', sessionId),
          { acceptingResponses: next, updatedAt: Date.now() },
          { merge: true }
        );
      } catch (err) {
        console.error('[RemoteActivityWall] open/close failed:', err);
        setActionError(
          "Couldn't change the wall state. Check your connection and try again."
        );
      }
    })();
  };

  const canToggle = activities.length > 0;

  return (
    <div className="flex flex-col gap-5 p-6 h-full">
      <div className="text-white/60 text-xs uppercase tracking-widest font-bold text-center">
        Activity Wall
      </div>

      <button
        onClick={toggleOpen}
        disabled={!canToggle}
        style={{ touchAction: 'manipulation' }}
        className={`touch-manipulation flex items-center justify-center gap-3 px-8 py-4 rounded-2xl font-black text-lg shadow-lg transition-all active:scale-95 disabled:opacity-40 ${
          isOpen && activeActivity
            ? 'bg-red-500 hover:bg-red-600 text-white'
            : 'bg-green-500 hover:bg-green-600 text-white'
        }`}
        aria-label={isOpen && activeActivity ? 'Close wall' : 'Open wall'}
        aria-pressed={!!activeActivity && isOpen}
      >
        {isOpen && activeActivity ? (
          <>
            <Lock className="w-6 h-6" /> Close Wall
          </>
        ) : (
          <>
            <Unlock className="w-6 h-6" /> Open Wall
          </>
        )}
      </button>

      {canOfferAnonymousJoin && (
        <button
          onClick={() => setShowQr((v) => !v)}
          style={{ touchAction: 'manipulation' }}
          className={`touch-manipulation flex items-center justify-center gap-2 px-6 py-3 rounded-xl border font-bold transition-all active:scale-95 ${
            showQr
              ? 'bg-blue-500/20 border-blue-400/60 text-blue-300'
              : 'bg-white/10 border-white/20 text-white/60 hover:bg-white/20'
          }`}
          aria-label={showQr ? 'Hide join QR' : 'Show join QR'}
          aria-pressed={showQr}
        >
          <QrCode className="w-5 h-5" />
          {showQr ? 'Hide Join QR' : 'Show Join QR'}
        </button>
      )}

      {canOfferAnonymousJoin && showQr && (
        <div className="flex flex-col items-center gap-3 p-4 rounded-2xl bg-white/5 border border-white/10">
          {participantUrl ? (
            <>
              <img
                src={qrUrl}
                alt="Join QR code"
                width={220}
                height={220}
                className="rounded-xl bg-white p-2"
              />
              <p className="text-white/50 text-xs text-center">
                Scan to join, or open this link:
              </p>
              <code
                data-testid="activity-wall-join-url"
                className="select-all break-all text-center text-blue-300 text-xs font-mono px-2"
              >
                {participantUrl}
              </code>
            </>
          ) : (
            <p className="text-white/40 text-sm text-center">
              Pick a wall on the board to generate a join link.
            </p>
          )}
        </div>
      )}

      {actionError && (
        <div
          role="alert"
          className="flex items-start justify-between gap-3 px-4 py-3 rounded-xl bg-red-500/20 border border-red-400/50 text-red-200 text-sm"
        >
          <span className="flex-1">{actionError}</span>
          <button
            onClick={() => setActionError(null)}
            style={{ touchAction: 'manipulation' }}
            className="touch-manipulation shrink-0 text-red-200/80 hover:text-red-100 font-black leading-none"
            aria-label="Dismiss error"
          >
            ×
          </button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <span className="text-white/50 text-xs uppercase tracking-wide font-bold">
          Pending
        </span>
        <span
          className="px-3 py-1 rounded-full bg-amber-500/20 border border-amber-400/50 text-amber-300 text-xs font-black"
          aria-label={`${pending.length} pending`}
        >
          {pending.length} pending
        </span>
      </div>

      <div className="flex flex-col gap-3 overflow-auto">
        {pending.length === 0 ? (
          <p className="text-white/30 text-sm text-center py-6">
            {activeActivity
              ? 'No submissions waiting for approval.'
              : 'Pick a wall on the board to collect submissions.'}
          </p>
        ) : (
          pending.map((submission) => (
            <div
              key={submission.id}
              className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10"
            >
              <div className="flex-1 min-w-0">
                {submission.participantLabel && (
                  <div className="text-white/40 text-[10px] uppercase tracking-wide font-bold truncate">
                    {submission.participantLabel}
                  </div>
                )}
                <div className="text-white text-sm break-words">
                  {submission.content}
                </div>
              </div>
              <button
                onClick={() => approve(submission.id)}
                style={{ touchAction: 'manipulation' }}
                className="touch-manipulation shrink-0 w-11 h-11 rounded-xl bg-green-500/20 border border-green-400/50 text-green-300 flex items-center justify-center transition-all active:scale-95 hover:bg-green-500/30"
                aria-label={`Approve submission ${submission.id}`}
              >
                <Check className="w-5 h-5" />
              </button>
              <button
                onClick={() => remove(submission.id)}
                style={{ touchAction: 'manipulation' }}
                className="touch-manipulation shrink-0 w-11 h-11 rounded-xl bg-red-500/20 border border-red-400/50 text-red-300 flex items-center justify-center transition-all active:scale-95 hover:bg-red-500/30"
                aria-label={`Remove submission ${submission.id}`}
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
