import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, SlidersHorizontal } from 'lucide-react';
import type { Rubric, StudentOverride, StudentTargetRef } from '@/types';
import {
  effectiveClassOverride,
  studentTargetRefKey,
  type AssignTargetingValue,
  type ClassStudentRow,
} from '@/utils/studentTargetRef';
import {
  isNonEnglishQuizSource,
  uncoveredLocalesForTargets,
} from '@/utils/quizTranslationAdvisory';
import { languageNativeLabel } from '@/utils/languageNativeLabel';
import { scaledFont } from '../assignWindowUtils';
import { Toggle } from '@/components/common/Toggle';
import {
  OverrideEditorRow,
  type OverrideEditorPeer,
  type OverrideEditorQuestion,
} from '../OverrideEditorRow';
import type { AssignTranslationContext } from '../AssignStudentPicker';
import {
  clearedModifications,
  countModifications,
  countUnresolvableStudents,
  effectiveRosterIdsFor,
  formatModificationsValue,
  modificationRows,
  skippedInScope,
  type ModificationsScope,
} from './ModificationsView.helpers';
import { tourAttr, tourFieldAttr } from '@/config/tourAnchors';

export interface ModificationsQuizContext {
  questions: OverrideEditorQuestion[];
  rubrics: Rubric[];
  /** Drives the translation coverage advisory; absent = no advisory. */
  translation?: AssignTranslationContext;
}

export interface ModificationsListProps extends ModificationsScope {
  value: AssignTargetingValue;
  onChange: (next: AssignTargetingValue) => void;
  /** Quiz rows add question subset, MC hider and rubric swap. */
  quizMode: boolean;
  quizContext?: ModificationsQuizContext;
  readAloudAvailable?: boolean;
  /** False when the host has no class picker, changing the empty-state copy. */
  canPickClasses?: boolean;
  /** Sizes text with `cqmin` for the one consumer inside a container-query face. */
  cqScaled?: boolean;
  /** Controlled "Show N more", so the choice outlives a collapse; uncontrolled when omitted. */
  showAll?: boolean;
  onShowAllChange?: (next: boolean) => void;
  /** 'view' sizes text for the stepper's full Modifications view. */
  variant?: 'inline' | 'view';
}

/** One student row: skip toggle + the shared override editor. */
const StudentModificationRow: React.FC<{
  row: ClassStudentRow;
  override: StudentOverride;
  hasStanding: boolean;
  skipped: boolean;
  onOverrideChange: (next: StudentOverride) => void;
  onSkipChange: (skipped: boolean) => void;
  quizMode: boolean;
  readAloudAvailable: boolean;
  questions: OverrideEditorQuestion[];
  rubrics: Rubric[];
  peers: OverrideEditorPeer[];
  cqScaled?: boolean;
}> = ({
  row,
  override,
  hasStanding,
  skipped,
  onOverrideChange,
  onSkipChange,
  quizMode,
  readAloudAvailable,
  questions,
  rubrics,
  peers,
  cqScaled,
}) => {
  const { t } = useTranslation();
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        {hasStanding && (
          <span
            className={
              cqScaled
                ? 'rounded-full bg-brand-blue-lighter px-2 py-0.5 font-bold uppercase tracking-wider text-brand-blue-dark'
                : 'rounded-full bg-brand-blue-lighter px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand-blue-dark'
            }
            style={scaledFont(cqScaled, 10, 4)}
          >
            {t('assignTargeting.standingBadge', 'Standing')}
          </span>
        )}
        <label
          className={
            cqScaled
              ? 'ml-auto flex items-center gap-1.5 font-medium text-slate-600'
              : 'ml-auto flex items-center gap-1.5 text-xs font-medium text-slate-600'
          }
          style={scaledFont(cqScaled, 12, 4.5)}
        >
          <input
            type="checkbox"
            checked={skipped}
            aria-label={t('assignTargeting.skipStudentNamed', 'Skip {{name}}', {
              name: row.name,
            })}
            onChange={(e) => onSkipChange(e.target.checked)}
            {...tourFieldAttr('assign-mods.skip-student', 'assign', row.key)}
          />
          {t('assignTargeting.skipStudent', 'Skip this student')}
        </label>
      </div>
      <div className={skipped ? 'opacity-50 pointer-events-none' : undefined}>
        <OverrideEditorRow
          studentName={row.name}
          override={override}
          onChange={onOverrideChange}
          quizMode={quizMode}
          readAloudAvailable={readAloudAvailable}
          questions={questions}
          rubrics={rubrics}
          peers={peers}
        />
      </div>
    </div>
  );
};

