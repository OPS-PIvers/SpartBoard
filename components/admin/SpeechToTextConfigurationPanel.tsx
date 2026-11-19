// Admin card for the two paid Speech to text extras (docs/plans/shipped/SPEECH_TO_TEXT.md D8-D10).
import React, { useEffect, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { Loader2, Mic, Save } from 'lucide-react';
import { db } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import type { SpeechToTextSettings } from '@/types';
import {
  DEFAULT_SPEECH_TO_TEXT_SETTINGS,
  SPEECH_TO_TEXT_SETTINGS_DOC,
  monthlySpeechToTextUsageDocId,
  normalizeSpeechToTextSettings,
} from '@/config/speechToText';
import { Toggle } from '@/components/common/Toggle';
import { DraftNumberField } from './DraftNumberField';
import { tourFieldAttr } from '@/config/tourAnchors';

interface MonthlyUsage {
  seconds: number;
  tidyCalls: number;
}

const MODES: {
  id: SpeechToTextSettings['transcribeMode'];
  label: string;
  hint: string;
}[] = [
  {
    id: 'verbatim',
    label: 'Exact words',
    hint: 'Keeps every word the student said. Punctuation comes from the free engine.',
  },
  {
    id: 'smart',
    label: 'Smart',
    hint: 'Adds punctuation, but also fixes grammar and drops repeated words, so the text is not exactly what the student said.',
  },
];

const ENGINES: {
  id: SpeechToTextSettings['engine'];
  label: string;
  hint: string;
}[] = [
  {
    id: 'browser',
    label: 'Browser (free)',
    hint: 'Used for every student.',
  },
  {
    id: 'hybrid',
    label: 'AI transcription (paid)',
    hint: 'Each phrase a signed-in student dictates also goes to the AI model for a more accurate transcript. About a cent per minute of speech.',
  },
];

const fieldClass =
  'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-brand-blue-primary/40';

const normalizeCap = (n: number): number => Math.max(0, Math.trunc(n));

const formatCount = (n: number): string => n.toLocaleString();

const comparable = (s: SpeechToTextSettings): string =>
  JSON.stringify({ ...s, updatedAt: 0, updatedBy: '' });

const UsageRow: React.FC<{
  label: string;
  used: number;
  cap: number;
  unit: string;
}> = ({ label, used, cap, unit }) => {
  const pct = cap > 0 ? Math.min(100, Math.round((used / cap) * 100)) : 100;
  const text = `${formatCount(used)} of ${formatCount(cap)} ${unit}`;
  return (
    <div>
      <div className="flex justify-between gap-3 text-sm text-slate-800">
        <span>{label}</span>
        <span className="font-mono">{text}</span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-valuetext={text}
        className="mt-1 h-2 rounded-full bg-slate-200 overflow-hidden"
      >
        <div
          className={`h-full rounded-full ${
            pct >= 100 ? 'bg-brand-red-primary' : 'bg-brand-blue-primary'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
};

interface SpeechToTextConfigurationPanelProps {
  /** Notifies the host modal when this panel holds an unsaved draft. */
  onDirtyChange?: (dirty: boolean) => void;
}

export const SpeechToTextConfigurationPanel: React.FC<
  SpeechToTextConfigurationPanelProps
> = ({ onDirtyChange }) => {
  const { user } = useAuth();
  const [saved, setSaved] = useState<SpeechToTextSettings | null>(null);
  const [draft, setDraft] = useState<SpeechToTextSettings>(
    DEFAULT_SPEECH_TO_TEXT_SETTINGS
  );
  const [seeded, setSeeded] = useState(false);
  const [usage, setUsage] = useState<MonthlyUsage | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    const ref = doc(db, 'admin_settings', SPEECH_TO_TEXT_SETTINGS_DOC);
    return onSnapshot(
      ref,
      (snap) => setSaved(normalizeSpeechToTextSettings(snap.data())),
      (err) => {
        console.error('[SpeechToTextConfigurationPanel] settings:', err);
        setSaved(DEFAULT_SPEECH_TO_TEXT_SETTINGS);
      }
    );
  }, []);

  useEffect(() => {
    const ref = doc(db, 'ai_usage', monthlySpeechToTextUsageDocId());
    return onSnapshot(
      ref,
      (snap) => {
        const d = snap.data() ?? {};
        const num = (v: unknown) => (typeof v === 'number' ? v : 0);
        setUsage({ seconds: num(d.seconds), tidyCalls: num(d.tidyCalls) });
      },
      () => setUsage({ seconds: 0, tidyCalls: 0 })
    );
  }, []);

  // Seed the draft from the first snapshot only; later snapshots never clobber edits.
  if (saved && !seeded) {
    setDraft(saved);
    setSeeded(true);
  }

  const dirty = saved !== null && comparable(draft) !== comparable(saved);

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const now = Date.now();
      await setDoc(
        doc(db, 'admin_settings', SPEECH_TO_TEXT_SETTINGS_DOC),
        normalizeSpeechToTextSettings({
          ...draft,
          updatedAt: now,
          updatedBy: user?.email ?? '',
        })
      );
      setSavedAt(now);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-lg bg-brand-blue-lighter/40 text-brand-blue-primary flex items-center justify-center">
          <Mic className="w-5 h-5" aria-hidden />
        </div>
        <h2 className="text-lg font-bold text-slate-900">Speech to text</h2>
      </div>

      {!seeded ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
          Loading…
        </div>
      ) : (
        <div className="space-y-6">
          <fieldset className="space-y-2">
            <legend className="block text-xs font-bold text-slate-700 mb-1">
              Transcription
            </legend>
            {ENGINES.map(({ id, label, hint }) => (
              <label
                key={id}
                className="flex items-start gap-3 cursor-pointer bg-white p-3 rounded-xl border border-slate-200"
              >
                <input
                  {...tourFieldAttr(
                    'admin.widget-config.field',
                    'quiz',
                    `speechToTextEngine-${id}`
                  )}
                  type="radio"
                  name="speech-to-text-engine"
                  value={id}
                  checked={draft.engine === id}
                  onChange={() => setDraft((d) => ({ ...d, engine: id }))}
                  className="mt-0.5 border-slate-300 text-brand-blue-primary focus:ring-brand-blue-primary"
                />
                <span>
                  <span className="block text-sm font-semibold text-slate-700">
                    {label}
                  </span>
                  <span className="block text-xs text-slate-500">{hint}</span>
                </span>
              </label>
            ))}
          </fieldset>

          {draft.engine === 'hybrid' && (
            <fieldset className="space-y-2">
              <legend className="block text-xs font-bold text-slate-700 mb-1">
                Gemini 3.5 Transcribe mode
              </legend>
              <p className="text-xs text-slate-500">
                Only used when Gemini 3.5 Transcribe is the model chosen for
                Speech to text transcription.
              </p>
              {MODES.map(({ id, label, hint }) => (
                <label
                  key={id}
                  className="flex items-start gap-3 cursor-pointer bg-white p-3 rounded-xl border border-slate-200"
                >
                  <input
                    {...tourFieldAttr(
                      'admin.widget-config.field',
                      'quiz',
                      `speechToTextMode-${id}`
                    )}
                    type="radio"
                    name="speech-to-text-mode"
                    value={id}
                    checked={draft.transcribeMode === id}
                    onChange={() =>
                      setDraft((d) => ({ ...d, transcribeMode: id }))
                    }
                    className="mt-0.5 border-slate-300 text-brand-blue-primary focus:ring-brand-blue-primary"
                  />
                  <span>
                    <span className="block text-sm font-semibold text-slate-700">
                      {label}
                    </span>
                    <span className="block text-xs text-slate-500">{hint}</span>
                  </span>
                </label>
              ))}
            </fieldset>
          )}

          <div className="flex items-start justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200">
            <span>
              <span className="block text-sm font-semibold text-slate-700">
                Tidy up button
              </span>
              <span
                id="speech-to-text-tidy-hint"
                className="block text-xs text-slate-500"
              >
                Lets a signed-in student ask AI to add punctuation and capitals
                to what they dictated, without changing any words.
              </span>
            </span>
            <Toggle
              checked={draft.tidyUp}
              onChange={(v) => setDraft((d) => ({ ...d, tidyUp: v }))}
              size="sm"
              showLabels={false}
              label="Tidy up button"
              describedBy="speech-to-text-tidy-hint"
              anchor={tourFieldAttr(
                'admin.widget-config.field',
                'quiz',
                'speechToTextTidyUp'
              )}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-3">
              <label className="block">
                <span className="block text-xs font-bold text-slate-700 mb-1">
                  Monthly limit: minutes of speech
                </span>
                <DraftNumberField
                  {...tourFieldAttr(
                    'admin.widget-config.field',
                    'quiz',
                    'speechToTextMonthlyCapMinutes'
                  )}
                  min={0}
                  step={100}
                  value={Math.round(draft.monthlyCapSeconds / 60)}
                  normalize={normalizeCap}
                  onCommit={(n) =>
                    setDraft((d) => ({
                      ...d,
                      monthlyCapSeconds: normalizeCap(n) * 60,
                    }))
                  }
                  className={fieldClass}
                />
              </label>
              <label className="block">
                <span className="block text-xs font-bold text-slate-700 mb-1">
                  Monthly limit: tidy-ups
                </span>
                <DraftNumberField
                  {...tourFieldAttr(
                    'admin.widget-config.field',
                    'quiz',
                    'speechToTextMonthlyCapTidyCalls'
                  )}
                  min={0}
                  step={100}
                  value={draft.monthlyCapTidyCalls}
                  normalize={normalizeCap}
                  onCommit={(n) =>
                    setDraft((d) => ({
                      ...d,
                      monthlyCapTidyCalls: normalizeCap(n),
                    }))
                  }
                  className={fieldClass}
                />
              </label>
              <p className="text-xs text-slate-500">
                When a limit is reached, students carry on with the free engine
                and the Tidy up button disappears until next month.
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-bold text-slate-700">This month</p>
              {usage ? (
                <div className="mt-2 space-y-3">
                  <UsageRow
                    label="Speech"
                    used={Math.round(usage.seconds / 60)}
                    cap={Math.round(draft.monthlyCapSeconds / 60)}
                    unit="minutes"
                  />
                  <UsageRow
                    label="Tidy-ups"
                    used={usage.tidyCalls}
                    cap={draft.monthlyCapTidyCalls}
                    unit="tidy-ups"
                  />
                </div>
              ) : (
                <p className="text-sm text-slate-500">Loading…</p>
              )}
            </div>
          </div>

          <p className="text-xs text-slate-500">
            Choose the AI models under Admin Settings &gt; Access &gt; AI:
            &quot;Speech to text transcription&quot; and &quot;Speech to text
            tidy-up&quot;.
          </p>

          <div className="flex items-center gap-3">
            <button
              type="button"
              {...tourFieldAttr(
                'admin.widget-config.field',
                'quiz',
                'speechToTextSave'
              )}
              onClick={handleSave}
              disabled={!dirty || saving}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-blue-primary px-4 py-2 text-sm font-bold text-white hover:bg-brand-blue-dark disabled:opacity-40"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
              ) : (
                <Save className="w-4 h-4" aria-hidden />
              )}
              Save
            </button>
            {error && (
              <span className="text-xs font-medium text-brand-red-primary">
                {error}
              </span>
            )}
            {!error && savedAt && !dirty && (
              <span className="text-xs text-slate-500">Saved</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
