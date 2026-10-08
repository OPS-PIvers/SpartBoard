// DEV-only: every assignStepper/**/*.dev.tsx preview on one page at /assign-stepper-dev, for mockups and screenshots.

import React, { useState } from 'react';
import { DialogProvider } from '@/context/DialogContext';
import { AuthProvider } from '@/context/AuthContext';

export interface AssignStepperPreview {
  title: string;
  render: React.FC;
}

const modules = import.meta.glob<{ default: AssignStepperPreview }>(
  '../common/library/assignStepper/**/*.dev.tsx',
  { eager: true }
);

const PREVIEWS = Object.entries(modules)
  .map(([path, mod]) => ({
    id: (path.split('/').pop() ?? path).replace(/\.dev\.tsx$/, ''),
    preview: mod.default,
  }))
  .sort((a, b) => a.preview.title.localeCompare(b.preview.title));

const readView = (): string => {
  const q = new URLSearchParams(window.location.search).get('view');
  return PREVIEWS.some((p) => p.id === q) ? (q ?? '') : (PREVIEWS[0]?.id ?? '');
};

export const AssignStepperDevHarness: React.FC = () => {
  const [view, setView] = useState(readView);
  const current = PREVIEWS.find((p) => p.id === view);
  const Preview = current?.preview.render;

  const pick = (id: string) => {
    setView(id);
    const url = new URL(window.location.href);
    url.searchParams.set('view', id);
    window.history.replaceState(null, '', url);
  };

  return (
    <AuthProvider>
      <DialogProvider>
        <div className="h-screen [height:100dvh] overflow-y-auto bg-slate-100 font-sans">
          <nav className="sticky top-0 z-10 flex flex-wrap gap-x-4 gap-y-1 border-b border-slate-200 bg-white px-4 py-2 text-sm">
            {PREVIEWS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => pick(p.id)}
                className={
                  p.id === view
                    ? 'font-bold text-brand-blue-dark'
                    : 'text-slate-500 hover:text-slate-700'
                }
              >
                {p.preview.title}
              </button>
            ))}
            {PREVIEWS.length === 0 && (
              <span className="text-slate-500">
                Add a components/common/library/assignStepper/*.dev.tsx file.
              </span>
            )}
          </nav>
          <main className="p-6 pb-12">{Preview && <Preview key={view} />}</main>
        </div>
      </DialogProvider>
    </AuthProvider>
  );
};
