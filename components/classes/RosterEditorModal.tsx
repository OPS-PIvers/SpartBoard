import React, {
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Save, AlertTriangle, X, Plus, Users, Loader2 } from 'lucide-react';
import {
  Student,
  ClassRoster,
  RosterGroup,
  StudentOverride,
  RosterBellPeriod,
} from '@/types';
import type { BuildingBellPeriodOption } from '@/utils/bellSchedule';
import { RosterGroupsPanel } from './RosterGroupsPanel';
import { RosterAccommodationsByStudent } from './RosterAccommodationsByStudent';
import { ALL_GROUP_STEPS, type GroupEditorSteps } from '@/utils/groupReminders';
import { Modal } from '@/components/common/Modal';
import { AutosaveIndicator } from '@/components/common/EditorModalShell';
import { useAutosave } from '@/hooks/useAutosave';
import { DialogContext } from '@/context/DialogContextValue';
import { assignPins } from '@/utils/rosterPins';
import { mergeOverrideEdits } from '@/utils/rosterDefaultOverrides';
import { SegmentedControl } from '@/components/common/SegmentedControl';
import { ChecklistSelect } from '@/components/gradebook/settings/ChecklistSelect';
import { tourAttr, tourFieldAttr } from '@/config/tourAnchors';
import { useViewAs } from '@/context/useViewAs';
import { useRosterRowsState, DraftRow } from './useRosterRowsState';
import {
  RestrictionsPicker,
  RestrictionsPickerCandidate,
} from './RestrictionsPicker';

interface RosterEditorModalProps {
  isOpen: boolean;
  /** Pass `null` to create a new roster. */
  roster: ClassRoster | null;
  onClose: () => void;
  /**
   * Single write per save (M17 A4 fix). `groups` and
   * `defaultOverridesByStudentId` are included only when their tab was
   * actually edited from the roster's saved value — a plain student edit must
   * produce exactly one call, matching pre-PR behavior.
   */
  onSave: (
    name: string,
    students: Student[],
    groups?: RosterGroup[],
    defaultOverridesByStudentId?: Record<string, StudentOverride>,
    bellPeriod?: RosterBellPeriod | null
  ) => Promise<void> | void;
  /** Host-resolved 'quiz-read-aloud' gate, forwarded to the accommodations editor. */
  readAloudAvailable?: boolean;
  /** Host-resolved 'speech-to-text' gate, forwarded to the accommodations editor. */
  speechToTextAvailable?: boolean;
  /** Bell periods to tag the class with; the picker is hidden when absent. */
  bellPeriodOptions?: BuildingBellPeriodOption[];
  /** Host-resolved 'group-reminders' gate: symbols, schedules and the group wizard. */
  groupRemindersEnabled?: boolean;
  groupReminderEmailsEnabled?: boolean;
  /** Host-resolved per-step gates for the group editor. */
  groupSteps?: GroupEditorSteps;
}

const bellKey = (b: RosterBellPeriod | null | undefined): string =>
  b ? `${b.buildingId}|${b.periodId}` : '';

/**
 * Account-level roster editor. Used by the "My Classes" sidebar page.
 *
 * Row-per-student editor: each student is a directly editable row with
 * PIN, first name, last name, and delete. Bulk entry is still fast —
 * pasting multi-line text into any first-name input auto-splits into rows.
 */
