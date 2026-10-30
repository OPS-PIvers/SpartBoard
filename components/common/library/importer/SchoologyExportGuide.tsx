// "From Schoology" steps on the Import wizard's bulk tile (SCHOOLOGY_QUIZ_IMPORT PR 5).

import React, { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { tourAttr } from '@/config/tourAnchors';
import {
  canConnectSchoology,
  pingExtension,
} from '@/components/tours/web/extensionClient';

export type SchoologyExportKind = 'quizzes' | 'banks';

const COURSE_STEPS = [
  'Open the course in Schoology and go to Materials.',
  'Select Options, then Export.',
  'Check the tests and quizzes you want and export them as Common Cartridge.',
  'Download the .imscc file when Schoology says it is ready, then choose it here.',
];

const RESOURCES_STEPS = [
  'Open Resources in Schoology and find the collection that holds your question banks.',
  'Select the gear beside the collection, then Export.',
  'Choose Common Cartridge and export.',
  'Download the .imscc file when Schoology says it is ready, then choose it here.',
];

const Steps: React.FC<{ heading: string; steps: string[] }> = ({
  heading,
  steps,
}) => (
  <div>
    <p className="text-xs font-bold text-slate-700">{heading}</p>
    <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-xs text-slate-600">
      {steps.map((step) => (
        <li key={step}>{step}</li>
      ))}
    </ol>
  </div>
);

export const SchoologyExportGuide: React.FC<{
  kind: SchoologyExportKind;
  /** The teacher has the extension route (schoology-quiz-import), not just the .imscc flags. */
  canSend: boolean;
}> = ({ kind, canSend }) => {
  const [open, setOpen] = useState(false);
  const [hasExtension, setHasExtension] = useState(false);

  useEffect(() => {
    if (!canSend) return;
    let live = true;
    void pingExtension().then((status) => {
      if (live) setHasExtension(canConnectSchoology(status));
    });
    return () => {
      live = false;
    };
  }, [canSend]);

  const routes =
    kind === 'banks'
      ? [{ heading: 'From Resources', steps: RESOURCES_STEPS }]
      : [
          { heading: 'From a course', steps: COURSE_STEPS },
          { heading: 'From Resources', steps: RESOURCES_STEPS },
        ];

  return (
    <div className="w-full text-left" data-testid="schoology-export-guide">
      {canSend && hasExtension && (
        <p className="text-xs text-slate-600">
          Or open the {kind === 'banks' ? 'question bank' : 'quiz'} in Schoology
          and select <strong>Send to SpartBoard</strong>.
        </p>
      )}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        {...tourAttr('import-wizard.schoology-steps')}
        className="mx-auto mt-1 flex min-h-[44px] items-center gap-1 text-xs font-bold text-brand-blue-primary"
      >
        How to export from Schoology
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>
      {open && (
        <div className="space-y-2 rounded-xl bg-slate-50 p-3">
          {routes.map((r) => (
            <Steps key={r.heading} heading={r.heading} steps={r.steps} />
          ))}
        </div>
      )}
    </div>
  );
};
