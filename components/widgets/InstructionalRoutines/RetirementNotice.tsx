import React, { useState } from 'react';
import { ListChecks } from 'lucide-react';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import { resolveBaseTextScale } from '@/config/widgetAppearance';
import { WidgetData } from '@/types';

export const RETIREMENT_TITLE = 'Routines is going away soon';
export const RETIREMENT_MESSAGE = 'Please use Routine Guide instead.';
export const RETIREMENT_OPEN_LABEL = 'Open Routine Guide';
export const RETIREMENT_DISMISS_LABEL = 'Not now';

// Shown each time the widget mounts; dismissing hides it until the board reloads.
export const RetirementNotice: React.FC<{
  widget: WidgetData;
  isStudentView?: boolean;
}> = ({ widget, isStudentView = false }) => {
  const { addWidget, bringToFront, activeDashboard, isActiveBoardReadOnly } =
    useDashboard();
  const { user, canAccessWidget } = useAuth();
  const [dismissed, setDismissed] = useState(false);

  if (
    dismissed ||
    isStudentView ||
    !user ||
    widget.id.startsWith('announcement') ||
    isActiveBoardReadOnly ||
    !canAccessWidget('routineGuide')
  ) {
    return null;
  }

  const openRoutineGuide = () => {
    const existing = activeDashboard?.widgets.find(
      (w) => w.type === 'routineGuide'
    );
    if (existing) bringToFront(existing.id);
    else addWidget('routineGuide');
    setDismissed(true);
  };

  const textScale = resolveBaseTextScale(widget.baseTextSize);
  const titleId = `routines-retirement-title-${widget.id}`;

  return (
    <div
      className="absolute inset-0 z-10 flex overflow-y-auto bg-slate-900/40 animate-in fade-in duration-200"
      style={{ padding: '4cqmin' }}
      role="dialog"
      aria-labelledby={titleId}
    >
      <div
        className="m-auto w-full bg-white rounded-xl shadow-xl flex flex-col items-center text-center"
        style={{
          maxWidth: '92cqw',
          padding: '1.25em',
          gap: '0.75em',
          fontSize: `calc(min(16px, 5cqmin) * ${textScale})`,
        }}
      >
        <ListChecks
          className="text-brand-blue-primary shrink-0"
          style={{ width: '2em', height: '2em' }}
          aria-hidden="true"
        />
        <h3
          id={titleId}
          className="font-bold text-slate-800 leading-tight"
          style={{ fontSize: '1.2em' }}
        >
          {RETIREMENT_TITLE}
        </h3>
        <p className="text-slate-600 leading-snug">{RETIREMENT_MESSAGE}</p>
        <div
          className="flex flex-wrap-reverse items-center justify-center"
          style={{ gap: '0.5em', marginTop: '0.25em' }}
        >
          {/* no-tour-anchor: temporary retirement notice, removed with the widget */}
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="relative touch-target-expand rounded-lg font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
            style={{ padding: '0.6em 1em', fontSize: '0.9em' }}
          >
            {RETIREMENT_DISMISS_LABEL}
          </button>
          {/* no-tour-anchor: temporary retirement notice, removed with the widget */}
          <button
            type="button"
            onClick={openRoutineGuide}
            className="relative touch-target-expand rounded-lg font-semibold text-white bg-brand-blue-primary hover:bg-brand-blue-dark transition-colors"
            style={{ padding: '0.6em 1em', fontSize: '0.9em' }}
          >
            {RETIREMENT_OPEN_LABEL}
          </button>
        </div>
      </div>
    </div>
  );
};
