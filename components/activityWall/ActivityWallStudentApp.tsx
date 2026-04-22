import React, { useEffect, useMemo, useState } from 'react';
import { Camera, ImagePlus, Loader2, Send, X } from 'lucide-react';
import { ActivityWallIdentificationMode, ActivityWallMode } from '@/types';
import { db, auth, storage } from '@/config/firebase';
import { signInAnonymously } from 'firebase/auth';
import { doc, collection, getDoc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes } from 'firebase/storage';

type ActivityPayload = {
  id: string;
  title: string;
  prompt: string;
  mode: ActivityWallMode;
  moderationEnabled: boolean;
  identificationMode: ActivityWallIdentificationMode;
  teacherUid: string;
};

/**
 * The `/activity-wall/:pathId` app supports two launch styles:
 *
 *   - **Legacy `?data=<base64>` payload** (teacher's code/PIN flow). The
 *     path segment is the `activityId` and the payload JSON carries the
 *     full activity config.
 *   - **Class-targeted link** from `/my-assignments` (Phase 3D). No
 *     `?data=` param; the path segment is the session doc id
 *     (`${teacherUid}_${activityId}`) and we read the activity config
 *     directly from `activity_wall_sessions/{sessionId}` via a one-shot
 *     `getDoc`. We deliberately do NOT use `onSnapshot` here — session
 *     config is write-once and re-rendering on every teacher tweak
 *     would multiply per-student Firestore reads across a class of 30.
 */
type PayloadState =
  | { kind: 'loading' }
  | { kind: 'ready'; payload: ActivityPayload }
  | { kind: 'error' };

const isActivityPayload = (value: unknown): value is ActivityPayload => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const payload = value as {
    id?: unknown;
    title?: unknown;
    prompt?: unknown;
    mode?: unknown;
    moderationEnabled?: unknown;
    identificationMode?: unknown;
    teacherUid?: unknown;
  };

  return (
    typeof payload.id === 'string' &&
    typeof payload.title === 'string' &&
    typeof payload.prompt === 'string' &&
    typeof payload.teacherUid === 'string' &&
    typeof payload.moderationEnabled === 'boolean' &&
    (payload.mode === 'text' || payload.mode === 'photo') &&
    (payload.identificationMode === 'anonymous' ||
      payload.identificationMode === 'name' ||
      payload.identificationMode === 'pin' ||
      payload.identificationMode === 'name-pin')
  );
};

const decodeBase64Utf8 = (value: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const binary = atob(decodeURIComponent(trimmed));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
};

