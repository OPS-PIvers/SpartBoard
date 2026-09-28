import React from 'react';
import { AlertCircle, ArrowRight } from 'lucide-react';
import { ANONYMOUS_JOIN_BLOCKED_MESSAGE } from '@/utils/anonymousJoin';

/** Shown to a PIN joiner on a session closed to no-sign-in joins; offers student sign-in instead. */
export const AnonymousJoinBlockedScreen: React.FC<{ nextTarget: string }> = ({
  nextTarget,
}) => (
  <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-4 p-6">
    <AlertCircle className="w-10 h-10 text-amber-500" />
    <p className="text-slate-700 text-sm text-center max-w-sm">
      {ANONYMOUS_JOIN_BLOCKED_MESSAGE}
    </p>
    <button
      type="button"
      onClick={() =>
        window.location.assign(
          `/student/login?next=${encodeURIComponent(nextTarget)}`
        )
      }
      className="px-5 py-3 bg-brand-blue-primary hover:bg-brand-blue-dark text-white font-bold rounded-xl flex items-center gap-2 transition-colors"
    >
      Sign in <ArrowRight className="w-4 h-4" />
    </button>
  </div>
);
