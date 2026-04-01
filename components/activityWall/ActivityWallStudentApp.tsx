import React, { useMemo, useState } from 'react';
import { Camera, Send } from 'lucide-react';
import { ActivityWallIdentificationMode, ActivityWallMode } from '@/types';

type ActivityPayload = {
  id: string;
  title: string;
  prompt: string;
  mode: ActivityWallMode;
  identificationMode: ActivityWallIdentificationMode;
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
  };

  return (
    typeof payload.id === 'string' &&
    typeof payload.title === 'string' &&
    typeof payload.prompt === 'string' &&
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

export const ActivityWallStudentApp: React.FC = () => {
  const payload = useMemo(() => parsePayload(), []);
  const activityIdFromPath = window.location.pathname
    .replace(/^\/activity-wall\/?/, '')
    .split('/')[0];
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [response, setResponse] = useState('');
  const [submitted, setSubmitted] = useState(false);

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

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (requiresName && !name.trim()) return;
    if (requiresPin && !pin.trim()) return;
    if (!response.trim()) return;

    setSubmitted(true);
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
              <input
                value={response}
                onChange={(event) => setResponse(event.target.value)}
                placeholder="Paste photo URL or image file link"
                className="w-full px-3 py-2 border border-slate-300 rounded-xl"
              />
            )}

            <button
              type="submit"
              className="w-full bg-emerald-600 text-white rounded-xl py-2 font-bold flex items-center justify-center gap-2"
            >
              {payload.mode === 'text' ? (
                <Send className="w-4 h-4" />
              ) : (
                <Camera className="w-4 h-4" />
              )}
              Submit response
            </button>
          </form>

          {submitted && (
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-emerald-700 text-sm">
              Submitted! Your teacher will see this shortly.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
