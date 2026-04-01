import React from 'react';
import {
  ActivityWallActivity,
  ActivityWallConfig,
  ActivityWallIdentificationMode,
  ActivityWallMode,
  WidgetData,
} from '@/types';
import { useDashboard } from '@/context/useDashboard';

const IDENTIFICATION_OPTIONS: ActivityWallIdentificationMode[] = [
  'anonymous',
  'name',
  'pin',
  'name-pin',
];

const MODE_OPTIONS: ActivityWallMode[] = ['text', 'photo'];

export const ActivityWallSettings: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { updateWidget } = useDashboard();
  const config = widget.config as ActivityWallConfig;

  const updateConfig = (updates: Partial<ActivityWallConfig>) => {
    updateWidget(widget.id, { config: { ...config, ...updates } });
  };

  const upsertActivity = (activity: ActivityWallActivity) => {
    updateConfig({ draftActivity: activity });
  };

  const draft =
    config.draftActivity ??
    ({
      id: crypto.randomUUID(),
      title: '',
      prompt: '',
      mode: 'text',
      moderationEnabled: false,
      identificationMode: 'anonymous',
      submissions: [],
      startedAt: null,
    } satisfies ActivityWallActivity);

  const startActivity = () => {
    if (!draft.title.trim() || !draft.prompt.trim()) return;

    const started: ActivityWallActivity = {
      ...draft,
      title: draft.title.trim(),
      prompt: draft.prompt.trim(),
      startedAt: Date.now(),
    };

    const existing = config.activities ?? [];
    const next = existing.some((a) => a.id === started.id)
      ? existing.map((a) => (a.id === started.id ? started : a))
      : [...existing, started];

    updateConfig({
      activities: next,
      activeActivityId: started.id,
      draftActivity: {
        id: crypto.randomUUID(),
        title: '',
        prompt: '',
        mode: 'text',
        moderationEnabled: false,
        identificationMode: 'anonymous',
        submissions: [],
        startedAt: null,
      },
    });
  };

  return (
    <div className="p-4 space-y-4">
      <div>
        <label className="block text-xs font-bold text-slate-600 mb-1 uppercase tracking-wider">
          Activity title
        </label>
        <input
          value={draft.title}
          onChange={(event) =>
            upsertActivity({ ...draft, title: event.target.value })
          }
          className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-blue-primary focus:outline-none"
          placeholder="Warm-up word cloud"
        />
      </div>

      <div>
        <label className="block text-xs font-bold text-slate-600 mb-1 uppercase tracking-wider">
          Prompt / directions
        </label>
        <textarea
          value={draft.prompt}
          onChange={(event) =>
            upsertActivity({ ...draft, prompt: event.target.value })
          }
          rows={3}
          className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-blue-primary focus:outline-none"
          placeholder="How are you feeling about today's lesson?"
        />
      </div>

      <div>
        <p className="block text-xs font-bold text-slate-600 mb-1 uppercase tracking-wider">
          Activity type
        </p>
        <div className="grid grid-cols-2 gap-2">
          {MODE_OPTIONS.map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => upsertActivity({ ...draft, mode })}
              className={`rounded-xl border px-3 py-2 text-sm font-semibold ${
                draft.mode === mode
                  ? 'bg-brand-blue-primary border-brand-blue-primary text-white'
                  : 'bg-white border-slate-200 text-slate-700'
              }`}
            >
              {mode === 'text' ? 'Text (Word Cloud)' : 'Photo (Padlet)'}
            </button>
          ))}
        </div>
      </div>

      <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2">
        <span className="text-sm font-semibold text-slate-700">
          Require moderation
        </span>
        <input
          type="checkbox"
          checked={draft.moderationEnabled}
          onChange={(event) =>
            upsertActivity({
              ...draft,
              moderationEnabled: event.target.checked,
            })
          }
          className="h-4 w-4 accent-brand-blue-primary"
        />
      </label>

      <div>
        <label className="block text-xs font-bold text-slate-600 mb-1 uppercase tracking-wider">
          Participant identification
        </label>
        <select
          value={draft.identificationMode}
          onChange={(event) =>
            upsertActivity({
              ...draft,
              identificationMode: event.target
                .value as ActivityWallIdentificationMode,
            })
          }
          className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-blue-primary focus:outline-none"
        >
          {IDENTIFICATION_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option === 'name-pin'
                ? 'Name & PIN'
                : option.charAt(0).toUpperCase() + option.slice(1)}
            </option>
          ))}
        </select>
      </div>

      <button
        type="button"
        onClick={startActivity}
        className="w-full rounded-xl bg-emerald-600 text-white font-black uppercase tracking-wider py-2"
      >
        Start Activity
      </button>

      {(config.activities ?? []).length > 0 && (
        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1 uppercase tracking-wider">
            Activity library
          </label>
          <div className="max-h-36 overflow-auto border border-slate-200 rounded-xl">
            {(config.activities ?? []).map((activity) => (
              <button
                key={activity.id}
                type="button"
                onClick={() => updateConfig({ activeActivityId: activity.id })}
                className={`w-full text-left px-3 py-2 border-b border-slate-100 last:border-b-0 ${
                  config.activeActivityId === activity.id
                    ? 'bg-brand-blue-light'
                    : 'bg-white'
                }`}
              >
                <p className="text-sm font-semibold text-slate-800">
                  {activity.title}
                </p>
                <p className="text-xs text-slate-500 line-clamp-1">
                  {activity.prompt}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export const ActivityWallAppearanceSettings: React.FC<{
  widget: WidgetData;
}> = () => {
  return (
    <div className="p-4 text-sm text-slate-600">
      This widget uses the standard window appearance controls.
    </div>
  );
};
