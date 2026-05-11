// Public resolver for /r/:code short links. Renders outside any auth
// provider so anonymous users can click admin-created links.

import React, { useEffect, useState } from 'react';
import { Loader2, LinkIcon } from 'lucide-react';

import { recordShortLinkClick, resolveShortLink } from '@/hooks/useShortLinks';

type ResolveState =
  | { status: 'resolving' }
  | { status: 'redirecting'; destination: string }
  | { status: 'not-found' }
  | { status: 'error'; message: string };

export const ShortLinkRedirect: React.FC = () => {
  // Parse the code once during render; an empty path segment goes straight
  // to the not-found UI without ever scheduling an effect. Splitting on
  // `/` is robust against trailing slashes (`/r/code/`) and stray
  // sub-segments (`/r/code/extra`) — we always take the first segment
  // after `/r/`.
  const code = window.location.pathname.split('/')[2] ?? '';
  const [state, setState] = useState<ResolveState>(() =>
    code ? { status: 'resolving' } : { status: 'not-found' }
  );

  useEffect(() => {
    if (!code) return;
    let cancelled = false;

    void (async () => {
      try {
        const link = await resolveShortLink(code);
        if (cancelled) return;
        if (!link) {
          setState({ status: 'not-found' });
          return;
        }
        setState({ status: 'redirecting', destination: link.destination });
        // Fire-and-forget — never block the redirect on the counter write.
        // The security rule explicitly permits this update from anonymous
        // sessions.
        recordShortLinkClick(code).catch((err) => {
          console.warn('[ShortLinkRedirect] click counter failed:', err);
        });
        window.location.replace(link.destination);
      } catch (err) {
        if (cancelled) return;
        console.error('[ShortLinkRedirect] resolve error:', err);
        setState({
          status: 'error',
          message: 'Could not resolve this link. Try again later.',
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [code]);

  if (state.status === 'resolving' || state.status === 'redirecting') {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3 text-slate-600">
          <Loader2 className="w-8 h-8 animate-spin text-brand-blue-primary" />
          <p className="text-sm">Redirecting…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="max-w-sm w-full bg-white rounded-2xl shadow-md p-8 text-center">
        <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
          <LinkIcon className="w-6 h-6 text-slate-500" />
        </div>
        <h1 className="text-lg font-bold text-slate-800 mb-2">
          {state.status === 'not-found'
            ? 'Link not found'
            : 'Something went wrong'}
        </h1>
        <p className="text-sm text-slate-600 mb-6">
          {state.status === 'not-found'
            ? 'This short link is no longer active or never existed.'
            : state.message}
        </p>
        <a
          href="/"
          className="inline-block px-4 py-2 rounded-lg bg-brand-blue-primary text-white text-sm font-semibold hover:bg-brand-blue-dark transition-colors"
        >
          Back to SpartBoard
        </a>
      </div>
    </div>
  );
};
