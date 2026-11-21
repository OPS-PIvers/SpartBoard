import React, { useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import type { ResultsProtection } from '@/types';
import { useResultsTabWarnings } from '@/hooks/useResultsTabWarnings';
import { ResultsWatermark } from '@/components/quiz/ResultsWatermark';
import { ResultsTabWarningModal } from '@/components/quiz/ResultsTabWarningModal';
import { useWatermarkStudentName } from './useWatermarkStudentName';

interface ResultsProtectionGateProps {
  protection: ResultsProtection | undefined;
  /** Publish time for the watermark; falls back to when this view mounted. */
  publishedAt?: number;
  /** The student's own response doc, e.g. `video_activity_sessions/{id}/responses/{key}`. */
  responseDocPath: string | null;
  tabWarnings: number;
  lockedOut: boolean;
  pin?: string;
  light?: boolean;
  /** Where the locked screen sends the student; no link when unset. */
  backHref?: string;
  children: React.ReactNode;
}

/** Watermark and tab-away lockout around a published results view. */
export const ResultsProtectionGate: React.FC<ResultsProtectionGateProps> = ({
  protection,
  publishedAt,
  responseDocPath,
  tabWarnings,
  lockedOut,
  pin,
  light = false,
  backHref,
  children,
}) => {
  const [mountedAt] = useState(() => Date.now());
  const studentName = useWatermarkStudentName(undefined, pin);
  const tabWarningEnabled =
    protection?.tabWarningEnabled === true && !!responseDocPath;
  const threshold = protection?.tabWarningThreshold ?? 3;
  // Seeded from the stored count so an old warning doesn't pop the modal on arrival.
  const [shownForCount, setShownForCount] = useState(tabWarnings);

  useResultsTabWarnings({
    enabled: tabWarningEnabled,
    threshold,
    currentWarnings: tabWarnings,
    lockedOut,
    responseDocPath: responseDocPath ?? '',
  });

  if (tabWarningEnabled && lockedOut) {
    return (
      <div
        className={`h-screen h-dvh overflow-y-auto ${light ? 'bg-slate-50' : 'bg-slate-950'}`}
      >
        <div className="min-h-full flex flex-col items-center justify-center gap-4 p-6 text-center">
          <ShieldAlert
            className="h-12 w-12 text-amber-500"
            aria-hidden="true"
          />
          <h1
            className={`text-2xl font-black ${light ? 'text-slate-900' : 'text-white'}`}
          >
            Results locked
          </h1>
          <p
            className={`max-w-sm text-sm ${light ? 'text-slate-600' : 'text-slate-300'}`}
          >
            You left the results page too many times, so it&rsquo;s locked. Ask
            your teacher to unlock your results.
          </p>
          {backHref && (
            <>
              {/* no-tour-anchor: student screen; live tours walk teachers. */}
              <a
                href={backHref}
                className="inline-flex min-h-[44px] items-center rounded-full bg-brand-blue-primary px-5 text-sm font-bold text-white hover:bg-brand-blue-dark"
              >
                Back to my assignments
              </a>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      {protection?.watermarkEnabled === true && (
        <ResultsWatermark
          studentName={studentName}
          publishedAt={publishedAt ?? mountedAt}
          light={light}
        />
      )}
      <ResultsTabWarningModal
        open={tabWarningEnabled && tabWarnings > shownForCount && !lockedOut}
        warningCount={tabWarnings}
        threshold={threshold}
        onDismiss={() => setShownForCount(tabWarnings)}
      />
      {children}
    </>
  );
};
