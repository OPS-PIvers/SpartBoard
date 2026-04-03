import React, { useState } from 'react';
import { Cast } from 'lucide-react';

interface StudentLobbyProps {
  onJoin: (code: string, pin: string) => void;
  isLoading: boolean;
  error?: string | null;
}

export const StudentLobby: React.FC<StudentLobbyProps> = ({
  onJoin,
  isLoading,
  error,
}) => {
  const [code, setCode] = useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('code') ?? '';
    }
    return '';
  });
  const [pin, setPin] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (code && pin) onJoin(code, pin);
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 text-center text-slate-200">
      <div className="w-16 h-16 bg-slate-800 rounded-2xl flex items-center justify-center mb-6 shadow-xl ring-1 ring-slate-700">
        <Cast className="text-indigo-500 w-8 h-8" />
      </div>
      <h1 className="text-3xl font-black text-white mb-2 tracking-tight">
        Classroom Live
      </h1>
      <p className="text-slate-400 text-sm mb-8">
        Join your teacher&apos;s session
      </p>

      {error && (
        <div className="w-full max-w-sm mb-4 p-3 bg-red-500/20 border border-red-500/50 rounded-xl text-red-200 text-sm font-medium animate-in fade-in slide-in-from-top-1">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
        <div>
          <label className="sr-only">Room Code</label>
          <input
            type="text"
            placeholder="Teacher ID / Room Code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-mono text-center tracking-widest uppercase"
            required
          />
        </div>
        <div>
          <label className="sr-only">Your PIN</label>
          <input
            type="text"
            placeholder="Your PIN"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-center font-mono tracking-widest"
            required
          />
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-lg shadow-lg shadow-indigo-900/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-4"
        >
          {isLoading ? 'Joining...' : 'Join Session'}
        </button>
      </form>
    </div>
  );
};
