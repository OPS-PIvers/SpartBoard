// District Speak defaults in admin_settings/flashcardsSpeak (plan §4.3, F22).
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { doc, setDoc } from 'firebase/firestore';
import { Loader2, Mic, Save } from 'lucide-react';
import { db } from '@/config/firebase';
import type { FlashcardsSpeakAdminConfig, SpeakLanguage } from '@/types';
import {
  FLASHCARDS_SPEAK_SETTINGS_DOC,
  SPEAK_ATTEMPTS_MAX,
  SPEAK_ATTEMPTS_MIN,
  clampSpeakAttempts,
  defaultFlashcardsSpeakAdminConfig,
} from '@/config/flashcardsSpeakAdmin';
import {
  SPEAK_LANGUAGES,
  SPEAK_PRESET_IDS,
  type SpeakPresetId,
} from '@/config/pronunciationGroups';
import { useFlashcardsSpeakAdminConfig } from '@/hooks/useFlashcardsSpeakAdminConfig';
import { tourFieldAttr, tourTypeAttr } from '@/config/tourAnchors';

const fieldClass =
  'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-brand-blue-primary/40';

const ATTEMPT_OPTIONS = Array.from(
  { length: SPEAK_ATTEMPTS_MAX - SPEAK_ATTEMPTS_MIN + 1 },
  (_, i) => SPEAK_ATTEMPTS_MIN + i
);

type EditedField = SpeakLanguage | 'attempts' | 'unclearConfidence';

// Applies only the fields this admin changed, so another admin's newer save survives.
const applyEdits = (
  base: FlashcardsSpeakAdminConfig,
  draft: FlashcardsSpeakAdminConfig,
  edited: ReadonlySet<EditedField>
): FlashcardsSpeakAdminConfig => {
  const next: FlashcardsSpeakAdminConfig = {
    ...base,
    languages: { ...base.languages },
  };
  for (const field of edited) {
    if (field === 'attempts') next.attempts = draft.attempts;
    else if (field === 'unclearConfidence')
      next.unclearConfidence = draft.unclearConfidence;
    else {
      const preset = draft.languages[field]?.preset;
      if (preset) {
        next.languages[field] = {
          groups: {},
          ...base.languages[field],
          preset,
        };
      }
    }
  }
  return next;
};

const configsEqual = (
  a: FlashcardsSpeakAdminConfig,
  b: FlashcardsSpeakAdminConfig
): boolean => JSON.stringify(a) === JSON.stringify(b);