export const RosterEditorModal: React.FC<RosterEditorModalProps> = ({
  isOpen,
  roster,
  onClose,
  onSave,
  readAloudAvailable = false,
  speechToTextAvailable = false,
  bellPeriodOptions,
  groupRemindersEnabled = false,
  groupReminderEmailsEnabled = false,
  groupSteps = ALL_GROUP_STEPS,
}) => {
  const { t } = useTranslation();
  const {
    name,
    setName,
    rows,
    addRow,
    updateRow,
    deleteRow,
    bulkPasteInto,
    applyAssignedPins,
    showLastNames,
    handleToggleLastNames,
    showPins,
    setShowPins,
    showEmails,
    setShowEmails,
    showRestrictions,
    setShowRestrictions,
    toggleRestriction,
    validStudents,
    duplicatePins,
  } = useRosterRowsState(roster);
  // Rows are seeded once, so a class that opened unloaded stays unsaveable even after it loads.
  const [openedUnloaded] = useState(() => !!roster?.loadError);
  const loadFailed = !!roster?.loadError || openedUnloaded;

  const columnOptions = [
    {
      id: 'lastName',
      label: t('sidebar.classes.lastName', { defaultValue: 'Last Name' }),
    },
    {
      id: 'pin',
      label: t('sidebar.classes.quizPin', { defaultValue: 'Quiz PIN' }),
    },
    {
      id: 'email',
      label: t('sidebar.classes.email', { defaultValue: 'Email' }),
    },
    {
      id: 'restrictions',
      label: t('sidebar.classes.groupRestrictions', {
        defaultValue: 'Group Restrictions',
      }),
    },
  ];
  const selectedColumns = [
    showLastNames && 'lastName',
    showPins && 'pin',
    showEmails && 'email',
    showRestrictions && 'restrictions',
  ].filter((c): c is string => !!c);
  const toggleColumn = (id: string, on: boolean) => {
    if (id === 'lastName') {
      if (on !== showLastNames) handleToggleLastNames();
    } else if (id === 'pin') setShowPins(on);
    else if (id === 'email') setShowEmails(on);
    else if (id === 'restrictions') setShowRestrictions(on);
  };

  const [activeTab, setActiveTab] = useState<
    'students' | 'groups' | 'accommodations'
  >('students');
  const initialGroups = useMemo(() => roster?.groups ?? [], [roster]);
  const [groups, setGroups] = useState<RosterGroup[]>(initialGroups);
  const initialOverrides = useMemo(
    () => roster?.defaultOverridesByStudentId ?? {},
    [roster]
  );
  const [defaultOverrides, setDefaultOverrides] =
    useState<Record<string, StudentOverride>>(initialOverrides);
  // What the overrides tab last matched in the saved class; only edits since then are written.
  const savedOverridesRef = useRef(initialOverrides);
  const latestOverridesRef = useRef(initialOverrides);
  useLayoutEffect(() => {
    latestOverridesRef.current = initialOverrides;
  }, [initialOverrides]);

  const initialBell = roster?.bellPeriod ?? null;
  const [bellPeriod, setBellPeriod] = useState<RosterBellPeriod | null>(
    initialBell
  );
  const bellChoices = useMemo(() => {
    const options = bellPeriodOptions ?? [];
    // Keep a saved tag selectable even after its building drops out of the list.
    if (
      initialBell &&
      !options.some((o) => bellKey(o) === bellKey(initialBell))
    )
      return [...options, { ...initialBell, label: initialBell.periodId }];
    return options;
  }, [bellPeriodOptions, initialBell]);

  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Count of Drive shares in flight, so Save and close wait for every one of them.
  const [sharesInFlight, setSharesInFlight] = useState(0);
  const viewAs = useViewAs();
  const dialog = useContext(DialogContext);

  const saveFailedMessage = () =>
    viewAs?.readOnly
      ? t('sidebar.classes.saveViewOnly', {
          defaultValue: 'Read-only in View as, so this class was not saved.',
        })
      : t('sidebar.classes.saveFailed', {
          defaultValue:
            'Could not save this class. Your changes are still here — check your Google Drive connection and try again.',
        });

  // One write with only the tabs that differ from the saved class.
  const writeRoster = async (rosterName: string, students: Student[]) => {
    // Drop deleted students first, as the saved copy does, so they don't read as a change.
    const ids = new Set(students.map((st) => st.id));
    const keptGroups = groups.map((g) =>
      g.studentIds.every((id) => ids.has(id))
        ? g
        : { ...g, studentIds: g.studentIds.filter((id) => ids.has(id)) }
    );
    const keptOverrides = Object.fromEntries(
      Object.entries(defaultOverrides).filter(([id]) => ids.has(id))
    );
    const groupsChanged =
      JSON.stringify(keptGroups) !== JSON.stringify(initialGroups);
    const overridesChanged =
      JSON.stringify(keptOverrides) !==
      JSON.stringify(savedOverridesRef.current);
    const mergedOverrides = mergeOverrideEdits(
      latestOverridesRef.current,
      savedOverridesRef.current,
      keptOverrides
    );
    const bellChanged = bellKey(bellPeriod) !== bellKey(initialBell);
    if (bellChanged) {
      await onSave(
        rosterName,
        students,
        groupsChanged ? keptGroups : undefined,
        overridesChanged ? mergedOverrides : undefined,
        bellPeriod
      );
    } else if (overridesChanged) {
      await onSave(
        rosterName,
        students,
        groupsChanged ? keptGroups : undefined,
        mergedOverrides
      );
    } else if (groupsChanged) {
      await onSave(rosterName, students, keptGroups);
    } else {
      await onSave(rosterName, students);
    }
    if (overridesChanged) savedOverridesRef.current = keptOverrides;
  };

  // New Class only: an existing class saves on its own below.
  const handleSave = async () => {
    if (!name.trim() || saving) return;
    setSaveError(null);
    setSaving(true);
    try {
      await writeRoster(name.trim(), validStudents);
    } catch (err) {
      // Keep the modal open with the teacher's edits intact — closing here
      // would discard them with no indication the save never landed.
      console.error('Failed to save roster:', err);
      setSaveError(saveFailedMessage());
      return;
    } finally {
      setSaving(false);
    }
    onClose();
  };

  // Autosave for an existing class. PINs are filled in here so the rows show what was saved.
  const persist = async () => {
    const sent = validStudents;
    const withPins = assignPins(sent);
    try {
      await writeRoster(name.trim() || (roster?.name ?? ''), withPins);
      setSaveError(null);
    } catch (err) {
      console.error('Failed to save roster:', err);
      setSaveError(saveFailedMessage());
      throw err;
    }
    applyAssignedPins(sent, withPins);
  };
  const persistRef = useRef(persist);
  const sharesRef = useRef(sharesInFlight);
  useLayoutEffect(() => {
    persistRef.current = persist;
    sharesRef.current = sharesInFlight;
  });

  const draftToken = useMemo(
    () => [
      name.trim(),
      JSON.stringify(validStudents),
      JSON.stringify(groups),
      JSON.stringify(defaultOverrides),
      bellKey(bellPeriod),
    ],
    [name, validStudents, groups, defaultOverrides, bellPeriod]
  );
  const autosave = useAutosave({
    draftToken,
    resetKey: roster?.id,
    // A class whose file failed to load opens empty, so saving it would wipe the real one.
    enabled: roster !== null && !loadFailed,
    delayMs: 1500,
    onSave: () => persistRef.current(),
  });

  // Waits for the last autosave before closing, and asks only if it failed.
  const requestClose = async () => {
    if (roster === null || loadFailed) {
      onClose();
      return;
    }
    // A Drive share adds its support when it finishes, so let it land first.
    const giveUpAt = Date.now() + 60_000;
    while (sharesRef.current > 0 && Date.now() < giveUpAt) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const saved = sharesRef.current === 0 && (await autosave.flush());
    if (!saved && dialog) {
      const leave = await dialog.showConfirm(
        t('sidebar.classes.closeUnsaved', {
          defaultValue:
            'Your latest changes could not be saved. Closing now will lose them.',
        }),
        {
          title: t('sidebar.classes.closeUnsavedTitle', {
            defaultValue: 'Close without saving?',
          }),
          variant: 'warning',
          confirmLabel: t('sidebar.classes.closeAnyway', {
            defaultValue: 'Close anyway',
          }),
          cancelLabel: t('sidebar.classes.keepEditing', {
            defaultValue: 'Keep editing',
          }),
        }
      );
      if (!leave) return;
    }
    onClose();
  };

  const sharingChange = (sharing: boolean) =>
    setSharesInFlight((n) => Math.max(0, n + (sharing ? 1 : -1)));

  const baseTitle = roster
    ? t('sidebar.classes.editClassTitle', { defaultValue: 'Edit Class' })
    : t('sidebar.classes.newClassTitle', { defaultValue: 'New Class' });

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => void requestClose()}
      allowFullscreen
      maxWidth="max-w-5xl"
      className="h-[85vh]"
      contentClassName="px-6 pb-6 flex flex-col"
      title={baseTitle}
    >
      <div className="flex flex-col h-full gap-3 min-h-0">
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <input
            className="flex-1 min-w-[240px] px-3 py-2 text-base border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-brand-blue-primary focus:border-brand-blue-primary font-bold"
            placeholder={t('sidebar.classes.classNamePlaceholder', {
              defaultValue: 'Class Name',
            })}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            {...tourAttr('roster-editor.name')}
          />
          {bellPeriodOptions && bellChoices.length > 0 && (
            <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
              {t('sidebar.classes.bellPeriod', {
                defaultValue: 'Bell period',
              })}
              <select
                className="px-2 py-2 text-sm border border-slate-200 rounded-xl bg-white font-semibold text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-brand-blue-primary"
                value={bellKey(bellPeriod)}
                {...tourAttr('roster-editor.bell-period')}
                onChange={(e) => {
                  const pick = bellChoices.find(
                    (o) => bellKey(o) === e.target.value
                  );
                  setBellPeriod(
                    pick
                      ? { buildingId: pick.buildingId, periodId: pick.periodId }
                      : null
                  );
                }}
              >
                <option value="">
                  {t('sidebar.classes.bellPeriodNone', {
                    defaultValue: 'Not set',
                  })}
                </option>
                {bellChoices.map((o) => (
                  <option key={bellKey(o)} value={bellKey(o)}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          {loadFailed ? (
            <div
              role="alert"
              title={roster?.loadError}
              className="min-h-[38px] flex items-center gap-1.5 px-2 text-sm font-bold text-red-600"
            >
              <AlertTriangle size={16} aria-hidden="true" />
              {t('sidebar.classes.loadFailed', {
                defaultValue: 'Failed to load',
              })}
            </div>
          ) : roster ? (
            <div
              className="min-h-[38px] flex items-center px-2"
              {...tourAttr('roster-editor.save')}
            >
              <AutosaveIndicator
                status={autosave.status === 'idle' ? 'saved' : autosave.status}
                onRetry={() => void autosave.flush({ force: true })}
              />
            </div>
          ) : (
            <button
              onClick={handleSave}
              disabled={!name.trim() || saving || sharesInFlight > 0}
              {...tourAttr('roster-editor.save')}
              className="bg-brand-blue-primary text-white px-5 py-2 rounded-xl flex gap-1.5 items-center text-sm font-bold uppercase tracking-wider hover:bg-brand-blue-dark shadow-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? (
                <Loader2
                  size={16}
                  className="animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <Save size={16} />
              )}{' '}
              {saving
                ? t('common.saving', { defaultValue: 'Saving…' })
                : t('common.save', { defaultValue: 'Save' })}
            </button>
          )}
        </div>

        {saveError && (
          <div
            role="alert"
            className="flex items-center gap-1.5 px-3 py-2 bg-red-50 border border-red-300 rounded-lg text-red-800 text-xs font-semibold shrink-0"
          >
            <AlertTriangle size={14} className="text-red-600 shrink-0" />
            {saveError}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 shrink-0">
          {roster ? (
            <SegmentedControl
              value={activeTab}
              onChange={setActiveTab}
              ariaLabel={t('sidebar.classes.editorTabsLabel', {
                defaultValue: 'Roster editor tabs',
              })}
              options={[
                {
                  value: 'students',
                  anchor: tourFieldAttr(
                    'roster-editor.tab',
                    'roster-editor',
                    'students'
                  ),
                  label: t('sidebar.classes.studentsTabCount', {
                    defaultValue: 'Students ({{count}})',
                    count: validStudents.length,
                  }),
                },
                {
                  value: 'groups',
                  anchor: tourFieldAttr(
                    'roster-editor.tab',
                    'roster-editor',
                    'groups'
                  ),
                  label: t('sidebar.classes.groupsTab', {
                    defaultValue: 'Groups ({{count}})',
                    count: groups.length,
                  }),
                },
                {
                  value: 'accommodations',
                  anchor: tourFieldAttr(
                    'roster-editor.tab',
                    'roster-editor',
                    'accommodations'
                  ),
                  label: t('sidebar.classes.accommodationsTab', {
                    defaultValue: 'Accommodations ({{count}})',
                    count: Object.keys(defaultOverrides).length,
                  }),
                },
              ]}
            />
          ) : (
            <span />
          )}
          {activeTab === 'students' && (
            <ChecklistSelect
              label={t('sidebar.classes.columns', {
                defaultValue: 'Columns',
              })}
              emptyText={t('sidebar.classes.columns', {
                defaultValue: 'Columns',
              })}
              className="w-64"
              options={columnOptions}
              anchor={tourAttr('roster-editor.columns')}
              selected={selectedColumns}
              onToggle={toggleColumn}
            />
          )}
        </div>

        {activeTab === 'groups' && roster ? (
          <RosterGroupsPanel
            groups={groups}
            students={validStudents}
            onChange={setGroups}
            overrides={defaultOverrides}
            onOverridesChange={setDefaultOverrides}
            readAloudAvailable={readAloudAvailable}
            speechToTextAvailable={speechToTextAvailable}
            onSharingChange={sharingChange}
            reminders={
              groupRemindersEnabled
                ? {
                    rosterName: name.trim(),
                    emailAlertsEnabled: groupReminderEmailsEnabled,
                    steps: groupSteps,
                  }
                : undefined
            }
          />
        ) : activeTab === 'accommodations' && roster ? (
          <RosterAccommodationsByStudent
            students={validStudents}
            groups={groups}
            overrides={defaultOverrides}
            readAloudAvailable={readAloudAvailable}
            speechToTextAvailable={speechToTextAvailable}
            onChange={setDefaultOverrides}
            onAddStudents={() => setActiveTab('students')}
            onSharingChange={sharingChange}
          />
        ) : (
          <>
            {duplicatePins.size > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-2 bg-yellow-50 border border-yellow-300 rounded-lg text-yellow-800 text-xs font-semibold shrink-0">
                <AlertTriangle size={14} className="text-yellow-600 shrink-0" />
                {t('sidebar.classes.duplicatePins', {
                  defaultValue: 'Duplicate PINs: {{pins}}',
                  pins: [...duplicatePins].join(', '),
                })}
                {!showPins && (
                  <button
                    type="button"
                    onClick={() => setShowPins(true)}
                    {...tourAttr('roster-editor.show-pins')}
                    className="ml-auto underline hover:text-yellow-900"
                  >
                    {t('sidebar.classes.showPins', {
                      defaultValue: 'Show PINs',
                    })}
                  </button>
                )}
              </div>
            )}

            <div className="flex-1 min-h-0 border border-slate-200 rounded-xl bg-white overflow-y-auto scroll-inset">
              {rows.length === 0 ? (
                <RosterEmptyState
                  title={t('sidebar.classes.emptyRosterTitle', {
                    defaultValue: 'No students yet',
                  })}
                  subtitle={t('sidebar.classes.emptyRosterSubtitle', {
                    defaultValue:
                      'Paste a list of names to add several at once.',
                  })}
                  addLabel={t('sidebar.classes.addStudent', {
                    defaultValue: 'Add Student',
                  })}
                  onAdd={addRow}
                  anchorProps={tourAttr('roster-editor.add-student')}
                />
              ) : (
                <>
                  <RosterHeader
                    showLastNames={showLastNames}
                    showPins={showPins}
                    showEmails={showEmails}
                    showRestrictions={showRestrictions}
                    firstLabel={
                      showLastNames
                        ? t('sidebar.classes.firstName', {
                            defaultValue: 'First Name',
                          })
                        : t('sidebar.classes.fullName', {
                            defaultValue: 'Name',
                          })
                    }
                    lastLabel={t('sidebar.classes.lastName', {
                      defaultValue: 'Last Name',
                    })}
                    pinLabel={t('sidebar.classes.quizPin', {
                      defaultValue: 'Quiz PIN',
                    })}
                    emailLabel={t('sidebar.classes.email', {
                      defaultValue: 'Email',
                    })}
                    restrictionsLabel={t('sidebar.classes.groupRestrictions', {
                      defaultValue: 'Group Restrictions',
                    })}
                  />
                  <ul className="flex flex-col divide-y divide-slate-100">
                    {rows.map((row, idx) => (
                      <RosterRow
                        key={row.id}
                        row={row}
                        index={idx}
                        showLastNames={showLastNames}
                        showPins={showPins}
                        showEmails={showEmails}
                        showRestrictions={showRestrictions}
                        allRows={rows}
                        isDuplicatePin={
                          !!row.pin.trim() && duplicatePins.has(row.pin.trim())
                        }
                        firstNamePlaceholder={
                          showLastNames
                            ? t('sidebar.classes.firstNamePlaceholder', {
                                defaultValue: 'First name',
                              })
                            : t('sidebar.classes.fullNamePlaceholder', {
                                defaultValue: 'Full name',
                              })
                        }
                        lastNamePlaceholder={t(
                          'sidebar.classes.lastNamePlaceholder',
                          { defaultValue: 'Last name' }
                        )}
                        pinPlaceholder={t('sidebar.classes.pinPlaceholder', {
                          defaultValue: '01',
                        })}
                        emailPlaceholder={t(
                          'sidebar.classes.emailPlaceholder',
                          {
                            defaultValue: 'student@school.org',
                          }
                        )}
                        removeLabel={t('sidebar.classes.removeStudent', {
                          defaultValue: 'Remove student',
                        })}
                        onChange={(patch) => updateRow(row.id, patch)}
                        onDelete={() => deleteRow(row.id)}
                        onBulkPaste={(text) =>
                          bulkPasteInto(row.id, text, showLastNames)
                        }
                        onToggleRestriction={(otherId) =>
                          toggleRestriction(row.id, otherId)
                        }
                      />
                    ))}
                  </ul>
                  <div className="p-3 sticky bottom-0 bg-slate-50/80 backdrop-blur-xs border-t border-slate-200">
                    <button
                      onClick={addRow}
                      {...tourAttr('roster-editor.add-student')}
                      className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-bold text-brand-blue-primary bg-white border border-dashed border-slate-300 rounded-lg hover:border-brand-blue-primary hover:bg-brand-blue-lighter transition-colors"
                    >
                      <Plus size={16} />
                      {t('sidebar.classes.addStudent', {
                        defaultValue: 'Add Student',
                      })}
                    </button>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
};

interface RosterHeaderProps {
  showLastNames: boolean;
  showPins: boolean;
  showEmails: boolean;
  showRestrictions: boolean;
  firstLabel: string;
  lastLabel: string;
  pinLabel: string;
  emailLabel: string;
  restrictionsLabel: string;
}

const RosterHeader: React.FC<RosterHeaderProps> = ({
  showLastNames,
  showPins,
  showEmails,
  showRestrictions,
  firstLabel,
  lastLabel,
  pinLabel,
  emailLabel,
  restrictionsLabel,
}) => {
  return (
    <div
      className="hidden md:grid items-center gap-3 px-4 py-2 bg-white border-b border-slate-200 text-xxs font-bold text-slate-500 uppercase tracking-widest sticky top-0 z-10"
      style={{
        gridTemplateColumns: buildGridTemplate(
          showLastNames,
          showPins,
          showEmails,
          showRestrictions
        ),
      }}
    >
      <span className="text-right pr-1">#</span>
      {showPins && <span>{pinLabel}</span>}
      <span>{firstLabel}</span>
      {showLastNames && <span>{lastLabel}</span>}
      {showEmails && <span>{emailLabel}</span>}
      {showRestrictions && <span>{restrictionsLabel}</span>}
      <span />
    </div>
  );
};

interface RosterRowProps {
  row: DraftRow;
  index: number;
  showLastNames: boolean;
  showPins: boolean;
  showEmails: boolean;
  showRestrictions: boolean;
  allRows: DraftRow[];
  isDuplicatePin: boolean;
  firstNamePlaceholder: string;
  lastNamePlaceholder: string;
  pinPlaceholder: string;
  emailPlaceholder: string;
  removeLabel: string;
  onChange: (patch: Partial<DraftRow>) => void;
  onDelete: () => void;
  onBulkPaste: (text: string) => void;
  onToggleRestriction: (otherId: string) => void;
}

const RosterRow: React.FC<RosterRowProps> = ({
  row,
  index,
  showLastNames,
  showPins,
  showEmails,
  showRestrictions,
  allRows,
  isDuplicatePin,
  firstNamePlaceholder,
  lastNamePlaceholder,
  pinPlaceholder,
  emailPlaceholder,
  removeLabel,
  onChange,
  onDelete,
  onBulkPaste,
  onToggleRestriction,
}) => {
  const handleFirstNamePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text');
    if (text.includes('\n')) {
      e.preventDefault();
      onBulkPaste(text);
    }
  };

  const candidates = useMemo<RestrictionsPickerCandidate[]>(() => {
    const idToIndex = new Map(allRows.map((r, i) => [r.id, i + 1]));
    return allRows
      .filter((r) => r.id !== row.id)
      .map((r) => ({
        id: r.id,
        label:
          `${r.firstName} ${r.lastName}`.trim() ||
          `(unnamed #${idToIndex.get(r.id)})`,
      }))
      .filter((c) => c.label.length > 0);
  }, [allRows, row.id]);

  return (
    <li
      className="grid items-center gap-3 px-4 py-1.5 hover:bg-slate-50 transition-colors"
      {...tourFieldAttr(
        'roster-editor.row',
        'roster-editor',
        `row-${index + 1}`
      )}
      style={{
        gridTemplateColumns: buildGridTemplate(
          showLastNames,
          showPins,
          showEmails,
          showRestrictions
        ),
      }}
    >
      <span className="text-xs text-slate-400 font-mono text-right pr-1">
        {index + 1}
      </span>
      {showPins && (
        <input
          className={`px-2 py-1.5 text-sm font-mono text-center rounded-md border outline-hidden focus:ring-2 focus:ring-brand-blue-primary/20 transition-colors ${
            isDuplicatePin
              ? 'border-yellow-400 bg-yellow-50 focus:border-yellow-500'
              : 'border-slate-200 bg-white focus:border-brand-blue-primary'
          }`}
          value={row.pin}
          onChange={(e) => onChange({ pin: e.target.value })}
          {...tourFieldAttr(
            'roster-editor.pin',
            'roster-editor',
            `row-${index + 1}`
          )}
          placeholder={pinPlaceholder}
          maxLength={6}
          inputMode="numeric"
        />
      )}
      <input
        className="px-2 py-1.5 text-sm rounded-md border border-transparent bg-transparent hover:border-slate-200 focus:bg-white outline-hidden focus:border-brand-blue-primary focus:ring-2 focus:ring-brand-blue-primary/20 transition-colors"
        value={row.firstName}
        onChange={(e) => onChange({ firstName: e.target.value })}
        onPaste={handleFirstNamePaste}
        {...tourFieldAttr(
          'roster-editor.first-name',
          'roster-editor',
          `row-${index + 1}`
        )}
        placeholder={firstNamePlaceholder}
      />
      {showLastNames && (
        <input
          className="px-2 py-1.5 text-sm rounded-md border border-transparent bg-transparent hover:border-slate-200 focus:bg-white outline-hidden focus:border-brand-blue-primary focus:ring-2 focus:ring-brand-blue-primary/20 transition-colors"
          value={row.lastName}
          onChange={(e) => onChange({ lastName: e.target.value })}
          {...tourFieldAttr(
            'roster-editor.last-name',
            'roster-editor',
            `row-${index + 1}`
          )}
          placeholder={lastNamePlaceholder}
        />
      )}
      {showEmails && (
        <input
          type="email"
          className="px-2 py-1.5 text-sm rounded-md border border-transparent bg-transparent hover:border-slate-200 focus:bg-white outline-hidden focus:border-brand-blue-primary focus:ring-2 focus:ring-brand-blue-primary/20 transition-colors"
          value={row.email ?? ''}
          onChange={(e) => onChange({ email: e.target.value })}
          {...tourFieldAttr(
            'roster-editor.email',
            'roster-editor',
            `row-${index + 1}`
          )}
          placeholder={emailPlaceholder}
          autoComplete="off"
          spellCheck={false}
        />
      )}
      {showRestrictions && (
        <RestrictionsPicker
          candidates={candidates}
          selectedIds={row.restrictedStudentIds ?? []}
          onToggle={onToggleRestriction}
        />
      )}
      <button
        onClick={onDelete}
        aria-label={removeLabel}
        title={removeLabel}
        {...tourFieldAttr(
          'roster-editor.remove-student',
          'roster-editor',
          `row-${index + 1}`
        )}
        className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors justify-self-end"
      >
        <X size={16} />
      </button>
    </li>
  );
};

interface RosterEmptyStateProps {
  title: string;
  subtitle: string;
  addLabel: string;
  onAdd: () => void;
  anchorProps?: Record<string, string>;
}

const RosterEmptyState: React.FC<RosterEmptyStateProps> = ({
  title,
  subtitle,
  addLabel,
  onAdd,
  anchorProps,
}) => (
  <div className="flex flex-col items-center justify-center h-full w-full text-center px-6 py-10 gap-3 select-none">
    <div className="p-3 bg-slate-100 rounded-full text-slate-400">
      <Users size={32} />
    </div>
    <div className="flex flex-col gap-1">
      <p className="font-black uppercase tracking-widest text-slate-500 text-sm">
        {title}
      </p>
      <p className="text-xs text-slate-400 max-w-xs">{subtitle}</p>
    </div>
    <button
      onClick={onAdd}
      {...anchorProps}
      className="mt-2 flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-white bg-brand-blue-primary rounded-lg hover:bg-brand-blue-dark transition-colors"
    >
      <Plus size={16} /> {addLabel}
    </button>
  </div>
);

/**
 * Grid columns: [#] [PIN?] [First] [Last?] [Email?] [Restrictions?] [Delete]
 */
function buildGridTemplate(
  showLastNames: boolean,
  showPins: boolean,
  showEmails: boolean,
  showRestrictions: boolean
): string {
  const parts = ['2rem'];
  if (showPins) parts.push('5rem');
  parts.push('minmax(5rem, 1fr)');
  if (showLastNames) parts.push('minmax(5rem, 1fr)');
  if (showEmails) parts.push('minmax(0, 1.4fr)');
  // Shrinks to its icon on a phone so the name columns keep their width.
  if (showRestrictions) parts.push('minmax(3.5rem, 14rem)');
  parts.push('2rem');
  return parts.join(' ');
}
