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

const parsePayload = (): ActivityPayload | null => {
  const params = new URLSearchParams(window.location.search);
  const encoded = params.get('data');
  if (!encoded) return null;

  try {
    const decoded = atob(decodeURIComponent(encoded));
    return JSON.parse(decoded) as ActivityPayload;
  } catch {
    return null;
  }
};

export const ActivityWallStudentApp: React.FC = () => {
  const payload = useMemo(() => parsePayload(), []);
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [response, setResponse] = useState('');
  const [submitted, setSubmitted] = useState(false);

  if (!payload) {
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