export const FlashcardsSpeakConfigurationPanel: React.FC = () => {
  const { t } = useTranslation();
  const { config: saved, failed: readFailed } = useFlashcardsSpeakAdminConfig();
  const [draft, setDraft] = useState<FlashcardsSpeakAdminConfig>(
    defaultFlashcardsSpeakAdminConfig
  );
  const [seeded, setSeeded] = useState(false);
  const [edited, setEdited] = useState<ReadonlySet<EditedField>>(
    () => new Set()
  );
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Seed the draft from the first snapshot only; later snapshots never clobber edits.
  if (saved && !seeded) {
    setDraft(saved);
    setSeeded(true);
  }

  const pending = saved ? applyEdits(saved, draft, edited) : null;
  const dirty =
    saved !== null && pending !== null && !configsEqual(pending, saved);

  const view = pending ?? draft;

  const markEdited = (field: EditedField) =>
    setEdited((prev) => new Set(prev).add(field));

  const setPreset = (language: SpeakLanguage, preset: SpeakPresetId) => {
    markEdited(language);
    setDraft((d) => ({
      ...d,
      languages: {
        ...d.languages,
        [language]: { groups: {}, ...d.languages[language], preset },
      },
    }));
  };

  const handleSave = async () => {
    if (!pending) return;
    setSaving(true);
    setFailed(false);
    try {
      await setDoc(
        doc(db, 'admin_settings', FLASHCARDS_SPEAK_SETTINGS_DOC),
        pending
      );
      setDraft(pending);
      setEdited(new Set());
      setSavedAt(Date.now());
    } catch (err) {
      console.error('[FlashcardsSpeakConfigurationPanel] save:', err);
      setFailed(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-rose-100 p-2 text-rose-700">
          <Mic className="h-5 w-5" aria-hidden="true" />
        </div>
        <div>
          <h3 className="text-sm font-black uppercase tracking-widest text-slate-700">
            {t('flashcards.speak.admin.title')}
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            {t('flashcards.speak.admin.intro')}
          </p>
        </div>
      </div>

      {!seeded ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          {t('common.loading')}
        </div>
      ) : (
        <>
          <div className="divide-y divide-slate-200 border-y border-slate-200">
            {SPEAK_LANGUAGES.map((language) => {
              const preset = view.languages[language]?.preset ?? 'beginner';
              const label = t('flashcards.speak.admin.languageLevel', {
                language: t(`flashcards.speak.admin.languages.${language}`),
              });
              return (
                <label
                  key={language}
                  className="grid gap-2 py-3 sm:grid-cols-[1fr_14rem] sm:items-center"
                >
                  <span className="block text-sm font-bold text-slate-700">
                    {label}
                  </span>
                  <select
                    title={t(`flashcards.speak.editor.presets.${preset}Help`)}
                    {...tourFieldAttr(
                      'admin.widget-config.field',
                      'flashcards',
                      `speak-preset-${language}`
                    )}
                    className={fieldClass}
                    value={preset}
                    onChange={(e) =>
                      setPreset(language, e.target.value as SpeakPresetId)
                    }
                  >
                    {SPEAK_PRESET_IDS.map((id) => (
                      <option key={id} value={id}>
                        {t(`flashcards.speak.editor.presets.${id}`)}
                      </option>
                    ))}
                  </select>
                </label>
              );
            })}

            <label className="grid gap-2 py-3 sm:grid-cols-[1fr_14rem] sm:items-center">
              <span className="block text-sm font-bold text-slate-700">
                {t('flashcards.speak.admin.attempts')}
              </span>
              <select
                {...tourFieldAttr(
                  'admin.widget-config.field',
                  'flashcards',
                  'speak-attempts'
                )}
                className={fieldClass}
                value={view.attempts}
                onChange={(e) => {
                  markEdited('attempts');
                  const attempts = clampSpeakAttempts(
                    Number.parseInt(e.target.value, 10)
                  );
                  setDraft((d) => ({ ...d, attempts }));
                }}
              >
                {ATTEMPT_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2 py-3 sm:grid-cols-[1fr_14rem] sm:items-center">
              <span className="block text-sm font-bold text-slate-700">
                {t('flashcards.speak.admin.unclearConfidence')}
              </span>
              <span className="flex items-center gap-3">
                <input
                  title={t('flashcards.speak.admin.unclearConfidenceHelp')}
                  {...tourFieldAttr(
                    'admin.widget-config.field',
                    'flashcards',
                    'speak-unclear-confidence'
                  )}
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  className="w-full accent-brand-blue-primary"
                  value={view.unclearConfidence}
                  onChange={(e) => {
                    const n = Number.parseFloat(e.target.value);
                    if (Number.isFinite(n)) {
                      markEdited('unclearConfidence');
                      setDraft((d) => ({ ...d, unclearConfidence: n }));
                    }
                  }}
                />
                <span className="w-10 text-right font-mono text-sm text-slate-700">
                  {view.unclearConfidence.toFixed(2)}
                </span>
              </span>
            </label>
          </div>

          <div className="flex items-center justify-end gap-3">
            {failed && (
              <span className="text-xs font-medium text-brand-red-primary">
                {t('plcDashboard.members.actionError')}
              </span>
            )}
            {!failed && savedAt && !dirty && (
              <span className="text-xs text-slate-500">
                {t('flashcards.speak.admin.saved')}
              </span>
            )}
            <button
              type="button"
              {...tourTypeAttr('admin.widget-config.save', 'flashcards')}
              onClick={() => void handleSave()}
              disabled={!dirty || saving || readFailed}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-blue-primary px-4 py-2 text-sm font-bold text-white hover:bg-brand-blue-dark disabled:opacity-40"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Save className="h-4 w-4" aria-hidden />
              )}
              {t('flashcards.speak.admin.save')}
            </button>
          </div>
        </>
      )}
    </section>
  );
};
