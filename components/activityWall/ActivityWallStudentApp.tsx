import React, { useMemo, useState } from 'react';
import { Camera, ImagePlus, Loader2, Send, X } from 'lucide-react';
import { ActivityWallIdentificationMode, ActivityWallMode } from '@/types';
import { db, auth, storage } from '@/config/firebase';
import { signInAnonymously } from 'firebase/auth';
import { doc, collection, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

type ActivityPayload = {
  id: string;
  title: string;
  prompt: string;
  mode: ActivityWallMode;
  identificationMode: ActivityWallIdentificationMode;
  teacherUid: string;
};

const isActivityPayload = (value: unknown): value is ActivityPayload => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const payload = value as {
    id?: unknown;
    title?: unknown;
    prompt?: unknown;
    mode?: unknown;
    identificationMode?: unknown;
    teacherUid?: unknown;
  };

  return (
    typeof payload.id === 'string' &&
    typeof payload.title === 'string' &&
    typeof payload.prompt === 'string' &&
    typeof payload.teacherUid === 'string' &&
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

const parsePayload = (): ActivityPayload | null => {
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
  const payload = useMemo(() => parsePayload(), []);
  const activityIdFromPath = window.location.pathname
    .replace(/^\/activity-wall\/?/, '')
    .split('/')[0];
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [response, setResponse] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  if (!payload || !activityIdFromPath || payload.id !== activityIdFromPath) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-4 text-center">
        Invalid activity link. Ask your teacher for a new link.
      </div>
    );
  }

  const requiresName =
    payload.identificationMode === 'name' ||
    payload.identificationMode === 'name-pin';
  const requiresPin =
    payload.identificationMode === 'pin' ||
    payload.identificationMode === 'name-pin';

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(file);
    setPreviewUrl(file ? URL.createObjectURL(file) : null);
  };

  const clearPhoto = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(null);
    setPreviewUrl(null);
  };

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (requiresName && !name.trim()) return;
    if (requiresPin && !pin.trim()) return;
    if (payload.mode === 'text' && !response.trim()) return;
    if (payload.mode === 'photo' && !selectedFile) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      // Sign in anonymously so Firestore/Storage security rules allow the write.
      await signInAnonymously(auth);

      const sessionId = `${payload.teacherUid}_${payload.id}`;
      const submissionId = crypto.randomUUID();

      let content: string;
      if (payload.mode === 'photo' && selectedFile) {
        // Upload photo to Firebase Storage under the teacher's session path.
        // Student photos are stored at activity_wall_photos/{sessionId}/{submissionId}
        // and are publicly readable via the generated download URL.
        const storageRef = ref(
          storage,
          `activity_wall_photos/${sessionId}/${submissionId}`
        );
        const snapshot = await uploadBytes(storageRef, selectedFile);
        content = await getDownloadURL(snapshot.ref);
      } else {
        content = response.trim();
      }

      const submissionDoc = doc(
        collection(db, 'activity_wall_sessions', sessionId, 'submissions'),
        submissionId
      );

      await setDoc(submissionDoc, {
        id: submissionId,
        activityId: payload.id,
        content,
        submittedAt: Date.now(),
        participantLabel: buildParticipantLabel(
          payload.identificationMode,
          name.trim(),
          pin.trim()
        ),
      });

      setSubmitted(true);
    } catch {
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
                <textarea
                  value={response}
                  onChange={(event) => setResponse(event.target.value)}
                  rows={4}
                  placeholder="Type your response"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                />
              ) : (
                /* Photo mode: file picker with preview */
                <div className="space-y-2">
                  <label className="block cursor-pointer">
                    <div
                      className={`flex flex-col items-center justify-center gap-3 p-6 border-2 border-dashed rounded-xl transition-colors ${
                        selectedFile
                          ? 'border-emerald-400 bg-emerald-50'
                          : 'border-slate-300 hover:border-brand-blue-primary'
                      }`}
                    >
                      {previewUrl ? (
                        <img
                          src={previewUrl}
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
