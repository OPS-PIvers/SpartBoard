import React from 'react';

/** Shown for the last minute before an idle sign-out; any tap or key press dismisses it. */
export const StudentIdleWarning: React.FC<{ visible: boolean }> = ({
  visible,
}) =>
  visible ? (
    <div
      role="alertdialog"
      aria-modal="false"
      aria-labelledby="student-idle-title"
      className="fixed inset-x-0 bottom-0 z-system-banner flex justify-center p-4 [padding-bottom:max(1rem,env(safe-area-inset-bottom))]"
    >
      <div className="w-full max-w-sm rounded-2xl border border-amber-300 bg-white p-4 text-center shadow-xl">
        <p
          id="student-idle-title"
          className="text-base font-bold text-slate-900"
        >
          Still there?
        </p>
        <p className="mt-1 text-sm text-slate-600">
          You will be signed out in 1 minute.
        </p>
        {/* no-tour-anchor: student screen; live tours walk teachers. */}
        <button
          type="button"
          className="mt-3 min-h-[44px] w-full rounded-xl bg-brand-blue-primary px-4 text-sm font-bold text-white hover:bg-brand-blue-dark"
        >
          Stay signed in
        </button>
      </div>
    </div>
  ) : null;
