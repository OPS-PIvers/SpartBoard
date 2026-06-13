/**
 * RemoteActivityWallControl
 *
 * Phone remote for the Activity Wall widget. Lets a teacher:
 *   • Start / pause the wall (toggles `config.activeActivityId`).
 *   • Moderate the live submission queue — approve pending submissions
 *     (`updateDoc(ref, { status: 'approved' })`) or remove them
 *     (`deleteDoc(ref)`).
 *   • Toggle a join-QR affordance (gated by the `anonymous-join` feature).
 *
 * The moderation writes target the SAME Firestore subcollection the desktop
 * Activity Wall widget reads/writes — `activity_wall_sessions/{uid}_{activityId}
 * /submissions` — so approve/remove reflect on the projected board live. They
 * write DIRECTLY to Firestore (not through `updateWidget`); only start/pause
 * goes through `updateWidget`.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Check, Play, QrCode, Square, Trash2 } from 'lucide-react';
import { WidgetData, ActivityWallConfig, ActivityWallActivity } from '@/types';
import { useAuth } from '@/context/useAuth';
import { db } from '@/config/firebase';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  updateDoc,
} from 'firebase/firestore';

interface RemoteActivityWallControlProps {
  widget: WidgetData;
  updateWidget: (id: string, updates: Partial<WidgetData>) => void;
}

/**
 * Reconstruct the EXACT participant join URL the desktop Activity Wall widget
 * hands out. The widget builds it in `components/widgets/ActivityWall/Widget.tsx`
 * via `buildPublicActivityLink` → `encodeActivityData`: a base64url JSON `?data=`
 * payload appended to `/activity-wall/<activityId>`. The remote's
 * `config.activities` carries the same `ActivityWallActivity` fields, and the
 * teacher's `user.uid` is the `teacherUid`, so the remote can build a byte-for-byte
 * identical URL without inventing a shape. The student app
 * (`ActivityWallStudentApp.tsx`) decodes this `?data=` payload directly — no
 * Firestore session-doc read or ClassLink class gate required — so a scan lands
 * the participant in the right session immediately.
 */
const encodeActivityData = (
  activity: ActivityWallActivity,
  teacherUid: string
): string => {
  const payload = JSON.stringify({
    id: activity.id,
    title: activity.title,
    prompt: activity.prompt,
    mode: activity.mode,
    moderationEnabled: activity.moderationEnabled,
    identificationMode: activity.identificationMode,
    teacherUid,
  });
  const bytes = new TextEncoder().encode(payload);
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return encodeURIComponent(btoa(binary));
};

const buildPublicActivityLink = (
  activity: ActivityWallActivity,
  teacherUid: string
): string => {
  const encoded = encodeActivityData(activity, teacherUid);
  return `${window.location.origin}/activity-wall/${activity.id}?data=${encoded}`;
};

