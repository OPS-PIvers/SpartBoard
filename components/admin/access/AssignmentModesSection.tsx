import React from 'react';
import { tourAttr, tourFieldAttr } from '@/config/tourAnchors';
import {
  BookOpen,
  Boxes,
  Eye,
  ListChecks,
  Loader2,
  PlayCircle,
  Save,
  Send,
} from 'lucide-react';
import type { AssignmentMode, AssignmentWidgetKey } from '@/types';
import { parseAssignmentModesConfig } from '@/utils/assignmentModesConfig';
import type { useGlobalPermissionsEditor } from './useGlobalPermissionsEditor';

const ASSIGNMENT_WIDGETS: {
  key: AssignmentWidgetKey;
  label: string;
  Icon: React.ElementType;
}[] = [
  { key: 'quiz', label: 'Quiz', Icon: ListChecks },
  { key: 'videoActivity', label: 'Video Activity', Icon: PlayCircle },
  { key: 'miniApp', label: 'Mini Apps', Icon: Boxes },
  { key: 'guidedLearning', label: 'Guided Learning', Icon: BookOpen },
];

const MODE_OPTIONS: {
  mode: AssignmentMode;
  label: string;
  Icon: React.ElementType;
}[] = [
  { mode: 'submissions', label: 'Submissions', Icon: Send },
  { mode: 'view-only', label: 'View only', Icon: Eye },
];

/** Submissions or view only per assignment type, at the top of the Features tab. */
export const AssignmentModesSection: React.FC<{
  editor: ReturnType<typeof useGlobalPermissionsEditor>;
}> = ({ editor }) => {
  const config = parseAssignmentModesConfig(
    editor.getPermission('assignment-modes').config
  );
  const saving = editor.saving.has('assignment-modes');
  const unsaved = editor.unsavedChanges.has('assignment-modes');

  const setMode = (widget: AssignmentWidgetKey, mode: AssignmentMode) => {
    editor.updatePermission('assignment-modes', {
      accessLevel: 'public',
      enabled: true,
      config: { ...config, [widget]: mode },
    });
  };

  return (
    <section className="space-y-2" data-testid="assignment-modes-section">
      <div className="flex items-end justify-between gap-3 pt-2">
        <div className="min-w-0">
          <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500">
            Assignment modes
          </h3>
          <p className="text-xxs text-slate-500">
            Applies to new assignments only.
          </p>
        </div>
        <button
          {...tourAttr('admin.org.assignment-modes-save')}
          type="button"
          onClick={() => void editor.savePermission('assignment-modes')}
          disabled={saving || !unsaved}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors disabled:cursor-not-allowed ${
            unsaved
              ? 'bg-brand-blue-primary text-white hover:bg-brand-blue-dark'
              : 'border border-slate-200 text-slate-400'
          }`}
        >
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <Save className="h-3.5 w-3.5" aria-hidden />
          )}
          {unsaved ? 'Save' : 'Saved'}
        </button>
      </div>
      <div className="divide-y divide-slate-200 border-y border-slate-200">
        {ASSIGNMENT_WIDGETS.map(({ key, label, Icon }) => {
          const current: AssignmentMode =
            config[key] === 'view-only' ? 'view-only' : 'submissions';
          return (
            <div
              key={key}
              data-testid={`assignment-mode-${key}`}
              className="flex flex-col gap-2 bg-white p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="shrink-0 rounded-lg bg-brand-blue-lighter p-2 text-brand-blue-primary">
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-slate-800">
                    {label}
                  </span>
                  {key === 'miniApp' && current === 'submissions' && (
                    <span className="block text-xxs text-slate-500">
                      Only for teachers in the Mini App submissions preview.
                    </span>
                  )}
                </span>
              </div>
              <div
                role="group"
                aria-label={`${label} assignment mode`}
                className="flex shrink-0 self-start rounded-lg border border-slate-200 bg-white p-0.5 sm:self-auto"
              >
                {MODE_OPTIONS.map(({ mode, label: text, Icon: ModeIcon }) => (
                  <button
                    key={mode}
                    {...(mode === 'submissions'
                      ? tourFieldAttr(
                          'admin.org.mode-submissions',
                          'admin',
                          key
                        )
                      : tourFieldAttr(
                          'admin.org.mode-view-only',
                          'admin',
                          key
                        ))}
                    type="button"
                    onClick={() => setMode(key, mode)}
                    aria-pressed={current === mode}
                    className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold transition-all ${
                      current === mode
                        ? 'bg-brand-blue-primary text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-800'
                    }`}
                  >
                    <ModeIcon className="h-3.5 w-3.5" aria-hidden />
                    {text}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
