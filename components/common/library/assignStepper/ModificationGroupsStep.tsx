// Modifications step body: groups of students, each with one set of shared rules.
import React, {
  useContext,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Plus, Search, Trash2, User } from 'lucide-react';
import { AuthContext } from '@/context/AuthContextValue';
import { SegmentedControl } from '@/components/common/SegmentedControl';
import { Toggle } from '@/components/common/Toggle';
import { useQuizTranslationSettings } from '@/hooks/useQuizTranslationSettings';
import { QUIZ_TRANSLATION_LANGUAGES } from '@/config/quizTranslation';
import { QUIZ_READ_ALOUD_FEATURE } from '@/config/quizReadAloud';
import { languageNativeLabel } from '@/utils/languageNativeLabel';
import { summarizeOverride } from '@/utils/studentOverrideSummary';
import {
  effectiveClassOverride,
  type ClassStudentRow,
} from '@/utils/studentTargetRef';
import {
  isNonEnglishQuizSource,
  uncoveredLocalesForTargets,
} from '@/utils/quizTranslationAdvisory';
import { tourAttr, tourFieldAttr } from '@/config/tourAnchors';
import type { QuizSupport } from '@/types';
import type { ModificationsQuizContext } from './ModificationsView';
import { usePickMenu } from './usePickMenu';
import { SupportsEditor } from './SupportsEditor';
import { useGoogleDrive } from '@/hooks/useGoogleDrive';
import {
  groupRuleLabels,
  hiddenOptionIdsForRule,
  newModificationGroup,
  withGroupStudents,
  type AnswerChoicesRule,
  type ModificationGroup,
  type TimeRule,
} from './modificationGroups';

export interface ModificationGroupsStepProps {
  groups: ModificationGroup[];
  onChange: (next: ModificationGroup[]) => void;
  /** Targetable students the Classes step sends the quiz to. */
  rows: ClassStudentRow[];
  /** Students in those classes with no school sign-in. */
  unresolvableCount: number;
  quizContext: ModificationsQuizContext;
  /** First time option's label ("15 min", "Standard"); absent hides the row. */
  timeLimitLabel?: string;
  /** Some question has a modified version; shows the Modified questions row. */
  hasModifiedQuestions?: boolean;
  /** Current per-student overrides, for the translation advisory. */
  overridesByKey: Parameters<typeof effectiveClassOverride>[1];
  /** True while a support's Drive file is still being shared. */
  onSharingChange?: (sharing: boolean) => void;
}

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({
  label,
  children,
}) => (
  <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-1.5 py-1.5">
    <span className="text-sm font-medium text-slate-700">{label}</span>
    {children}
  </div>
);

const TIME_RULES: Record<string, TimeRule> = {
  standard: 'standard',
  '1.5': 1.5,
  '2': 2,
  unlimited: 'unlimited',
};

const studentsLabel = (n: number) => (n === 1 ? '1 student' : `${n} students`);

