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
import { ChevronDown, Plus, Trash2, User, Users } from 'lucide-react';
import { AuthContext } from '@/context/AuthContextValue';
import { SegmentedControl } from '@/components/common/SegmentedControl';
import { Toggle } from '@/components/common/Toggle';
import { useQuizTranslationSettings } from '@/hooks/useQuizTranslationSettings';
import { QUIZ_TRANSLATION_LANGUAGES } from '@/config/quizTranslation';
import { QUIZ_READ_ALOUD_FEATURE } from '@/config/quizReadAloud';
import { SPEECH_TO_TEXT_FEATURE } from '@/utils/speechToText/types';
import { dictationLocaleFor } from '@/utils/speechToText/languages';
import { languageDisplayLabel } from '@/utils/languageDisplayLabel';
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
import type { ModificationClassGroup } from './ModificationsView.helpers';
import { usePickMenu } from './usePickMenu';
import { SupportsEditor } from './SupportsEditor';
import { QuestionsMenu } from './QuestionsMenu';
import { useGoogleDrive } from '@/hooks/useGoogleDrive';
import {
  groupRuleLabels,
  hiddenOptionIdsForRule,
  isBlankGroup,
  newModificationGroup,
  withGroupStudents,
  type AnswerChoicesRule,
  type ModificationGroup,
  type TimeRule,
} from './modificationGroups';
import { SearchField } from '@/components/common/SearchField';

export interface ModificationGroupsStepProps {
  groups: ModificationGroup[];
  onChange: (next: ModificationGroup[]) => void;
  /** Targetable students the Classes step sends the quiz to. */
  rows: ClassStudentRow[];
  /** Saved class groups, offered above the students in the Students menu. */
  classGroups?: ModificationClassGroup[];
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
  /** Shows the Printed version row. */
  printedAvailable?: boolean;
  /** Drive files of class presets: shared with the class, so never deleted here. */
  keepFileIds?: ReadonlySet<string>;
  /** Editing a launched quiz: the languages it serves, since nothing translates after assign. */
  servedLocales?: readonly string[];
}

