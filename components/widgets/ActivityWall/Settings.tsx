import React, { useState } from 'react';
import { Pencil, SlidersHorizontal, Trash2 } from 'lucide-react';
import {
  ActivityWallActivity,
  ActivityWallConfig,
  ActivityWallIdentificationMode,
  ActivityWallMode,
  ActivityWallSubmission,
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

const MAX_DEMO_SUBMISSIONS = 200;

export const ActivityWallSettings: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { updateWidget } = useDashboard();
  const config = widget.config as ActivityWallConfig;
  const [settingsActivityId, setSettingsActivityId] = useState<string | null>(
    null
  );
  const [draftDemo, setDraftDemo] = useState('');

  const updateConfig = (updates: Partial<ActivityWallConfig>) => {
    updateWidget(widget.id, { config: { ...config, ...updates } });
  };

  const upsertDraft = (activity: ActivityWallActivity) => {
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

  const isEditingExisting = (config.activities ?? []).some(
    (a) => a.id === draft.id
  );

  const startActivity = () => {
    if (!draft.title.trim() || !draft.prompt.trim()) return;

    const started: ActivityWallActivity = {
      ...draft,
      title: draft.title.trim(),
      prompt: draft.prompt.trim(),
      // Preserve original startedAt when editing; set now when creating new.
      startedAt: isEditingExisting
        ? (draft.startedAt ?? Date.now())
        : Date.now(),
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

  const editActivity = (activity: ActivityWallActivity) => {
    upsertDraft({ ...activity });
    setSettingsActivityId(null);
  };

  const deleteActivity = (activityId: string) => {
    const next = (config.activities ?? []).filter((a) => a.id !== activityId);
    const nextActiveId =
      config.activeActivityId === activityId
        ? (next[0]?.id ?? null)
        : config.activeActivityId;
    updateConfig({
      activities: next,
      activeActivityId: nextActiveId,
      ...(config.draftActivity?.id === activityId
        ? {
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
          }
        : {}),
    });
    if (settingsActivityId === activityId) setSettingsActivityId(null);
  };

  const addDemoResponse = (activity: ActivityWallActivity) => {
    if (!draftDemo.trim()) return;
    const submission: ActivityWallSubmission = {
      id: crypto.randomUUID(),
      content: draftDemo.trim(),
      submittedAt: Date.now(),
      status: activity.moderationEnabled ? 'pending' : 'approved',
      participantLabel: 'Demo Student',
    };
    const nextActivities = (config.activities ?? []).map((a) =>
      a.id === activity.id
        ? {
            ...a,
            submissions: [...(a.submissions ?? []), submission].slice(
              -MAX_DEMO_SUBMISSIONS
            ),
          }
        : a
    );
    updateConfig({ activities: nextActivities });
    setDraftDemo('');
  };

  const toggleModeration = (activity: ActivityWallActivity, enabled: boolean) => {
    const nextActivities = (config.activities ?? []).map((a) =>
      a.id === activity.id ? { ...a, moderationEnabled: enabled } : a
    );
    updateConfig({ activities: nextActivities });
  };

  return (
    <div className="p-4 space-y-4">
      {/* ── New / Edit activity form ── */}
      {isEditingExisting && (
        <div className="flex items-center justify-between rounded-lg bg-amber-50 border border-amber-200 px-3 py-1.5">
          <span className="text-xs font-semibold text-amber-700">
            Editing: {draft.title || 'activity'}
          </span>
          <button
            type="button"
            onClick={() =>
              upsertDraft({
                id: crypto.randomUUID(),
                title: '',
                prompt: '',
                mode: 'text',
                moderationEnabled: false,
                identificationMode: 'anonymous',
                submissions: [],
                startedAt: null,
              })
            }
            className="text-xs text-amber-600 underline"
          >
            Cancel
          </button>
        </div>
      )}

      <div>
        <label className="block text-xs font-bold text-slate-600 mb-1 uppercase tracking-wider">
          Activity title
        </label>
        <input
          value={draft.title}
          onChange={(event) =>
            upsertDraft({ ...draft, title: event.target.value })
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
            upsertDraft({ ...draft, prompt: event.target.value })
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
              onClick={() => upsertDraft({ ...draft, mode })}
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
            upsertDraft({
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
            upsertDraft({
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
        {isEditingExisting ? 'Save Changes' : 'Start Activity'}
      </button>

      {/* ── Activity library ── */}
      {(config.activities ?? []).length > 0 && (
        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1 uppercase tracking-wider">
            Activity library
          </label>
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            {(config.activities ?? []).map((activity) => (
              <div
                key={activity.id}
                className="border-b border-slate-100 last:border-b-0"
              >
                {/* Activity row */}
                <div className="flex items-center gap-1 px-3 py-2">
                  <button
                    type="button"
                    onClick={() =>
                      updateConfig({ activeActivityId: activity.id })
                    }
                    className={`flex-1 text-left min-w-0 ${
                      config.activeActivityId === activity.id
                        ? 'opacity-100'
                        : 'opacity-70 hover:opacity-100'
                    }`}
                  >
                    <p
                      className={`text-sm font-semibold truncate ${
                        config.activeActivityId === activity.id
                          ? 'text-brand-blue-primary'
                          : 'text-slate-800'
                      }`}
                    >
                      {activity.title}
                    </p>
                    <p className="text-xs text-slate-500 line-clamp-1">
                      {activity.prompt}
                    </p>
                  </button>

                  {/* Edit */}
                  <button
                    type="button"
                    onClick={() => editActivity(activity)}
                    title="Edit activity"
                    className="p-1 text-slate-400 hover:text-brand-blue-primary transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>

                  {/* Settings / Demo */}
                  <button
                    type="button"
                    onClick={() =>
                      setSettingsActivityId(
                        settingsActivityId === activity.id ? null : activity.id
                      )
                    }
                    title="Activity settings"
                    className={`p-1 transition-colors ${
                      settingsActivityId === activity.id
                        ? 'text-brand-blue-primary'
                        : 'text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                  </button>

                  {/* Delete */}
                  <button
                    type="button"
                    onClick={() => deleteActivity(activity.id)}
                    title="Delete activity"
                    className="p-1 text-slate-400 hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Inline settings panel */}
                {settingsActivityId === activity.id && (
                  <div className="px-3 pb-3 pt-2 space-y-3 bg-slate-50 border-t border-slate-100">
                    {/* Moderation toggle */}
                    <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
                      <span className="text-xs font-semibold text-slate-700">
                        Require moderation
                      </span>
                      <input
                        type="checkbox"
                        checked={activity.moderationEnabled}
                        onChange={(e) =>
                          toggleModeration(activity, e.target.checked)
                        }
                        className="h-4 w-4 accent-brand-blue-primary"
                      />
                    </label>

                    {/* Demo response */}
                    <div>
                      <p className="text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">
                        Demo response
                      </p>
                      <div className="flex gap-2">
                        <input
                          value={draftDemo}
                          onChange={(e) => setDraftDemo(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              addDemoResponse(activity);
                            }
                          }}
                          placeholder={
                            activity.mode === 'photo'
                              ? 'Paste photo URL…'
                              : 'Add demo text…'
                          }
                          className="flex-1 px-2 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-brand-blue-primary"
                        />
                        <button
                          type="button"
                          onClick={() => addDemoResponse(activity)}
                          className="px-3 py-1.5 bg-slate-800 text-white rounded-lg text-xs font-bold hover:bg-slate-700 transition-colors"
                        >
                          Add
                        </button>
                      </div>
                      {(activity.submissions ?? []).length > 0 && (
                        <p className="text-xs text-slate-500 mt-1">
                          {activity.submissions.length} demo response
                          {activity.submissions.length === 1 ? '' : 's'} stored
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
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