const StudentsMenu: React.FC<{
  rows: ClassStudentRow[];
  picked: string[];
  onChange: (keys: string[]) => void;
}> = ({ rows, picked, onChange }) => {
  const { t } = useTranslation();
  const { open, setOpen, rootRef, onKeyDown } = usePickMenu();
  const menuId = useId();
  const [search, setSearch] = useState('');
  const pickedSet = new Set(picked);
  const q = search.trim().toLocaleLowerCase();
  const shown = rows.filter(
    (r) => !q || r.name.toLocaleLowerCase().includes(q)
  );
  const byClass = new Map<string, ClassStudentRow[]>();
  for (const row of shown)
    byClass.set(row.rosterName, [...(byClass.get(row.rosterName) ?? []), row]);
  const multiClass = new Set(rows.map((r) => r.rosterId)).size > 1;

  return (
    <div ref={rootRef} className="relative w-44 shrink-0" onKeyDown={onKeyDown}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        {...tourAttr('assign-mods.students')}
        className={`touch-target-expand flex h-8 w-full items-center gap-2 rounded-lg border px-2.5 text-sm hover:border-slate-400 ${
          picked.length > 0
            ? 'border-brand-blue-primary/50 bg-brand-blue-lighter/40 font-semibold text-brand-blue-dark'
            : 'border-slate-300 bg-white text-slate-700'
        }`}
      >
        <User className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-left">
          {picked.length > 0 ? studentsLabel(picked.length) : 'Select students'}
        </span>
        <ChevronDown
          className="h-3.5 w-3.5 shrink-0 text-slate-400"
          aria-hidden
        />
      </button>
      {open && (
        <div
          id={menuId}
          role="dialog"
          aria-label="Students"
          className="absolute left-0 top-full z-10 mt-1 w-[min(20rem,calc(100vw-7rem))] sm:left-auto sm:right-0 rounded-xl border border-slate-200 bg-white p-1 shadow-xl"
        >
          <div className="m-1 flex h-8 items-center gap-2 rounded-lg border border-slate-200 px-2">
            <Search className="h-3.5 w-3.5 text-slate-400" aria-hidden />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search students"
              aria-label="Search students"
              {...tourAttr('assign-mods.students-search')}
              className="min-w-0 flex-1 bg-transparent text-sm focus:outline-hidden"
            />
          </div>
          <div className="custom-scrollbar max-h-64 overflow-y-auto pb-1">
            {[...byClass.entries()].map(([rosterName, classRows]) => (
              <div key={rosterName}>
                {multiClass && (
                  <div className="truncate px-2 pt-2 pb-0.5 text-xxs font-bold uppercase tracking-widest text-slate-400">
                    {rosterName}
                  </div>
                )}
                {classRows.map((row) => {
                  const standing = row.defaultOverride
                    ? summarizeOverride(row.defaultOverride, t).join(', ')
                    : '';
                  return (
                    <label
                      key={row.key}
                      className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-800 hover:bg-slate-50"
                    >
                      <input
                        type="checkbox"
                        checked={pickedSet.has(row.key)}
                        onChange={() =>
                          onChange(
                            pickedSet.has(row.key)
                              ? picked.filter((k) => k !== row.key)
                              : [...picked, row.key]
                          )
                        }
                        {...tourFieldAttr(
                          'assign-mods.student',
                          'assign',
                          row.key
                        )}
                        className="h-4 w-4 rounded-sm accent-brand-blue-primary"
                      />
                      <span className="min-w-0 flex-1 truncate">
                        {row.name}
                      </span>
                      {standing && (
                        <span
                          className="max-w-[45%] shrink-0 truncate text-xs text-slate-400"
                          title={standing}
                        >
                          {standing}
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            ))}
            {shown.length === 0 && (
              <p className="px-2 py-2 text-sm text-slate-500">
                No students found
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export const ModificationGroupsStep: React.FC<ModificationGroupsStepProps> = ({
  groups,
  onChange,
  rows,
  unresolvableCount,
  quizContext,
  timeLimitLabel,
  hasModifiedQuestions = false,
  overridesByKey,
  onSharingChange,
}) => {
  const { t } = useTranslation();
  const { driveService } = useGoogleDrive();
  const deleteDriveCopies = (supports: QuizSupport[] | undefined) => {
    for (const s of supports ?? [])
      if (s.kind === 'drive')
        void driveService?.deleteFile(s.fileId).catch(() => undefined);
  };
  const auth = useContext(AuthContext);
  const readAloudOn =
    auth?.canAccessFeature?.(QUIZ_READ_ALOUD_FEATURE) === true;
  const translationOn = auth?.canAccessFeature?.('quiz-translation') === true;
  const { languages } = useQuizTranslationSettings(translationOn);
  const [openId, setOpenId] = useState<string | null>(null);

  const list = groups;
  const openGroup = list.find((g) => g.id === openId) ?? list.at(-1);
  const rowByKey = useMemo(
    () => new Map(rows.map((r) => [r.key, r] as const)),
    [rows]
  );
  const namesOf = (g: ModificationGroup) =>
    g.studentKeys
      .map((k) => rowByKey.get(k)?.name)
      .filter((n): n is string => !!n);
  const answerChoicesUseful = !!hiddenOptionIdsForRule(
    quizContext.questions,
    'drop-one'
  );

  const set = (id: string, patch: Partial<ModificationGroup>) =>
    onChange(list.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  // A Drive share finishes after other edits, so supports apply to the latest groups.
  const latest = useRef(groups);
  useLayoutEffect(() => {
    latest.current = groups;
  });
  const updateSupports = (
    id: string,
    update: (prev: QuizSupport[]) => QuizSupport[]
  ) => {
    const current = latest.current;
    if (!current.some((g) => g.id === id)) {
      // The group was removed while its file was sharing.
      deleteDriveCopies(update([]));
      return;
    }
    const next = current.map((g) =>
      g.id === id ? { ...g, supports: update(g.supports ?? []) } : g
    );
    latest.current = next;
    onChange(next);
  };

  const translation = quizContext.translation;
  const advisory = useMemo(
    () =>
      translation
        ? uncoveredLocalesForTargets(
            rows.map((row) => ({
              name: row.name,
              language: effectiveClassOverride(row, overridesByKey)?.language,
            })),
            translation
          )
        : [],
    [rows, overridesByKey, translation]
  );
  const generateDisabled =
    isNonEnglishQuizSource(translation?.sourceLanguage) ||
    translation?.hasBankSlots === true ||
    (translation?.cap?.remaining ?? 1) <= 0 ||
    !!translation?.generating;

  if (rows.length === 0) {
    return (
      <p className="text-sm text-slate-600">
        {t(
          'assignTargeting.noSignInStudents',
          'No one in the checked classes has a school sign-in, so there is nobody to modify individually.'
        )}
      </p>
    );
  }

  const languageOptions = QUIZ_TRANSLATION_LANGUAGES.filter(
    (l) =>
      languages.some((e) => e.code === l.code) || l.code === openGroup?.language
  );

  return (
    <div className="space-y-3">
      {advisory.map((entry) => (
        <div
          key={entry.locale}
          role="status"
          className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
        >
          <span className="flex-1">
            {t('quizTranslation.assign.advisory.missing', {
              count: entry.names.length,
              others: entry.names.length - 1,
              name: entry.names[0],
              language: languageNativeLabel(entry.locale),
            })}
          </span>
          {translation?.onGenerate && (
            <button
              type="button"
              disabled={generateDisabled}
              onClick={() => translation.onGenerate?.([entry.locale])}
              {...tourFieldAttr(
                'assign-mods.group-generate-translation',
                'assign',
                entry.locale
              )}
              className="touch-target-expand shrink-0 rounded-md border border-amber-300 bg-white px-2.5 py-1 font-bold text-amber-800 hover:bg-amber-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
            >
              {t('quizTranslation.assign.generate')}
            </button>
          )}
        </div>
      ))}
      {list.map((group, index) => {
        if (group.id !== openGroup?.id) {
          const names = namesOf(group);
          return (
            <button
              key={group.id}
              type="button"
              onClick={() => setOpenId(group.id)}
              {...tourFieldAttr(
                'assign-mods.group',
                'assign',
                `group-${index + 1}`
              )}
              className="flex w-full items-start justify-between gap-3 border-t border-slate-200 pt-2.5 text-left"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-slate-800">
                  {names.length > 0 ? names.join('; ') : 'No students'}
                </span>
                <span className="block truncate text-xs text-slate-500">
                  {groupRuleLabels(group, languageNativeLabel).join(', ') ||
                    'No changes'}
                </span>
              </span>
              <span className="shrink-0 text-xs font-bold text-brand-blue-primary">
                Edit
              </span>
            </button>
          );
        }
        const names = namesOf(group);
        return (
          <div
            key={group.id}
            className={`divide-y divide-slate-100 ${list.length > 1 ? 'border-t border-slate-200 pt-1' : ''}`}
          >
            <div className="pb-2">
              <Row label="Students">
                <StudentsMenu
                  rows={rows}
                  picked={group.studentKeys.filter((k) => rowByKey.has(k))}
                  onChange={(keys) =>
                    onChange(
                      withGroupStudents(list, group.id, [
                        ...group.studentKeys.filter((k) => !rowByKey.has(k)),
                        ...keys,
                      ])
                    )
                  }
                />
              </Row>
              {names.length > 0 && (
                <p className="text-xs leading-relaxed text-slate-500">
                  {names.join('; ')}
                </p>
              )}
              {unresolvableCount > 0 && (
                <p className="pt-1 text-xs text-slate-500">
                  {t(
                    'assignTargeting.noSignInCount',
                    '{{count}} students have no school sign-in and can’t be changed individually.',
                    { count: unresolvableCount }
                  )}
                </p>
              )}
            </div>
            {answerChoicesUseful && (
              <Row label="Answer choices">
                <SegmentedControl<AnswerChoicesRule>
                  role="radiogroup"
                  ariaLabel="Answer choices"
                  value={group.answerChoices}
                  onChange={(answerChoices) => set(group.id, { answerChoices })}
                  anchor={tourAttr('assign-mods.answer-choices')}
                  options={[
                    { value: 'all', label: 'All' },
                    { value: 'drop-one', label: 'Remove 1 wrong' },
                    { value: 'two', label: '2 choices' },
                  ]}
                />
              </Row>
            )}
            {timeLimitLabel && (
              <Row label="Time limit">
                <SegmentedControl<string>
                  role="radiogroup"
                  ariaLabel="Time limit"
                  value={String(group.time)}
                  onChange={(v) =>
                    set(group.id, { time: TIME_RULES[v] ?? 'standard' })
                  }
                  anchor={tourAttr('assign-mods.time')}
                  options={[
                    { value: 'standard', label: timeLimitLabel },
                    { value: '1.5', label: '1.5x' },
                    { value: '2', label: '2x' },
                    { value: 'unlimited', label: 'None' },
                  ]}
                />
              </Row>
            )}
            {hasModifiedQuestions && (
              <Row label="Modified questions">
                <Toggle
                  size="sm"
                  checked={group.modifiedQuestions === true}
                  onChange={(modifiedQuestions) =>
                    set(group.id, { modifiedQuestions })
                  }
                  label="Modified questions"
                  anchor={tourAttr('assign-mods.modified-questions')}
                />
              </Row>
            )}
            {readAloudOn && (
              <Row label="Read aloud">
                <Toggle
                  size="sm"
                  checked={group.readAloud}
                  onChange={(readAloud) => set(group.id, { readAloud })}
                  label="Read aloud"
                  anchor={tourAttr('assign-mods.read-aloud')}
                />
              </Row>
            )}
            {translationOn && languageOptions.length > 0 && (
              <Row label="Language">
                <select
                  value={group.language ?? ''}
                  onChange={(e) =>
                    set(group.id, { language: e.target.value || undefined })
                  }
                  aria-label="Language"
                  {...tourAttr('assign-mods.language')}
                  className="h-8 w-44 rounded-lg border border-slate-300 bg-white px-2.5 text-sm text-slate-700 touch:h-11"
                >
                  <option value="">Each student’s own</option>
                  {languageOptions.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.nativeLabel}
                    </option>
                  ))}
                </select>
              </Row>
            )}
            <SupportsEditor
              supports={group.supports ?? []}
              onChange={(update) => updateSupports(group.id, update)}
              onSharingChange={onSharingChange}
            />
            {list.length > 1 && (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => {
                    deleteDriveCopies(group.supports);
                    onChange(list.filter((g) => g.id !== group.id));
                    setOpenId(null);
                  }}
                  {...tourAttr('assign-mods.remove-group')}
                  className="touch-target-expand inline-flex items-center gap-1 text-xs font-bold text-brand-red-primary hover:underline"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  Remove group
                </button>
              </div>
            )}
          </div>
        );
      })}
      <button
        type="button"
        onClick={() => {
          const added = newModificationGroup();
          onChange([...list, added]);
          setOpenId(added.id);
        }}
        {...tourAttr('assign-mods.add-group')}
        className="touch-target-expand inline-flex items-center gap-1 text-left text-xs font-bold text-brand-blue-primary hover:underline"
      >
        <Plus className="h-3.5 w-3.5" aria-hidden />
        Another group with different changes
      </button>
    </div>
  );
};