export const ModificationRow: React.FC<{
  label: string;
  children: React.ReactNode;
}> = ({ label, children }) => (
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

// A launched quiz covers exactly the languages its session serves.
const servedCoverage = (locales: readonly string[]) => ({
  index: Object.fromEntries(
    locales.map((locale) => [
      locale,
      {
        driveFileId: '',
        reviewedCount: 1,
        staleCount: 0,
        questionCount: 1,
        sourceHashes: {},
        updatedAt: 0,
      },
    ])
  ),
});

const studentsLabel = (n: number) => (n === 1 ? '1 student' : `${n} students`);

const StudentsMenu: React.FC<{
  rows: ClassStudentRow[];
  classGroups: ModificationClassGroup[];
  picked: string[];
  onChange: (keys: string[]) => void;
}> = ({ rows, classGroups, picked, onChange }) => {
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
  // Tour row numbers follow the order on screen, class by class.
  const rowNumber = new Map(
    [...byClass.values()].flat().map((row, i) => [row.key, i + 1] as const)
  );
  const multiClass = new Set(rows.map((r) => r.rosterId)).size > 1;
  const shownGroups = classGroups.filter(
    (g) => !q || g.name.toLocaleLowerCase().includes(q)
  );
  const exactGroup =
    picked.length > 0
      ? classGroups.find(
          (g) =>
            g.keys.length === picked.length &&
            g.keys.every((k) => pickedSet.has(k))
        )
      : undefined;
  const dupNames = new Set(
    classGroups.map((g) => g.name).filter((n, i, all) => all.indexOf(n) !== i)
  );
  const sectionLabel =
    'truncate px-2 pt-2 pb-0.5 text-xxs font-bold uppercase tracking-widest text-slate-400';

  return (
    <div
      ref={rootRef}
      className="relative min-w-44 max-w-60 shrink-0"
      onKeyDown={onKeyDown}
    >
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
        {exactGroup ? (
          <Users className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden />
        ) : (
          <User className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden />
        )}
        <span className="min-w-0 flex-1 truncate text-left">
          {exactGroup
            ? exactGroup.name
            : picked.length > 0
              ? studentsLabel(picked.length)
              : 'Select students'}
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
          <SearchField
            value={search}
            onChange={setSearch}
            placeholder="Search students"
            anchor={tourAttr('assign-mods.students-search')}
            className="m-1 flex h-8 items-center gap-2 rounded-lg border border-slate-200 px-2"
          />
          <div className="custom-scrollbar max-h-64 overflow-y-auto pb-1">
            {shownGroups.length > 0 && (
              <>
                <div className={sectionLabel}>Groups</div>
                {shownGroups.map((group, groupIndex) => {
                  const added =
                    group.keys.length > 0 &&
                    group.keys.every((k) => pickedSet.has(k));
                  return (
                    <button
                      key={group.id}
                      type="button"
                      disabled={group.keys.length === 0}
                      title={
                        group.keys.length === 0
                          ? 'No one in this group has a school sign-in'
                          : undefined
                      }
                      aria-pressed={added}
                      onClick={() => {
                        const keys = new Set(group.keys);
                        onChange(
                          added
                            ? picked.filter((k) => !keys.has(k))
                            : [
                                ...picked,
                                ...group.keys.filter((k) => !pickedSet.has(k)),
                              ]
                        );
                      }}
                      {...tourFieldAttr(
                        'assign-mods.class-group',
                        'assign',
                        `row-${groupIndex + 1}`
                      )}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Users
                        className="h-4 w-4 shrink-0 text-brand-blue-primary"
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1 truncate font-semibold text-slate-800">
                        {group.name}
                        {dupNames.has(group.name) && (
                          <span className="font-normal text-slate-400">
                            {' '}
                            {group.rosterName}
                          </span>
                        )}
                      </span>
                      <span
                        className={`shrink-0 text-xs ${added ? 'font-bold text-brand-blue-primary' : 'text-slate-400'}`}
                      >
                        {added ? 'Added' : group.keys.length}
                      </span>
                    </button>
                  );
                })}
                {shown.length > 0 && !multiClass && (
                  <div className={sectionLabel}>Students</div>
                )}
              </>
            )}
            {[...byClass.entries()].map(([rosterName, classRows]) => (
              <div key={rosterName}>
                {multiClass && <div className={sectionLabel}>{rosterName}</div>}
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
                          `row-${rowNumber.get(row.key) ?? 0}`
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
            {shown.length === 0 && shownGroups.length === 0 && (
              <p className="px-2 py-2 text-sm text-slate-500">
                No students found
              </p>
            )}
          </div>
          <div className="flex items-center justify-between border-t border-slate-100 px-2 pb-0.5 pt-1.5">
            {picked.length > 0 ? (
              <button
                type="button"
                onClick={() => onChange([])}
                {...tourAttr('assign-mods.students-clear')}
                className="touch-target-expand text-xs font-bold text-slate-500 hover:underline"
              >
                Clear
              </button>
            ) : (
              <span />
            )}
            <button
              type="button"
              onClick={() => setOpen(false)}
              {...tourAttr('assign-mods.students-done')}
              className="touch-target-expand rounded-md bg-brand-blue-primary px-3 py-1 text-xs font-bold text-white hover:bg-brand-blue-dark"
            >
              Done
            </button>
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
  classGroups = [],
  unresolvableCount,
  quizContext,
  timeLimitLabel,
  hasModifiedQuestions = false,
  overridesByKey,
  onSharingChange,
  printedAvailable = false,
  keepFileIds,
  servedLocales,
}) => {
  const { t } = useTranslation();
  const { driveService } = useGoogleDrive();
  const deleteDriveCopies = (supports: QuizSupport[] | undefined) => {
    for (const s of supports ?? [])
      if (s.kind === 'drive' && !keepFileIds?.has(s.fileId))
        void driveService?.deleteFile(s.fileId).catch(() => undefined);
  };
  const auth = useContext(AuthContext);
  const readAloudOn =
    auth?.canAccessFeature?.(QUIZ_READ_ALOUD_FEATURE) === true;
  const speechToTextOn =
    auth?.canAccessFeature?.(SPEECH_TO_TEXT_FEATURE) === true;
  const translationOn = auth?.canAccessFeature?.('quiz-translation') === true;
  const fewerQuestionsOn =
    quizContext.fewerQuestions === true &&
    quizContext.questions.length > 1 &&
    auth?.canAccessFeature?.('modification-fewer-questions') === true;
  // A subset saved before (per student, or from a class preset) stays visible so it can be cleared.
  const questionsRowFor = (g: ModificationGroup) =>
    fewerQuestionsOn ||
    (quizContext.questions.length > 0 && !!g.questionIds?.length);
  const { languages } = useQuizTranslationSettings(translationOn);
  const [openId, setOpenId] = useState<string | null>(null);

  const list = groups;
  const openGroup = list.find((g) => g.id === openId) ?? list[0];
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
            servedLocales ? servedCoverage(servedLocales) : translation
          )
        : [],
    [rows, overridesByKey, translation, servedLocales]
  );
  // Assign translates on its own, so the notice shows only when it can't.
  const autoTranslateBlocked =
    !!servedLocales ||
    isNonEnglishQuizSource(translation?.sourceLanguage) ||
    translation?.hasBankSlots === true ||
    (translation?.cap?.remaining ?? 1) <= 0;

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
      {(autoTranslateBlocked ? advisory : []).map((entry) => (
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
              language: languageDisplayLabel(entry.locale),
            })}
          </span>
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
                  {[
                    ...groupRuleLabels(group, languageDisplayLabel),
                    ...summarizeOverride(group.carried ?? {}, t).map(
                      (chip) => chip.charAt(0).toLowerCase() + chip.slice(1)
                    ),
                  ].join(', ') || 'No changes'}
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
              <ModificationRow label="Students">
                <StudentsMenu
                  rows={rows}
                  classGroups={classGroups}
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
              </ModificationRow>
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
            {questionsRowFor(group) && (
              <ModificationRow label="Questions">
                <QuestionsMenu
                  questions={quizContext.questions}
                  picked={group.questionIds}
                  onChange={(questionIds) => set(group.id, { questionIds })}
                />
              </ModificationRow>
            )}
            {answerChoicesUseful && (
              <ModificationRow label="Answer choices">
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
              </ModificationRow>
            )}
            {timeLimitLabel && (
              <ModificationRow label="Time limit">
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
              </ModificationRow>
            )}
            {hasModifiedQuestions && (
              <ModificationRow label="Modified questions">
                <Toggle
                  size="sm"
                  checked={group.modifiedQuestions === true}
                  onChange={(modifiedQuestions) =>
                    set(group.id, { modifiedQuestions })
                  }
                  label="Modified questions"
                  anchor={tourAttr('assign-mods.modified-questions')}
                />
              </ModificationRow>
            )}
            {readAloudOn && (
              <ModificationRow label="Read aloud">
                <Toggle
                  size="sm"
                  checked={group.readAloud}
                  onChange={(readAloud) => set(group.id, { readAloud })}
                  label="Read aloud"
                  anchor={tourAttr('assign-mods.read-aloud')}
                />
              </ModificationRow>
            )}
            {speechToTextOn && (
              <ModificationRow label="Speech to text">
                <Toggle
                  size="sm"
                  checked={group.speechToText}
                  onChange={(speechToText) => set(group.id, { speechToText })}
                  label="Speech to text"
                  anchor={tourAttr('assign-mods.speech-to-text')}
                />
              </ModificationRow>
            )}
            {speechToTextOn &&
              group.speechToText &&
              group.language &&
              !dictationLocaleFor(group.language) && (
                <p className="pb-1.5 text-xs text-slate-500">
                  Not available in {languageDisplayLabel(group.language)}. These
                  students will dictate in English.
                </p>
              )}
            {translationOn && languageOptions.length > 0 && (
              <ModificationRow label="Language">
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
                      {languageDisplayLabel(l.code)}
                    </option>
                  ))}
                </select>
              </ModificationRow>
            )}
            {printedAvailable && (
              <ModificationRow label="Printed version">
                <Toggle
                  size="sm"
                  checked={group.printed === true}
                  onChange={(printed) => set(group.id, { printed })}
                  label="Printed version"
                  anchor={tourAttr('assign-mods.printed')}
                />
              </ModificationRow>
            )}
            <SupportsEditor
              supports={group.supports ?? []}
              onChange={(update) => updateSupports(group.id, update)}
              onSharingChange={onSharingChange}
              keepFileIds={keepFileIds}
            />
            {group.carried && (
              <p className="py-1.5 text-xs text-slate-500">
                {summarizeOverride(group.carried, t).join(', ')}
              </p>
            )}
            {(list.length > 1 || !isBlankGroup(group)) && (
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    deleteDriveCopies(group.supports);
                    const rest = list.filter((g) => g.id !== group.id);
                    onChange(rest.length > 0 ? rest : [newModificationGroup()]);
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
