/**
 * Pilot / district-rollout request form — public route at /request.
 *
 * docs/wide-distro-plan.md Phase 2. Signed-in users submit a request doc to
 * `rollout_requests` (create-only, shape-validated in firestore.rules); the
 * `rolloutRequestEmail` Cloud Function relays it to the SpartBoard team via
 * the firestore-send-email extension.
 *
 * Visitors who can't sign in (until the OAuth consent screen goes External,
 * that's everyone outside orono.k12.mn.us) get a prominent email fallback —
 * the form is the nicety, the mailto is the guarantee.
 */
import { APP_NAME } from '@/config/constants';
import React, { useState } from 'react';
import { collection, doc, setDoc } from 'firebase/firestore';
import { Loader2, LogIn, Mail, Send, CheckCircle2 } from 'lucide-react';
import { db } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';

const CONTACT_EMAIL = 'spartboard@orono.k12.mn.us';

type RequestKind = 'pilot' | 'district';

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-800 placeholder:text-slate-400 focus:border-brand-blue-primary focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/20';

const Field: React.FC<{
  label: string;
  required?: boolean;
  children: React.ReactNode;
}> = ({ label, required, children }) => (
  <label className="block">
    <span className="mb-1.5 block text-sm font-semibold text-slate-700">
      {label}
      {required && <span className="text-brand-red-primary"> *</span>}
    </span>
    {children}
  </label>
);

export const RequestRolloutPage: React.FC = () => {
  const { user, loading, signInWithGoogle } = useAuth();
  const [signingIn, setSigningIn] = useState(false);
  const [kind, setKind] = useState<RequestKind>('pilot');
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [organization, setOrganization] = useState('');
  const [size, setSize] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = async () => {
    setSigningIn(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      console.error('Login failed:', err);
      setSigningIn(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.email || submitting) return;
    setSubmitting(true);
    setError(null);

    const email = user.email.toLowerCase();
    try {
      const ref = doc(collection(db, 'rollout_requests'));
      await setDoc(ref, {
        kind,
        name: name.trim(),
        email,
        role: role.trim(),
        organization: organization.trim(),
        domain: email.split('@')[1] ?? '',
        size: size.trim(),
        message: message.trim(),
        status: 'new',
        createdAt: Date.now(),
        submittedByUid: user.uid,
      });
      setSubmitted(true);
    } catch (err) {
      console.error('Failed to submit rollout request:', err);
      setError(
        `Something went wrong submitting the form. Please email us directly at ${CONTACT_EMAIL}.`
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex h-screen flex-col overflow-y-auto bg-slate-50 font-sans text-slate-800">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <a href="/" className="flex items-center gap-2">
            <img src="/favicon.png" alt="" className="h-8 w-8 rounded" />
            <span className="text-lg font-semibold text-slate-900">
              {APP_NAME}
            </span>
          </a>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
        <h1 className="text-3xl font-bold text-slate-900">
          Bring {APP_NAME} to your school
        </h1>
        <p className="mt-3 leading-relaxed text-slate-600">
          Interested in piloting {APP_NAME} with your team, or rolling it out
          across your district? Tell us a little about your school and
          we&rsquo;ll get back to you. You can also email us any time at{' '}
          <a
            className="font-semibold text-brand-blue-primary underline hover:text-brand-blue-dark"
            href={`mailto:${CONTACT_EMAIL}`}
          >
            {CONTACT_EMAIL}
          </a>
          .
        </p>

        <div className="mt-8">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-brand-blue-primary" />
            </div>
          ) : submitted ? (
            <div className="rounded-2xl border border-green-200 bg-green-50 p-8 text-center">
              <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-green-600" />
              <h2 className="text-xl font-bold text-slate-900">
                Request received!
              </h2>
              <p className="mt-2 text-slate-600">
                Thanks — we&rsquo;ll be in touch at{' '}
                <span className="font-semibold">{user?.email}</span> soon.
              </p>
            </div>
          ) : !user ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
              <p className="mb-6 text-slate-600">
                Sign in with Google to use the request form — or skip it and
                email us directly.
              </p>
              <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
                <button
                  onClick={handleSignIn}
                  disabled={signingIn}
                  className="inline-flex items-center gap-2 rounded-xl bg-brand-blue-primary px-6 py-3 font-bold text-white shadow transition hover:bg-brand-blue-dark disabled:opacity-70"
                >
                  {signingIn ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <LogIn className="h-5 w-5" />
                  )}
                  Sign in with Google
                </button>
                <a
                  href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(
                    `${APP_NAME} pilot/district request`
                  )}`}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-6 py-3 font-bold text-slate-700 transition hover:bg-slate-50"
                >
                  <Mail className="h-5 w-5" />
                  Email us instead
                </a>
              </div>
            </div>
          ) : (
            <form
              onSubmit={(e) => void handleSubmit(e)}
              className="space-y-5 rounded-2xl border border-slate-200 bg-white p-8"
            >
              <Field label="I'm interested in" required>
                <div className="flex gap-3">
                  {(
                    [
                      ['pilot', 'A pilot for my team/school'],
                      ['district', 'A district-wide rollout'],
                    ] as Array<[RequestKind, string]>
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setKind(value)}
                      className={`flex-1 rounded-xl border px-4 py-3 text-sm font-semibold transition ${
                        kind === value
                          ? 'border-brand-blue-primary bg-brand-blue-primary/10 text-brand-blue-primary'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </Field>

              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Your name" required>
                  <input
                    className={inputClass}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    maxLength={200}
                    autoComplete="name"
                  />
                </Field>
                <Field label="Your role">
                  <input
                    className={inputClass}
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    placeholder="Teacher, tech director, principal…"
                    maxLength={200}
                  />
                </Field>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="School / district" required>
                  <input
                    className={inputClass}
                    value={organization}
                    onChange={(e) => setOrganization(e.target.value)}
                    required
                    maxLength={300}
                  />
                </Field>
                <Field label="Approximate number of teachers">
                  <input
                    className={inputClass}
                    value={size}
                    onChange={(e) => setSize(e.target.value)}
                    placeholder="e.g. 40"
                    maxLength={100}
                  />
                </Field>
              </div>

              <Field label="Anything else we should know?">
                <textarea
                  className={`${inputClass} min-h-28 resize-y`}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  maxLength={5000}
                />
              </Field>

              <p className="text-xs text-slate-400">
                We&rsquo;ll reply to {user.email}. Your contact info is used
                only to follow up on this request — see our{' '}
                <a className="underline" href="/privacy">
                  Privacy Policy
                </a>
                .
              </p>

              {error && (
                <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-xl bg-brand-blue-primary px-8 py-3 font-bold text-white shadow transition hover:bg-brand-blue-dark disabled:opacity-70"
              >
                {submitting ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Send className="h-5 w-5" />
                )}
                Send request
              </button>
            </form>
          )}
        </div>
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl flex-col gap-2 px-6 py-6 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} Orono Public Schools</span>
          <nav className="flex gap-5">
            <a className="transition hover:text-slate-900" href="/privacy">
              Privacy
            </a>
            <a className="transition hover:text-slate-900" href="/terms">
              Terms
            </a>
            <a className="transition hover:text-slate-900" href="/support">
              Support
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
};

export default RequestRolloutPage;