const parsePayloadFromUrl = (): ActivityPayload | null => {
  const params = new URLSearchParams(window.location.search);
  const encoded = params.get('data');
  if (!encoded) return null;

  const decodedJson = decodeBase64Utf8(encoded);
  if (!decodedJson) return null;

  try {
    const parsed = JSON.parse(decodedJson) as unknown;
    if (!isActivityPayload(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
};

/**
 * Normalise a raw Firestore `activity_wall_sessions/{sessionId}` doc
 * into the same `ActivityPayload` shape the base64 URL carries. Returns
 * null when required fields are missing or malformed — the student app
 * treats that as an error state (no deep-link resolution possible).
 *
 * Session docs written before Phase 3D may be missing `moderationEnabled`
 * and `identificationMode` (those fields were added alongside this
 * fallback). We default `moderationEnabled` to false and
 * `identificationMode` to 'anonymous' so legacy sessions still render —
 * both are the safest possible defaults (no submissions auto-hidden,
 * no PII collected).
 */
const normaliseSessionDoc = (
  sessionId: string,
  raw: Record<string, unknown>
): ActivityPayload | null => {
  const {
    activityId,
    teacherUid,
    title,
    prompt,
    mode,
    moderationEnabled,
    identificationMode,
  } = raw;

  if (typeof activityId !== 'string' || activityId.length === 0) return null;
  if (typeof teacherUid !== 'string' || teacherUid.length === 0) return null;
  if (typeof title !== 'string') return null;
  if (typeof prompt !== 'string') return null;
  if (mode !== 'text' && mode !== 'photo') return null;

  // The submit handler expects a specific sessionId: `${teacherUid}_${id}`.
  // Refuse to proceed if the doc id doesn't match that convention, so
  // submission paths never write to an unexpected collection.
  if (sessionId !== `${teacherUid}_${activityId}`) return null;

  const resolvedModeration =
    typeof moderationEnabled === 'boolean' ? moderationEnabled : false;
  const resolvedIdentification: ActivityWallIdentificationMode =
    identificationMode === 'name' ||
    identificationMode === 'pin' ||
    identificationMode === 'name-pin' ||
    identificationMode === 'anonymous'
      ? identificationMode
      : 'anonymous';

  return {
    id: activityId,
    teacherUid,
    title,
    prompt,
    mode,
    moderationEnabled: resolvedModeration,
    identificationMode: resolvedIdentification,
  };
};

const getSafePreviewUrl = (value: string | null): string | null => {
  if (!value) return null;
  return value.startsWith('blob:') ? value : null;
};

const buildParticipantLabel = (
  identificationMode: ActivityWallIdentificationMode,
  name: string,
  pin: string
): string => {
  if (identificationMode === 'name') return name || 'Student';
  if (identificationMode === 'pin') return `PIN: ${pin}`;
  if (identificationMode === 'name-pin') return `${name} (${pin})`;
  return 'Anonymous';
};

export const ActivityWallStudentApp: React.FC = () => {
  // The URL payload — when present — is authoritative. We parse it
  // synchronously in the same render as mount so URL-based launches
  // render immediately without a loading flash.
  const urlPayload = useMemo(() => parsePayloadFromUrl(), []);
  const pathSegment = useMemo(
    () =>
      window.location.pathname.replace(/^\/activity-wall\/?/, '').split('/')[0],
    []
  );

  const [payloadState, setPayloadState] = useState<PayloadState>(() => {
    if (urlPayload && pathSegment && urlPayload.id === pathSegment) {
      return { kind: 'ready', payload: urlPayload };
    }
    // No usable URL payload (either missing or mismatched against the
    // path) — fall back to a Firestore read, but only when we have a
    // non-empty path segment we can use as a sessionId.
    if (!pathSegment) return { kind: 'error' };
    if (urlPayload) {
      // Param was present but mismatched — that's a genuinely bad link,
      // not a class-targeted deep-link. Surface the error immediately
      // rather than wasting a Firestore read.
      return { kind: 'error' };
    }
    return { kind: 'loading' };
  });
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [response, setResponse] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Firestore session-config fallback (Phase 3D). Runs only when the URL
  // didn't carry a `?data=` payload — i.e. a class-targeted launch from
  // `/my-assignments`. Uses a one-shot `getDoc` rather than `onSnapshot`:
  // session config is write-once (teachers don't mutate title/prompt
  // mid-activity) and subscribing would multiply per-student reads for
  // zero benefit. Firestore rules (`passesStudentClassGate`) enforce
  // that ClassLink-authenticated students can only read the doc when
  // their `classIds` claim contains the session's `classId`.
  //
  // Syncs with the Firestore external system, which is exactly what
  // `useEffect` is for.
  useEffect(() => {
    if (payloadState.kind !== 'loading') return;
    if (!pathSegment) return;
    let cancelled = false;
    void (async () => {
      try {
        const snap = await getDoc(
          doc(db, 'activity_wall_sessions', pathSegment)
        );
        if (cancelled) return;
        if (!snap.exists()) {
          setPayloadState({ kind: 'error' });
          return;
        }
        const normalised = normaliseSessionDoc(
          pathSegment,
          snap.data() as Record<string, unknown>
        );
        if (!normalised) {
          setPayloadState({ kind: 'error' });
          return;
        }
        setPayloadState({ kind: 'ready', payload: normalised });
      } catch (error) {
        // Firestore permission-denied and network failures both land
        // here. We don't expose the specific reason to the student —
        // just show the same clean "not available" state so the UI
        // never leaks access-control hints.
        console.error(
          '[ActivityWallStudentApp] Session-config fallback failed:',
          error
        );
        if (cancelled) return;
        setPayloadState({ kind: 'error' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [payloadState.kind, pathSegment]);

  // Keep previewUrl in sync with selectedFile and revoke the blob URL on cleanup
  // to avoid leaking browser memory (synchronization with an external resource).
  // Must be called before any early return to satisfy the Rules of Hooks.
  React.useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(selectedFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [selectedFile]);

  const safePreviewUrl = getSafePreviewUrl(previewUrl);

  if (payloadState.kind === 'loading') {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 text-center text-slate-600">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Loading activity…
      </div>
    );
  }

  if (payloadState.kind === 'error') {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-4 text-center">
        This activity isn&apos;t available right now. Ask your teacher for a new
        link.
      </div>
    );
  }

  const payload = payloadState.payload;

  const requiresName =
    payload.identificationMode === 'name' ||
    payload.identificationMode === 'name-pin';
  const requiresPin =
    payload.identificationMode === 'pin' ||
    payload.identificationMode === 'name-pin';

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedFile(e.target.files?.[0] ?? null);
  };

  const clearPhoto = () => {
    setSelectedFile(null);
  };

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (requiresName && !name.trim()) return;
    if (requiresPin && !pin.trim()) return;
    if (payload.mode === 'text' && !response.trim()) return;
    if (payload.mode === 'photo' && !selectedFile) return;

    if (payload.mode === 'photo' && selectedFile) {
      if (selectedFile.size >= 10 * 1024 * 1024) {
        setSubmitError(
          'Photo must be smaller than 10 MB. Please choose a smaller image.'
        );
        return;
      }
      if (!selectedFile.type.startsWith('image/')) {
        setSubmitError('Please select a valid image file.');
        return;
      }
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      if (!auth.currentUser) {
        await signInAnonymously(auth);
      }

      const sessionId = `${payload.teacherUid}_${payload.id}`;
      const submissionId = crypto.randomUUID();
      const submissionDoc = doc(
        collection(db, 'activity_wall_sessions', sessionId, 'submissions'),
        submissionId
      );

      let content: string;
      let storagePath: string | undefined;

      if (payload.mode === 'photo' && selectedFile) {
        storagePath = `activity_wall_photos/${sessionId}/${submissionId}`;
        const storageRef = ref(storage, storagePath);
        await uploadBytes(storageRef, selectedFile);
        content = storagePath;
      } else {
        content = response.trim();
      }

      await setDoc(submissionDoc, {
        id: submissionId,
        activityId: payload.id,
        content,
        submittedAt: Date.now(),
        status: payload.moderationEnabled ? 'pending' : 'approved',
        participantLabel: buildParticipantLabel(
          payload.identificationMode,
          name.trim(),
          pin.trim()
        ),
        ...(storagePath
          ? {
              storagePath,
              archiveStatus: 'firebase',
            }
          : {}),
      });

      setSubmitted(true);
    } catch (error) {
      console.error('[ActivityWallStudentApp] Submission failed:', error);
      setSubmitError(
        'Could not submit your response. Please check your connection and try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 p-4 sm:p-6 flex items-center justify-center">
      <div className="w-full max-w-xl bg-white rounded-2xl shadow-xl overflow-hidden">
        <div className="bg-brand-blue-primary text-white px-5 py-4">
          <p className="text-xs uppercase tracking-widest font-bold opacity-90">
            Activity
          </p>
          <h1 className="text-xl font-black">{payload.title}</h1>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-slate-700 font-medium">{payload.prompt}</p>

          {!submitted ? (
            <form className="space-y-3" onSubmit={onSubmit}>
              {requiresName && (
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Your name"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                />
              )}
              {requiresPin && (
                <input
                  value={pin}
                  onChange={(event) => setPin(event.target.value)}
                  placeholder="PIN"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                />
              )}

              {payload.mode === 'text' ? (
                <div className="space-y-1">
                  <textarea
                    value={response}
                    onChange={(event) => setResponse(event.target.value)}
                    rows={4}
                    placeholder="Type your response"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                    maxLength={5000}
                  />
                  <p className="text-right text-xs text-slate-400">
                    {response.length}/5000
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="block cursor-pointer">
                    <div
                      className={`flex flex-col items-center justify-center gap-3 p-6 border-2 border-dashed rounded-xl transition-colors ${
                        selectedFile
                          ? 'border-emerald-400 bg-emerald-50'
                          : 'border-slate-300 hover:border-brand-blue-primary'
                      }`}
                    >
                      {safePreviewUrl ? (
                        <img
                          src={safePreviewUrl}
                          alt="Preview"
                          className="max-h-48 w-full object-contain rounded-lg"
                        />
                      ) : (
                        <>
                          <div className="flex gap-3 text-slate-400">
                            <Camera className="w-8 h-8" />
                            <ImagePlus className="w-8 h-8" />
                          </div>
                          <div className="text-center">
                            <p className="text-sm font-semibold text-brand-blue-primary">
                              Take or select a photo
                            </p>
                            <p className="text-xs text-slate-400 mt-1">
                              Tap to use your camera or photo library
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      aria-label="Choose a photo to upload"
                      className="sr-only"
                      onChange={handleFileChange}
                    />
                  </label>
                  {selectedFile && (
                    <button
                      type="button"
                      onClick={clearPhoto}
                      className="flex items-center gap-1 text-xs text-slate-500 hover:text-red-500 transition-colors"
                    >
                      <X className="w-3 h-3" />
                      Remove photo
                    </button>
                  )}
                </div>
              )}

              {submitError && (
                <p className="text-sm text-red-600 font-medium">
                  {submitError}
                </p>
              )}

              <button
                type="submit"
                disabled={
                  submitting ||
                  (payload.mode === 'photo' && !selectedFile) ||
                  (payload.mode === 'text' && !response.trim())
                }
                className="w-full bg-emerald-600 text-white rounded-xl py-2 font-bold flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {submitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : payload.mode === 'text' ? (
                  <Send className="w-4 h-4" />
                ) : (
                  <Camera className="w-4 h-4" />
                )}
                {submitting
                  ? payload.mode === 'photo'
                    ? 'Uploading…'
                    : 'Submitting…'
                  : 'Submit response'}
              </button>
            </form>
          ) : (
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-emerald-700 text-sm font-medium text-center">
              Your response has been submitted!
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