/** Live submission shape mirrored from the desktop widget's onSnapshot map. */
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
  const config = widget.config as ActivityWallConfig;
  const canOfferAnonymousJoin = canAccessFeature('anonymous-join');

  // Activities the widget knows about. The remote reads the same
  // `config.activities` the widget seeds; the active one is whichever id
  // `config.activeActivityId` points at (set = running, null = paused).
  const activities = useMemo<ActivityWallActivity[]>(
    () => config.activities ?? [],
    [config.activities]
  );
  const activeActivityId = config.activeActivityId ?? null;
  const activeActivity =
    activities.find((a) => a.id === activeActivityId) ?? null;
  const isRunning = !!activeActivity;

  const [submissions, setSubmissions] = useState<RemoteSubmission[]>([]);
  const [showQr, setShowQr] = useState(false);

  // Participant join URL for the active activity, identical to the desktop
  // widget's. Empty until an activity is active and the teacher is known.
  const participantUrl = useMemo(() => {
    if (!activeActivity || !user) return '';
    return buildPublicActivityLink(activeActivity, user.uid);
  }, [activeActivity, user]);

  const qrUrl = useMemo(() => {
    if (!participantUrl) return '';
    return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(
      participantUrl
    )}`;
  }, [participantUrl]);

  // Subscribe to the active session's submissions subcollection. Path and
  // session-id format match the desktop widget exactly so writes line up.
  useEffect(() => {
    if (!activeActivity || !user) {
      return;
    }
    const sessionId = `${user.uid}_${activeActivity.id}`;
    const submissionsRef = collection(
      db,
      'activity_wall_sessions',
      sessionId,
      'submissions'
    );
    const unsubscribe = onSnapshot(submissionsRef, (snap) => {
      setSubmissions(
        snap.docs.map((docSnap) => {
          const data = docSnap.data();
          return {
            // The widget reads `data.id`, which equals the doc id. Prefer
            // `docSnap.id` for addressing writes (it's the path segment),
            // falling back to the field for parity.
            id: docSnap.id ?? (data.id as string),
            content: data.content as string,
            submittedAt: data.submittedAt as number,
            status: data.status as 'approved' | 'pending' | undefined,
            participantLabel: data.participantLabel as string | undefined,
          };
        })
      );
    });
    return () => {
      unsubscribe();
      // Clear on teardown (dep change / pause / unmount) so a previous
      // session's submissions don't linger once it's no longer active.
      setSubmissions([]);
    };
  }, [activeActivity, user]);

  const pending = useMemo(
    () => submissions.filter((s) => s.status === 'pending'),
    [submissions]
  );

  const submissionRef = (submissionId: string) => {
    const sessionId = `${user?.uid}_${activeActivity?.id}`;
    return doc(
      db,
      'activity_wall_sessions',
      sessionId,
      'submissions',
      submissionId
    );
  };

  const approve = (submissionId: string) => {
    if (!activeActivity || !user) return;
    void updateDoc(submissionRef(submissionId), { status: 'approved' }).catch(
      (err) => console.error('[RemoteActivityWall] approve failed:', err)
    );
  };

  const remove = (submissionId: string) => {
    if (!activeActivity || !user) return;
    void deleteDoc(submissionRef(submissionId)).catch((err) =>
      console.error('[RemoteActivityWall] remove failed:', err)
    );
  };

  const toggleRunning = () => {
    const nextConfig: Partial<ActivityWallConfig> = {
      ...config,
      activeActivityId: isRunning ? null : (activities[0]?.id ?? null),
    };
    updateWidget(widget.id, { config: nextConfig as ActivityWallConfig });
  };

  const canStart = activities.length > 0;

  return (
    <div className="flex flex-col gap-5 p-6 h-full">
      <div className="text-white/60 text-xs uppercase tracking-widest font-bold text-center">
        Activity Wall
      </div>

      {/* Start / Pause */}
      <button
        onClick={toggleRunning}
        disabled={!isRunning && !canStart}
        style={{ touchAction: 'manipulation' }}
        className={`touch-manipulation flex items-center justify-center gap-3 px-8 py-4 rounded-2xl font-black text-lg shadow-lg transition-all active:scale-95 disabled:opacity-40 ${
          isRunning
            ? 'bg-red-500 hover:bg-red-600 text-white'
            : 'bg-green-500 hover:bg-green-600 text-white'
        }`}
        aria-label={isRunning ? 'Pause wall' : 'Start wall'}
        aria-pressed={isRunning}
      >
        {isRunning ? (
          <>
            <Square className="w-6 h-6" /> Pause Wall
          </>
        ) : (
          <>
            <Play className="w-6 h-6" /> Start Wall
          </>
        )}
      </button>

      {/* Join QR toggle — gated by anonymous-join */}
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

      {/* Join QR panel — shows a scannable code + the join URL so students can
          land in the active session. Only meaningful with an active activity. */}
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
              Start the wall to generate a join link.
            </p>
          )}
        </div>
      )}

      {/* Moderation queue */}
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
            {isRunning
              ? 'No submissions waiting for approval.'
              : 'Start the wall to collect submissions.'}
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