/** Per-student modifications for the checked classes: translation banner, skip, read aloud, language and the rest. */
export const ModificationsList: React.FC<ModificationsListProps> = ({
  rosters,
  selectedRosterIds,
  useRosterDefaults = true,
  value,
  onChange,
  quizMode,
  quizContext,
  readAloudAvailable = false,
  canPickClasses = true,
  cqScaled = false,
  showAll: showAllProp,
  onShowAllChange,
  variant = 'inline',
}) => {
  const roomy = variant === 'view';
  const { t } = useTranslation();
  const [showAllState, setShowAllState] = useState(false);
  const showAll = showAllProp ?? showAllState;
  const setShowAll = onShowAllChange ?? setShowAllState;

  const classRows = useMemo(
    () => modificationRows({ rosters, selectedRosterIds, useRosterDefaults }),
    [rosters, selectedRosterIds, useRosterDefaults]
  );
  const anyClassChecked =
    effectiveRosterIdsFor({ rosters, selectedRosterIds }).length > 0;
  const unresolvableCount = useMemo(
    () => countUnresolvableStudents({ rosters, selectedRosterIds }),
    [rosters, selectedRosterIds]
  );
  const excludedInScope = useMemo(
    () => skippedInScope(value.excludedStudents, classRows),
    [value.excludedStudents, classRows]
  );
  const excludedKeys = useMemo(
    () => new Set(excludedInScope.map(studentTargetRefKey)),
    [excludedInScope]
  );

  // Rows the teacher has a reason to see first: a standing roster
  // accommodation, an edit made here, or a skip. Everything else collapses.
  const isPromoted = (row: ClassStudentRow) =>
    !!row.defaultOverride ||
    !!value.overridesByKey[row.key] ||
    excludedKeys.has(row.key);
  const promotedRows = classRows.filter(isPromoted);
  const remainingRows = classRows.filter((row) => !isPromoted(row));
  const visibleRows = showAll
    ? [...promotedRows, ...remainingRows]
    : promotedRows;

  // Grouped by class so a multi-class assign never mixes two sections into one
  // undifferentiated list; last name orders each section.
  const groupedRows = new Map<string, ClassStudentRow[]>();
  for (const row of visibleRows) {
    const existing = groupedRows.get(row.rosterName);
    if (existing) existing.push(row);
    else groupedRows.set(row.rosterName, [row]);
  }
  const visibleGroups = [...groupedRows.entries()].map(
    ([rosterName, groupRows]) => ({
      rosterName,
      rows: [...groupRows].sort(
        (a, b) =>
          a.lastName.localeCompare(b.lastName) || a.name.localeCompare(b.name)
      ),
    })
  );
  const multiClass = visibleGroups.length > 1;

  // The view lists promoted rows plus any the teacher added, by last name;
  // everyone else is in "Add a student".
  const [addedKeys, setAddedKeys] = useState<string[]>([]);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const byLastName = (a: ClassStudentRow, b: ClassStudentRow) =>
    a.lastName.localeCompare(b.lastName) || a.name.localeCompare(b.name);
  const viewRows = classRows
    .filter((row) => isPromoted(row) || addedKeys.includes(row.key))
    .sort(byLastName);
  const addableRows = classRows
    .filter((row) => !isPromoted(row) && !addedKeys.includes(row.key))
    .sort(byLastName);
  const addableGroups = [
    ...addableRows
      .reduce((groups, row) => {
        groups.set(row.rosterName, [
          ...(groups.get(row.rosterName) ?? []),
          row,
        ]);
        return groups;
      }, new Map<string, ClassStudentRow[]>())
      .entries(),
  ].map(([rosterName, rows]) => ({ rosterName, rows }));

  const translationAdvisory = useMemo(() => {
    const translation = quizContext?.translation;
    if (!translation) return [];
    return uncoveredLocalesForTargets(
      classRows
        .filter((row) => !excludedKeys.has(row.key))
        .map((row) => ({
          name: row.name,
          language: effectiveClassOverride(row, value.overridesByKey)?.language,
        })),
      translation
    );
  }, [classRows, excludedKeys, quizContext?.translation, value.overridesByKey]);

  const patch = (next: Partial<AssignTargetingValue>) =>
    onChange({ ...value, ...next });

  const setOverrideForKey = (key: string, override: StudentOverride) =>
    patch({ overridesByKey: { ...value.overridesByKey, [key]: override } });

  const setSkipped = (ref: StudentTargetRef, skipped: boolean) => {
    const key = studentTargetRefKey(ref);
    patch({
      excludedStudents: skipped
        ? [...(value.excludedStudents ?? []), ref]
        : (value.excludedStudents ?? []).filter(
            (r) => studentTargetRefKey(r) !== key
          ),
    });
  };

  const addStudent = (key: string) => {
    if (!key) return;
    setAddedKeys([...addedKeys, key]);
    setOpenKey(key);
  };

  // An explicit empty override hides a standing accommodation for this assignment only.
  const removeModification = (row: ClassStudentRow) => {
    const overridesByKey = { ...value.overridesByKey };
    if (row.defaultOverride) overridesByKey[row.key] = {};
    else delete overridesByKey[row.key];
    onChange({
      ...value,
      overridesByKey,
      excludedStudents: (value.excludedStudents ?? []).filter(
        (ref) => studentTargetRefKey(ref) !== row.key
      ),
    });
    setAddedKeys(addedKeys.filter((key) => key !== row.key));
    setOpenKey(null);
  };

  const nonEnglishSource = isNonEnglishQuizSource(
    quizContext?.translation?.sourceLanguage
  );
  const translationGenerateDisabled =
    nonEnglishSource ||
    quizContext?.translation?.hasBankSlots === true ||
    (quizContext?.translation?.cap?.remaining ?? 1) <= 0 ||
    !!quizContext?.translation?.generating;

  return (
    <>
      {translationAdvisory.length > 0 && (
        <div className="space-y-1.5">
          {translationAdvisory.map((entry) => (
            <div
              key={entry.locale}
              role="status"
              className={
                roomy
                  ? 'flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800'
                  : cqScaled
                    ? 'flex items-center gap-2 text-amber-700 bg-amber-500/10 border border-amber-500/30 rounded-lg px-2.5 py-1.5'
                    : 'flex items-center gap-2 text-xxs text-amber-700 bg-amber-500/10 border border-amber-500/30 rounded-lg px-2.5 py-1.5'
              }
              style={scaledFont(cqScaled, 10, 4)}
            >
              <span className="flex-1">
                {t('quizTranslation.assign.advisory.missing', {
                  count: entry.names.length,
                  others: entry.names.length - 1,
                  name: entry.names[0],
                  language: languageNativeLabel(entry.locale),
                })}
              </span>
              {quizContext?.translation?.onGenerate && (
                <button
                  type="button"
                  disabled={translationGenerateDisabled}
                  onClick={() =>
                    quizContext.translation?.onGenerate?.([entry.locale])
                  }
                  {...tourFieldAttr(
                    'assign-mods.generate-translation',
                    'assign',
                    entry.locale
                  )}
                  className={
                    roomy
                      ? 'shrink-0 rounded-md border border-amber-300 bg-white px-2.5 py-1 font-bold text-amber-800 hover:bg-amber-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400'
                      : 'shrink-0 rounded-md border border-amber-500/50 px-2 py-0.5 font-bold text-amber-700 hover:bg-amber-500/10 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400'
                  }
                >
                  {t('quizTranslation.assign.generate')}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {unresolvableCount > 0 && (
        <p
          className={
            roomy
              ? 'text-sm text-slate-600'
              : cqScaled
                ? 'text-slate-500'
                : 'text-xs text-slate-500'
          }
          style={scaledFont(cqScaled, 12, 4.5)}
        >
          {t(
            'assignTargeting.noSignInCount',
            '{{count}} students have no school sign-in and can’t be changed individually.',
            { count: unresolvableCount }
          )}
        </p>
      )}

      {classRows.length === 0 ? (
        <p
          className={
            roomy
              ? 'text-sm text-slate-600'
              : cqScaled
                ? 'text-slate-500'
                : 'text-xs text-slate-500'
          }
          style={scaledFont(cqScaled, 12, 4.5)}
        >
          {anyClassChecked
            ? t(
                'assignTargeting.noSignInStudents',
                'No one in the checked classes has a school sign-in, so there is nobody to modify individually.'
              )
            : canPickClasses
              ? t(
                  'assignTargeting.noClassStudents',
                  'Check a class above to modify individual students.'
                )
              : t(
                  'assignTargeting.noLinkedClass',
                  'This assignment is not linked to a class you can modify here.'
                )}
        </p>
      ) : roomy ? (
        <>
          {viewRows.length > 0 && (
            <div className="text-xxs font-bold uppercase tracking-widest text-brand-blue-primary/60">
              {t('assignTargeting.standingHeading', 'Standing')}
            </div>
          )}
          <div className="space-y-2">
            {viewRows.map((row) => (
              <OverrideEditorRow
                key={row.key}
                appearance="card"
                studentName={row.name}
                override={
                  value.overridesByKey[row.key] ?? row.defaultOverride ?? {}
                }
                onChange={(next) => setOverrideForKey(row.key, next)}
                extraChips={
                  excludedKeys.has(row.key)
                    ? [t('assignTargeting.skippedChip', 'Skipped')]
                    : []
                }
                expanded={openKey === row.key}
                onExpandedChange={(next) => setOpenKey(next ? row.key : null)}
                quizMode={quizMode}
                readAloudAvailable={readAloudAvailable}
                questions={quizContext?.questions ?? []}
                rubrics={quizContext?.rubrics ?? []}
                peers={viewRows
                  .filter((peer) => peer.key !== row.key)
                  .map((peer) => ({
                    id: peer.key,
                    name: peer.name,
                    override:
                      value.overridesByKey[peer.key] ??
                      peer.defaultOverride ??
                      {},
                  }))}
                footer={
                  <>
                    <div className="flex min-h-[2rem] items-center justify-between gap-3">
                      <span className="text-sm font-medium text-slate-700">
                        {t('assignTargeting.skipStudent', 'Skip this student')}
                      </span>
                      <Toggle
                        size="sm"
                        checked={excludedKeys.has(row.key)}
                        onChange={(checked) => setSkipped(row.ref, checked)}
                        anchor={tourFieldAttr(
                          'assign-mods.skip-student',
                          'assign',
                          row.key
                        )}
                        label={t(
                          'assignTargeting.skipStudentNamed',
                          'Skip {{name}}',
                          { name: row.name }
                        )}
                      />
                    </div>
                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() => removeModification(row)}
                        {...tourFieldAttr(
                          'assign-mods.remove',
                          'assign',
                          row.key
                        )}
                        className="text-xs font-bold text-brand-red-primary hover:underline"
                      >
                        {t(
                          'assignTargeting.removeModification',
                          'Remove modification'
                        )}
                      </button>
                    </div>
                  </>
                }
              />
            ))}
          </div>
          {addableRows.length > 0 && (
            <select
              value=""
              onChange={(e) => addStudent(e.target.value)}
              {...tourAttr('assign-mods.add-student')}
              aria-label={t('assignTargeting.addStudent', 'Add a student')}
              className="h-9 w-48 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 focus:border-brand-blue-primary focus:outline-none"
            >
              <option value="">
                {t('assignTargeting.addStudent', 'Add a student')}
              </option>
              {addableGroups.length > 1
                ? addableGroups.map((group) => (
                    <optgroup key={group.rosterName} label={group.rosterName}>
                      {group.rows.map((row) => (
                        <option key={row.key} value={row.key}>
                          {row.name}
                        </option>
                      ))}
                    </optgroup>
                  ))
                : addableRows.map((row) => (
                    <option key={row.key} value={row.key}>
                      {row.name}
                    </option>
                  ))}
            </select>
          )}
        </>
      ) : (
        <>
          {excludedInScope.length > 0 && (
            <p
              role="status"
              className={
                roomy
                  ? 'rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800'
                  : cqScaled
                    ? 'rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-amber-700'
                    : 'rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-xxs text-amber-700'
              }
              style={scaledFont(cqScaled, 10, 4)}
            >
              {t(
                'assignTargeting.skipNotice',
                'Skipped students won’t see this assignment.'
              )}
            </p>
          )}
          <div className="space-y-3">
            {visibleGroups.map((group) => (
              <div key={group.rosterName} className="space-y-2">
                {multiClass && (
                  <p
                    className={
                      roomy
                        ? 'text-xxs font-bold uppercase tracking-widest text-brand-blue-primary/60'
                        : cqScaled
                          ? 'font-bold uppercase tracking-wider text-slate-500'
                          : 'text-xxs font-bold uppercase tracking-wider text-slate-500'
                    }
                    style={scaledFont(cqScaled, 10, 4)}
                  >
                    {group.rosterName}
                  </p>
                )}
                {group.rows.map((row) => (
                  <StudentModificationRow
                    key={row.key}
                    row={row}
                    override={
                      value.overridesByKey[row.key] ?? row.defaultOverride ?? {}
                    }
                    hasStanding={!!row.defaultOverride}
                    skipped={excludedKeys.has(row.key)}
                    onOverrideChange={(next) =>
                      setOverrideForKey(row.key, next)
                    }
                    onSkipChange={(skipped) => setSkipped(row.ref, skipped)}
                    quizMode={quizMode}
                    readAloudAvailable={readAloudAvailable}
                    questions={quizContext?.questions ?? []}
                    rubrics={quizContext?.rubrics ?? []}
                    peers={visibleRows
                      .filter((peer) => peer.key !== row.key)
                      .map((peer) => ({
                        id: peer.key,
                        name: peer.name,
                        override:
                          value.overridesByKey[peer.key] ??
                          peer.defaultOverride ??
                          {},
                      }))}
                    cqScaled={cqScaled}
                  />
                ))}
              </div>
            ))}
          </div>
          {remainingRows.length > 0 && (
            <button
              type="button"
              onClick={() => setShowAll(!showAll)}
              {...tourAttr('assign-mods.show-all')}
              className={
                cqScaled
                  ? 'font-semibold text-brand-blue-dark hover:text-brand-blue-primary transition-colors'
                  : 'text-xs font-semibold text-brand-blue-dark hover:text-brand-blue-primary transition-colors'
              }
              style={scaledFont(cqScaled, 12, 4.5)}
            >
              {showAll
                ? t('assignTargeting.showFewer', 'Show fewer')
                : t('assignTargeting.showMore', 'Show {{count}} more', {
                    count: remainingRows.length,
                  })}
            </button>
          )}
        </>
      )}
    </>
  );
};

export interface ModificationsViewProps extends Omit<
  ModificationsListProps,
  'cqScaled'
> {
  /** The activity's title, shown above "Modifications". */
  activityTitle: string;
  /** Back arrow and Done both return to the steps. */
  onBack: () => void;
}

/** The stepper's Modifications view: fills the dialog in place of the steps. */
export const ModificationsView: React.FC<ModificationsViewProps> = ({
  activityTitle,
  onBack,
  ...listProps
}) => {
  const { t } = useTranslation();
  const { value, onChange } = listProps;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-200 px-6 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            {...tourAttr('assign-mods.back')}
            aria-label={t('assignTargeting.back', 'Back')}
            className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          <div className="min-w-0">
            <div className="truncate text-xxs font-bold uppercase tracking-widest text-brand-blue-primary/60">
              {t('assignTargeting.modificationsEyebrow', 'Assign · {{title}}', {
                title: activityTitle,
              })}
            </div>
            <h2 className="truncate text-lg font-black text-slate-800">
              {t('assignTargeting.modificationsLabel', 'Modifications')}
            </h2>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onChange(clearedModifications(value))}
          {...tourAttr('assign-mods.clear')}
          className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-bold text-slate-500 transition-colors hover:text-slate-700"
        >
          {t('assignTargeting.clearModifications', 'Clear all modifications')}
        </button>
      </div>
      <div className="custom-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
        <ModificationsList {...listProps} variant="view" />
      </div>
      <div className="flex shrink-0 items-center justify-end border-t border-slate-200 bg-white px-6 py-3">
        <button
          type="button"
          onClick={onBack}
          {...tourAttr('assign-mods.done')}
          className="inline-flex items-center gap-1.5 rounded-xl bg-brand-blue-primary px-5 py-2 text-sm font-bold text-white shadow-sm transition-colors hover:bg-brand-blue-dark"
        >
          {t('assignTargeting.collapse', 'Done')}
        </button>
      </div>
    </div>
  );
};

export interface ModificationsLinkProps extends ModificationsScope {
  value: Pick<AssignTargetingValue, 'overridesByKey' | 'excludedStudents'>;
  onOpen: () => void;
}

/** "Modifications: 1 modified" under the class picker; opens the view. */
export const ModificationsLink: React.FC<ModificationsLinkProps> = ({
  value,
  onOpen,
  ...scope
}) => {
  const { t } = useTranslation();
  const { rosters, selectedRosterIds, useRosterDefaults } = scope;
  const summary = useMemo(
    () =>
      formatModificationsValue(
        countModifications(
          modificationRows({ rosters, selectedRosterIds, useRosterDefaults }),
          value
        ),
        t
      ),
    [rosters, selectedRosterIds, useRosterDefaults, value, t]
  );
  return (
    <button
      type="button"
      onClick={onOpen}
      {...tourAttr('assign-mods.open')}
      className="inline-flex items-center gap-1.5 rounded-lg px-1 py-1 text-xs font-bold text-brand-blue-primary transition-colors hover:bg-brand-blue-lighter/40"
    >
      <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
      {t('assignTargeting.modificationsLink', 'Modifications: {{value}}', {
        value: summary.toLocaleLowerCase(),
      })}
    </button>
  );
};
