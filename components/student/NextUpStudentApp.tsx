import React, { useState, useEffect } from 'react';
import { doc, onSnapshot, collection, addDoc } from 'firebase/firestore';
import { signInAnonymously } from 'firebase/auth';
import { db, auth } from '@/config/firebase';
import { NextUpSession } from '@/types';
import { useDialog } from '@/context/useDialog';
import {
  ListOrdered,
  UserPlus,
  CheckCircle2,
  Loader2,
  AlertCircle,
} from 'lucide-react';

const SESSIONS_COLLECTION = 'nextup_sessions';
const ENTRIES_SUBCOLLECTION = 'entries';

export const NextUpStudentApp: React.FC = () => {
  const params = new URLSearchParams(window.location.search);
  const widgetId = params.get('id');
  const { showAlert } = useDialog();

  const [session, setSession] = useState<NextUpSession | null>(null);
  const [authInitialized, setAuthInitialized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Sign in anonymously on mount
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (!auth.currentUser) {
          await signInAnonymously(auth);
        }
        setAuthInitialized(true);
      } catch (err) {
        console.error('Anonymous auth failed:', err);
        setError('Authentication failed. Please refresh and try again.');
        setLoading(false);
        setAuthInitialized(true);
      }
    };
    void initAuth();
  }, []);

  useEffect(() => {
    if (!widgetId) {
      setError('Missing session ID');
      setLoading(false);
      return;
    }

    if (!authInitialized) return;

    const sessionRef = doc(db, SESSIONS_COLLECTION, widgetId);
    return onSnapshot(
      sessionRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as NextUpSession;

          // Expiry check
          const createdDate = new Date(data.createdAt).toDateString();
          const today = new Date().toDateString();

          if (!data.isActive || createdDate !== today) {
            setError('This queue is not currently active.');
          } else {
            setError(null);
            setSession(data);
          }
        } else {
          setError('Queue session not found.');
        }
        setLoading(false);
      },
      (err) => {
        console.error('Session listener error:', err);
        setError('Failed to connect to the queue.');
        setLoading(false);
      }
    );
  }, [widgetId, authInitialized]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !widgetId || submitting || !auth.currentUser) return;

    setSubmitting(true);
    try {
      const entriesRef = collection(
        db,
        SESSIONS_COLLECTION,
        widgetId,
        ENTRIES_SUBCOLLECTION
      );
      await addDoc(entriesRef, {
        name: name.trim(),
        joinedAt: Date.now(),
      });
      setSubmitted(true);
    } catch (err) {
      console.error('Failed to join queue:', err);
      await showAlert('Failed to join queue. Please try again.', {
        title: 'Error',
        variant: 'error',
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (!authInitialized || loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
        <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
        <p className="text-slate-500 mt-4 font-medium">
          {!authInitialized ? 'Initializing...' : 'Connecting to queue...'}
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-6">
          <AlertCircle className="w-8 h-8 text-red-600" />
        </div>
        <h1 className="text-2xl font-black text-slate-800 mb-2">
          Queue Inactive
        </h1>
        <p className="text-slate-500 max-w-xs">{error}</p>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center animate-in fade-in zoom-in duration-500">
        <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mb-6">
          <CheckCircle2 className="w-10 h-10 text-emerald-600" />
        </div>
        <h1 className="text-3xl font-black text-slate-800 mb-2 uppercase tracking-tight">
          You&apos;re in!
        </h1>
        <p className="text-slate-500 mb-8 font-medium">
          Keep an eye on the front board.
        </p>
        <button
          onClick={() => {
            setSubmitted(false);
            setName('');
          }}
          className="text-blue-600 font-bold hover:underline"
        >
          Join again with a different name?
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center mb-8 gap-2">
          <div className="p-2 bg-blue-600 rounded-lg">
            <ListOrdered className="w-6 h-6 text-white" />
          </div>
          <span className="text-xl font-black text-slate-800 tracking-tighter uppercase">
            Next Up
          </span>
        </div>

        <div className="bg-slate-50 rounded-3xl p-8 border border-slate-100 shadow-sm">
          <h1 className="text-2xl font-black text-slate-800 mb-2 text-center">
            Take a Number
          </h1>
          <p className="text-slate-500 text-center mb-8 font-medium italic">
            Session: {session?.sessionName}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xxs font-black text-slate-400 uppercase tracking-widest ml-1 mb-2 block">
                Enter your name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Alex S."
                required
                autoFocus
                className="w-full px-6 py-4 bg-white border-2 border-slate-200 rounded-2xl text-xl font-bold text-slate-800 focus:outline-none focus:border-blue-600 transition-colors shadow-inner"
              />
            </div>

            <button
              type="submit"
              disabled={submitting || !name.trim()}
              className="w-full py-5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-black text-lg rounded-2xl flex items-center justify-center gap-3 transition-all shadow-lg active:scale-95 shadow-blue-200"
            >
              {submitting ? (
                <Loader2 className="w-6 h-6 animate-spin" />
              ) : (
                <>
                  GET IN LINE <UserPlus className="w-6 h-6" />
                </>
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-slate-400 text-xs mt-8 font-medium">
          SpartBoard &bull; Learning in Motion
        </p>
      </div>
    </div>
  );
};
