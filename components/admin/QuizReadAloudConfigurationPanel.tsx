// Admin card for quiz languages: read-aloud voices and translation (plan §7, D24).
import React, { useEffect, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { Loader2, Save, Volume2 } from 'lucide-react';
import { db } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import type {
  QuizReadAloudAdminSettings,
  QuizTranslationSettings,
} from '@/types';
import {
  DEFAULT_QUIZ_TRANSLATION_SETTINGS,
  QUIZ_TRANSLATION_LANGUAGES,
  QUIZ_TRANSLATION_SETTINGS_DOC,
  monthlyTranslationUsageDocId,
  normalizeQuizTranslationSettings,
} from '@/config/quizTranslation';
import {
  DEFAULT_QUIZ_READ_ALOUD_SETTINGS,
  QUIZ_READ_ALOUD_LANGUAGES,
  QUIZ_READ_ALOUD_SETTINGS_DOC,
  QUIZ_READ_ALOUD_VOICES,
  monthlyTtsUsageDocId,
  normalizeQuizReadAloudSettings,
} from '@/config/quizReadAloud';
import { ReadAloudPreviewButton } from '@/components/quiz/readAloud/ReadAloudPreviewButton';

interface TranslationUsage {
  units: number;
  outputTokens: number;
}

interface MonthlyUsage {
  neural2Chars: number;
  standardChars: number;
  cacheHits: number;
}

const selectClass =
  'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40';

const settingsEqual = (
  a: QuizReadAloudAdminSettings,
  b: QuizReadAloudAdminSettings
): boolean => JSON.stringify(a) === JSON.stringify(b);

const formatChars = (n: number): string => n.toLocaleString();

/** Read-aloud tags are regional (`es-US`); translation codes are bare (`es`). */
const readAloudTagForCode = (code: string): string | undefined =>
  QUIZ_READ_ALOUD_LANGUAGES.find(
    ({ tag }) => tag.split('-')[0].toLowerCase() === code.toLowerCase()
  )?.tag;

interface QuizReadAloudConfigurationPanelProps {
  /** Notifies the host modal when this panel holds an unsaved draft. */
  onDirtyChange?: (dirty: boolean) => void;
}

export const QuizReadAloudConfigurationPanel: React.FC<
  QuizReadAloudConfigurationPanelProps
> = ({ onDirtyChange }) => {
  const { user } = useAuth();
  const [saved, setSaved] = useState<QuizReadAloudAdminSettings | null>(null);
  const [draft, setDraft] = useState<QuizReadAloudAdminSettings>(
    DEFAULT_QUIZ_READ_ALOUD_SETTINGS
  );
  const [seeded, setSeeded] = useState(false);
  const [usage, setUsage] = useState<MonthlyUsage | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [savedTranslation, setSavedTranslation] =
    useState<QuizTranslationSettings | null>(null);
  const [translationDraft, setTranslationDraft] =
    useState<QuizTranslationSettings>(DEFAULT_QUIZ_TRANSLATION_SETTINGS);
  const [translationSeeded, setTranslationSeeded] = useState(false);
  const [translationUsage, setTranslationUsage] =
    useState<TranslationUsage | null>(null);

  useEffect(() => {
    const ref = doc(db, 'admin_settings', QUIZ_READ_ALOUD_SETTINGS_DOC);
    return onSnapshot(
      ref,
      (snap) => setSaved(normalizeQuizReadAloudSettings(snap.data())),
      (err) => {
        console.error('[QuizReadAloudConfigurationPanel] settings:', err);
        setSaved(DEFAULT_QUIZ_READ_ALOUD_SETTINGS);
      }
    );
  }, []);

  useEffect(() => {
    const ref = doc(db, 'ai_usage', monthlyTtsUsageDocId());
    return onSnapshot(
      ref,
      (snap) => {
        const d = snap.data() ?? {};
        const num = (v: unknown) => (typeof v === 'number' ? v : 0);
        setUsage({
          neural2Chars: num(d.neural2Chars),
          standardChars: num(d.standardChars),
          cacheHits: num(d.cacheHits),
        });
      },
      () => setUsage({ neural2Chars: 0, standardChars: 0, cacheHits: 0 })
    );
  }, []);

  useEffect(() => {
    const ref = doc(db, 'admin_settings', QUIZ_TRANSLATION_SETTINGS_DOC);
    return onSnapshot(
      ref,
      (snap) =>
        setSavedTranslation(normalizeQuizTranslationSettings(snap.data())),
      (err) => {
        console.error('[QuizReadAloudConfigurationPanel] translation:', err);
        setSavedTranslation(DEFAULT_QUIZ_TRANSLATION_SETTINGS);
      }
    );
  }, []);

  useEffect(() => {
    const ref = doc(db, 'ai_usage', monthlyTranslationUsageDocId());
    return onSnapshot(
      ref,
      (snap) => {
        const d = snap.data() ?? {};
        const num = (v: unknown) => (typeof v === 'number' ? v : 0);
        setTranslationUsage({
          units: num(d.units),
          outputTokens: num(d.outputTokens),
        });
      },
      () => setTranslationUsage(null)
    );
  }, []);

  // Seed the draft from the first snapshot only; later snapshots never clobber edits.
  if (saved && !seeded) {
    setDraft(saved);
    setSeeded(true);
  }

  if (savedTranslation && !translationSeeded) {
    setTranslationDraft(savedTranslation);
    setTranslationSeeded(true);
  }

  const translationDirty =
    savedTranslation !== null &&
    JSON.stringify({
      ...translationDraft,
      updatedAt: 0,
      updatedBy: '',
    }) !== JSON.stringify({ ...savedTranslation, updatedAt: 0, updatedBy: '' });

  const readAloudDirty = saved !== null && !settingsEqual(draft, saved);

  const dirty = readAloudDirty || translationDirty;

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  const toggleTranslationLanguage = (code: string, enabled: boolean) =>
    setTranslationDraft((d) => ({
      ...d,
      enabledLanguages: enabled
        ? Array.from(new Set([...d.enabledLanguages, code]))
        : d.enabledLanguages.filter((c) => c !== code),
    }));

  const setVoice = (
    kind: 'voicesByLanguage' | 'standardVoicesByLanguage',
    tag: string,
    voice: string
  ) => setDraft((d) => ({ ...d, [kind]: { ...d[kind], [tag]: voice } }));

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const now = Date.now();
      // Save is enabled by a translation-only edit too; don't rewrite read-aloud then.
      if (readAloudDirty) {
        await setDoc(
          doc(db, 'admin_settings', QUIZ_READ_ALOUD_SETTINGS_DOC),
          draft
        );
      }
      if (translationDirty) {
        await setDoc(doc(db, 'admin_settings', QUIZ_TRANSLATION_SETTINGS_DOC), {
          ...translationDraft,
          updatedAt: now,
          updatedBy: user?.email ?? '',
        });
      }
      setSavedAt(now);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const capPct =
    draft.neural2MonthlyCapChars > 0 && usage
      ? Math.min(
          100,
          Math.round((usage.neural2Chars / draft.neural2MonthlyCapChars) * 100)
        )
      : 0;

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-lg bg-brand-blue-lighter/40 text-brand-blue-primary flex items-center justify-center">
          <Volume2 className="w-5 h-5" />
        </div>
        <h2 className="text-lg font-bold text-slate-900">Quiz languages</h2>
      </div>

      {!seeded ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
          Loading…
        </div>
      ) : (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="text-left font-bold px-4 py-2">Language</th>
                  <th className="text-left font-bold px-4 py-2">
                    Offer for translation
                  </th>
                  <th className="text-left font-bold px-4 py-2">
                    Premium voice
                  </th>
                  <th className="text-left font-bold px-4 py-2">
                    Standard fallback
                  </th>
                </tr>
              </thead>
              <tbody>
                {QUIZ_READ_ALOUD_LANGUAGES.map(({ tag, label }) => {
                  const voices = QUIZ_READ_ALOUD_VOICES[tag];
                  const translationCode = QUIZ_TRANSLATION_LANGUAGES.find(
                    (l) => readAloudTagForCode(l.code) === tag
                  )?.code;
                  return (
                    <tr key={tag} className="border-t border-slate-100">
                      <td className="px-4 py-2 font-semibold text-slate-800">
                        {label}
                        <span className="block text-xs font-normal text-slate-500">
                          {tag}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        {translationCode ? (
                          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                            <input
                              type="checkbox"
                              checked={translationDraft.enabledLanguages.includes(
                                translationCode
                              )}
                              onChange={(e) =>
                                toggleTranslationLanguage(
                                  translationCode,
                                  e.target.checked
                                )
                              }
                            />
                            Enabled
                          </label>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2 space-y-1">
                        <select
                          aria-label={`${label} premium voice`}
                          className={selectClass}
                          value={draft.voicesByLanguage[tag] ?? ''}
                          onChange={(e) =>
                            setVoice('voicesByLanguage', tag, e.target.value)
                          }
                        >
                          {voices.neural2.map((v) => (
                            <option key={v} value={v}>
                              {v}
                            </option>
                          ))}
                        </select>
                        <ReadAloudPreviewButton
                          language={tag}
                          voice={draft.voicesByLanguage[tag]}
                          label="Play sample"
                        />
                      </td>
                      <td className="px-4 py-2 space-y-1">
                        <select
                          aria-label={`${label} Standard fallback voice`}
                          className={selectClass}
                          value={draft.standardVoicesByLanguage[tag] ?? ''}
                          onChange={(e) =>
                            setVoice(
                              'standardVoicesByLanguage',
                              tag,
                              e.target.value
                            )
                          }
                        >
                          {voices.standard.map((v) => (
                            <option key={v} value={v}>
                              {v}
                            </option>
                          ))}
                        </select>
                        <ReadAloudPreviewButton
                          language={tag}
                          voice={draft.standardVoicesByLanguage[tag]}
                          label="Play sample"
                        />
                      </td>
                    </tr>
                  );
                })}
                {QUIZ_TRANSLATION_LANGUAGES.filter(
                  (l) => !readAloudTagForCode(l.code)
                ).map(({ code, label, nativeLabel }) => (
                  <tr key={code} className="border-t border-slate-100">
                    <td className="px-4 py-2 font-semibold text-slate-800">
                      {label}
                      <span className="block text-xs font-normal text-slate-500">
                        {nativeLabel} · {code}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={translationDraft.enabledLanguages.includes(
                            code
                          )}
                          onChange={(e) =>
                            toggleTranslationLanguage(code, e.target.checked)
                          }
                        />
                        Enabled
                      </label>
                    </td>
                    <td className="px-4 py-2 text-slate-500">—</td>
                    <td className="px-4 py-2 text-slate-500">—</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="block text-xs font-bold text-slate-700 mb-1">
                Premium voice characters per month
              </span>
              <input
                type="number"
                min={0}
                step={1000}
                value={draft.neural2MonthlyCapChars}
                onChange={(e) => {
                  const n = Number.parseInt(e.target.value, 10);
                  setDraft((d) => ({
                    ...d,
                    neural2MonthlyCapChars: Number.isFinite(n)
                      ? Math.max(0, n)
                      : 0,
                  }));
                }}
                className={selectClass}
              />
              <span className="block text-xs text-slate-500 mt-1">
                Google&apos;s free tier is 1,000,000. New audio past the cap
                uses the Standard voice.
              </span>
            </label>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-bold text-slate-700">This month</p>
              {usage ? (
                <dl className="mt-1 space-y-0.5 text-sm text-slate-800">
                  <div className="flex justify-between">
                    <dt>Neural2</dt>
                    <dd className="font-mono">
                      {formatChars(usage.neural2Chars)} ({capPct}%)
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Standard</dt>
                    <dd className="font-mono">
                      {formatChars(usage.standardChars)}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Cache hits</dt>
                    <dd className="font-mono">
                      {formatChars(usage.cacheHits)}
                    </dd>
                  </div>
                </dl>
              ) : (
                <p className="text-sm text-slate-500">Loading…</p>
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-3">
              <label className="block">
                <span className="block text-xs font-bold text-slate-700 mb-1">
                  Translations per month
                </span>
                <input
                  type="number"
                  min={0}
                  step={100}
                  value={translationDraft.monthlyCapUnits}
                  onChange={(e) => {
                    const n = Number.parseInt(e.target.value, 10);
                    setTranslationDraft((d) => ({
                      ...d,
                      monthlyCapUnits: Number.isFinite(n) ? Math.max(0, n) : 0,
                    }));
                  }}
                  className={selectClass}
                />
                <span className="block text-xs text-slate-500 mt-1">
                  One unit is one quiz translated into one language. Teachers
                  are blocked past the cap.
                </span>
              </label>
              <label className="block">
                <span className="block text-xs font-bold text-slate-700 mb-1">
                  Translation output tokens per month
                </span>
                <input
                  type="number"
                  min={0}
                  step={100000}
                  value={translationDraft.monthlyCapOutputTokens}
                  onChange={(e) => {
                    const n = Number.parseInt(e.target.value, 10);
                    setTranslationDraft((d) => ({
                      ...d,
                      monthlyCapOutputTokens: Number.isFinite(n)
                        ? Math.max(0, n)
                        : 0,
                    }));
                  }}
                  className={selectClass}
                />
              </label>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-bold text-slate-700">
                Translations this month
              </p>
              {translationUsage ? (
                <dl className="mt-1 space-y-0.5 text-sm text-slate-800">
                  <div className="flex justify-between">
                    <dt>Quiz languages</dt>
                    <dd className="font-mono">
                      {formatChars(translationUsage.units)} of{' '}
                      {formatChars(translationDraft.monthlyCapUnits)}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Output tokens</dt>
                    <dd className="font-mono">
                      {formatChars(translationUsage.outputTokens)} of{' '}
                      {formatChars(translationDraft.monthlyCapOutputTokens)}
                    </dd>
                  </div>
                </dl>
              ) : (
                <p className="text-sm text-slate-500">Loading…</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
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
