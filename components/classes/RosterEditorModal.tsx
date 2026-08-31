import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Save, AlertTriangle, X, Plus, Users, UsersRound } from 'lucide-react';
import { Student, ClassRoster, RosterGroup } from '@/types';
import { Modal } from '@/components/common/Modal';
import { SegmentedControl } from '@/components/common/SegmentedControl';
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
   * Single write per save (M17 A4 fix). `groups` is included only when the
   * groups tab was actually edited from the roster's saved value — a plain
   * student edit must produce exactly one call, matching pre-PR behavior.
   */
  onSave: (
    name: string,
    students: Student[],
    groups?: RosterGroup[]
  ) => Promise<void> | void;
}

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

  const [activeTab, setActiveTab] = useState<'students' | 'groups'>('students');
  const initialGroups = useMemo(() => roster?.groups ?? [], [roster]);
  const [groups, setGroups] = useState<RosterGroup[]>(initialGroups);

  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim() || saving) return;
    const groupsChanged =
      JSON.stringify(groups) !== JSON.stringify(initialGroups);
    setSaveError(null);
    setSaving(true);
    try {
      if (groupsChanged) {
        await onSave(name.trim(), validStudents, groups);
      } else {
        await onSave(name.trim(), validStudents);
      }
    } catch (err) {
      // Keep the modal open with the teacher's edits intact — closing here
      // would discard them with no indication the save never landed.
      console.error('Failed to save roster:', err);
      setSaveError(
        t('sidebar.classes.saveFailed', {
          defaultValue:
            'Could not save this class. Your changes are still here — check your Google Drive connection and try again.',
        })
      );
      return;
    } finally {
      setSaving(false);
    }
    onClose();
  };

  const baseTitle = roster
    ? t('sidebar.classes.editClassTitle', { defaultValue: 'Edit Class' })
    : t('sidebar.classes.newClassTitle', { defaultValue: 'New Class' });

  const countLabel = t('sidebar.classes.studentCount', {
    count: validStudents.length,
    defaultValue: '{{count}} Student',
    defaultValue_other: '{{count}} Students',
  });

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="max-w-5xl"
      className="h-[85vh]"
      contentClassName="px-6 pb-6 flex flex-col"
      title={`${baseTitle} — ${countLabel}`}
    >
      <div className="flex flex-col h-full gap-3 min-h-0">
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <input
            className="flex-1 min-w-[240px] px-3 py-2 text-base border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-blue-primary focus:border-brand-blue-primary font-bold"
            placeholder={t('sidebar.classes.classNamePlaceholder', {
              defaultValue: 'Class Name',
            })}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          <button
            onClick={handleSave}
            disabled={!name.trim() || saving}
            className="bg-brand-blue-primary text-white px-5 py-2 rounded-xl flex gap-1.5 items-center text-sm font-bold uppercase tracking-wider hover:bg-brand-blue-dark shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save size={16} /> {t('common.save', { defaultValue: 'Save' })}
          </button>
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

        {roster && (
          <div className="shrink-0">
            <SegmentedControl
              value={activeTab}
              onChange={setActiveTab}
              ariaLabel={t('sidebar.classes.editorTabsLabel', {
                defaultValue: 'Roster editor tabs',
              })}
              options={[
                {
                  value: 'students',
                  label: t('sidebar.classes.studentsTab', {
                    defaultValue: 'Students',
                  }),
                },
                {
                  value: 'groups',
                  label: t('sidebar.classes.groupsTab', {
                    defaultValue: 'Groups ({{count}})',
                    count: groups.length,
                  }),
                },
              ]}
            />
          </div>
        )}

        {activeTab === 'groups' && roster ? (
          <RosterGroupsPanel
            groups={groups}
            students={validStudents}
            onChange={setGroups}
          />
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3">
                <button
                  onClick={handleToggleLastNames}
                  className={`text-xs font-black uppercase tracking-wider transition-colors ${
                    showLastNames
                      ? 'text-blue-600 hover:text-blue-700'
                      : 'text-slate-400 hover:text-slate-500'
                  }`}
                >
                  {showLastNames
                    ? t('sidebar.classes.hideLastName', {
                        defaultValue: '− Last Name',
                      })
                    : t('sidebar.classes.addLastName', {
                        defaultValue: '+ Last Name',
                      })}
                </button>
                <button
                  onClick={() => setShowPins((v) => !v)}
                  className={`text-xs font-black uppercase tracking-wider transition-colors ${
                    showPins
                      ? 'text-violet-600 hover:text-violet-700'
                      : 'text-slate-400 hover:text-slate-500'
                  }`}
                >
                  {showPins
                    ? t('sidebar.classes.hideQuizPin', {
                        defaultValue: '− Quiz PIN',
                      })
                    : t('sidebar.classes.addQuizPin', {
                        defaultValue: '+ Quiz PIN',
                      })}
                </button>
                <button
                  onClick={() => setShowEmails((v) => !v)}
                  className={`text-xs font-black uppercase tracking-wider transition-colors ${
                    showEmails
                      ? 'text-emerald-600 hover:text-emerald-700'
                      : 'text-slate-400 hover:text-slate-500'
                  }`}
                >
                  {showEmails
                    ? t('sidebar.classes.hideEmail', {
                        defaultValue: '− Email',
                      })
                    : t('sidebar.classes.addEmail', {
                        defaultValue: '+ Email',
                      })}
                </button>
                <button
                  onClick={() => setShowRestrictions((v) => !v)}
                  className={`text-xs font-black uppercase tracking-wider transition-colors ${
                    showRestrictions
                      ? 'text-amber-600 hover:text-amber-700'
                      : 'text-slate-400 hover:text-slate-500'
                  }`}
                >
                  {showRestrictions
                    ? t('sidebar.classes.hideRestrictions', {
                        defaultValue: '− Restrictions',
                      })
                    : t('sidebar.classes.addRestrictions', {
                        defaultValue: '+ Restrictions',
                      })}
                </button>
              </div>
              <p className="text-xs text-slate-400 italic">
                {t('sidebar.classes.bulkPasteTip', {
                  defaultValue:
                    'Tip: paste multiple names at once to add in bulk.',
                })}
              </p>
            </div>

            {duplicatePins.size > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-2 bg-yellow-50 border border-yellow-300 rounded-lg text-yellow-800 text-xs font-semibold shrink-0">
                <AlertTriangle size={14} className="text-yellow-600 shrink-0" />
                {t('sidebar.classes.duplicatePins', {
                  defaultValue: 'Duplicate PINs: {{pins}}',
                  pins: [...duplicatePins].join(', '),
                })}
              </div>
            )}

            <div className="flex-1 min-h-0 border border-slate-200 rounded-xl bg-slate-50/30 overflow-y-auto custom-scrollbar">
              {rows.length === 0 ? (
                <RosterEmptyState
                  title={t('sidebar.classes.emptyRosterTitle', {
                    defaultValue: 'No students yet',
                  })}
                  subtitle={t('sidebar.classes.emptyRosterSubtitle', {
                    defaultValue:
                      'Click + Add Student or paste a list of names into a row.',
                  })}
                  addLabel={t('sidebar.classes.addStudent', {
                    defaultValue: '+ Add Student',
                  })}
                  onAdd={addRow}
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
                    restrictionsLabel={t('sidebar.classes.restrictionsHeader', {
                      defaultValue: 'Restricted from working with',
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
                  <div className="p-3 sticky bottom-0 bg-slate-50/80 backdrop-blur-sm border-t border-slate-200">
                    <button
                      onClick={addRow}
                      className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-bold text-brand-blue-primary bg-white border border-dashed border-slate-300 rounded-lg hover:border-brand-blue-primary hover:bg-brand-blue-lighter transition-colors"
                    >
                      <Plus size={16} />
                      {t('sidebar.classes.addStudent', {
                        defaultValue: '+ Add Student',
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
      className="hidden md:grid items-center gap-3 px-3 py-2 bg-slate-100/60 border-b border-slate-200 text-xxs font-bold text-slate-500 uppercase tracking-widest sticky top-0 z-10"
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
      className="grid items-center gap-3 px-3 py-2 hover:bg-white transition-colors"
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
          className={`px-2 py-1.5 text-sm font-mono text-center rounded-md border outline-none focus:ring-2 focus:ring-violet-100 transition-colors ${
            isDuplicatePin
              ? 'border-yellow-400 bg-yellow-50 focus:border-yellow-500'
              : 'border-slate-200 bg-white focus:border-violet-400'
          }`}
          value={row.pin}
          onChange={(e) => onChange({ pin: e.target.value })}
          placeholder={pinPlaceholder}
          maxLength={4}
          inputMode="numeric"
        />
      )}
      <input
        className="px-3 py-1.5 text-sm rounded-md border border-slate-200 bg-white outline-none focus:border-brand-blue-primary focus:ring-2 focus:ring-brand-blue-primary/20 transition-colors"
        value={row.firstName}
        onChange={(e) => onChange({ firstName: e.target.value })}
        onPaste={handleFirstNamePaste}
        placeholder={firstNamePlaceholder}
      />
      {showLastNames && (
        <input
          className="px-3 py-1.5 text-sm rounded-md border border-slate-200 bg-white outline-none focus:border-brand-blue-primary focus:ring-2 focus:ring-brand-blue-primary/20 transition-colors"
          value={row.lastName}
          onChange={(e) => onChange({ lastName: e.target.value })}
          placeholder={lastNamePlaceholder}
        />
      )}
      {showEmails && (
        <input
          type="email"
          className="px-3 py-1.5 text-sm rounded-md border border-slate-200 bg-white outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 transition-colors"
          value={row.email ?? ''}
          onChange={(e) => onChange({ email: e.target.value })}
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
        className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors justify-self-end"
      >
        <X size={16} />
      </button>
    </li>
  );
};

interface RosterGroupsPanelProps {
  groups: RosterGroup[];
  students: Student[];
  onChange: (groups: RosterGroup[]) => void;
}

/**
 * Per-roster group editor (M17 A4). Clones the toggle-row/checklist idiom
 * used by `RestrictionsPicker` — a compact expand/collapse list, no new
 * form controls.
 */
const RosterGroupsPanel: React.FC<RosterGroupsPanelProps> = ({
  groups,
  students,
  onChange,
}) => {
  const { t } = useTranslation();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const studentIds = useMemo(
    () => new Set(students.map((s) => s.id)),
    [students]
  );

  const addGroup = () => {
    const group: RosterGroup = {
      id: crypto.randomUUID(),
      name: t('sidebar.classes.newGroupName', { defaultValue: 'New Group' }),
      studentIds: [],
    };
    onChange([...groups, group]);
    setExpandedId(group.id);
  };

  const renameGroup = (id: string, name: string) => {
    onChange(groups.map((g) => (g.id === id ? { ...g, name } : g)));
  };

  const deleteGroup = (id: string) => {
    onChange(groups.filter((g) => g.id !== id));
    if (expandedId === id) setExpandedId(null);
  };

  const toggleMember = (groupId: string, studentId: string) => {
    onChange(
      groups.map((g) => {
        if (g.id !== groupId) return g;
        const inGroup = g.studentIds.includes(studentId);
        return {
          ...g,
          studentIds: inGroup
            ? g.studentIds.filter((id) => id !== studentId)
            : [...g.studentIds, studentId],
        };
      })
    );
  };

  return (
    <div className="flex-1 min-h-0 border border-slate-200 rounded-xl bg-slate-50/30 overflow-y-auto custom-scrollbar">
      {groups.length === 0 ? (
        <RosterEmptyState
          title={t('sidebar.classes.emptyGroupsTitle', {
            defaultValue: 'No groups yet',
          })}
          subtitle={t('sidebar.classes.emptyGroupsSubtitle', {
            defaultValue: 'Save a subset of this class for quick targeting.',
          })}
          addLabel={t('sidebar.classes.addGroup', {
            defaultValue: '+ New Group',
          })}
          onAdd={addGroup}
        />
      ) : (
        <>
          <ul className="flex flex-col divide-y divide-slate-100">
            {groups.map((group) => {
              const expanded = expandedId === group.id;
              // Count only members still on the roster — a student deleted in
              // the Students tab isn't pruned from studentIds until save.
              const memberCount = group.studentIds.filter((id) =>
                studentIds.has(id)
              ).length;
              return (
                <li key={group.id} className="p-3">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setExpandedId(expanded ? null : group.id)}
                      className="p-1 text-slate-400 hover:text-brand-blue-primary rounded-md transition-colors"
                      aria-label={t('sidebar.classes.editGroupMembers', {
                        defaultValue: 'Edit group members',
                      })}
                    >
                      <UsersRound size={16} />
                    </button>
                    <input
                      className="flex-1 px-2 py-1 text-sm font-bold rounded-md border border-transparent hover:border-slate-200 focus:border-brand-blue-primary focus:ring-2 focus:ring-brand-blue-primary/20 outline-none transition-colors"
                      value={group.name}
                      onChange={(e) => renameGroup(group.id, e.target.value)}
                    />
                    <span className="text-xxs font-bold text-slate-400 uppercase tracking-widest">
                      {t('sidebar.classes.groupMemberCount', {
                        count: memberCount,
                        defaultValue: '{{count}} student',
                        defaultValue_other: '{{count}} students',
                      })}
                    </span>
                    <button
                      onClick={() => deleteGroup(group.id)}
                      aria-label={t('sidebar.classes.removeGroup', {
                        defaultValue: 'Remove group',
                      })}
                      className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
                    >
                      <X size={16} />
                    </button>
                  </div>
                  {expanded && (
                    <ul className="mt-2 ml-7 flex flex-col gap-1 max-h-48 overflow-y-auto custom-scrollbar">
                      {students.length === 0 ? (
                        <li className="text-xs text-slate-400 italic">
                          {t('sidebar.classes.noStudentsToGroup', {
                            defaultValue: 'Add students first.',
                          })}
                        </li>
                      ) : (
                        students.map((s) => (
                          <li key={s.id}>
                            <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={group.studentIds.includes(s.id)}
                                onChange={() => toggleMember(group.id, s.id)}
                                className="rounded border-slate-300 text-brand-blue-primary focus:ring-brand-blue-primary/40"
                              />
                              {`${s.firstName} ${s.lastName}`.trim() || s.id}
                            </label>
                          </li>
                        ))
                      )}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="p-3 sticky bottom-0 bg-slate-50/80 backdrop-blur-sm border-t border-slate-200">
            <button
              onClick={addGroup}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-bold text-brand-blue-primary bg-white border border-dashed border-slate-300 rounded-lg hover:border-brand-blue-primary hover:bg-brand-blue-lighter transition-colors"
            >
              <Plus size={16} />
              {t('sidebar.classes.addGroup', { defaultValue: '+ New Group' })}
            </button>
          </div>
        </>
      )}
    </div>
  );
};

interface RosterEmptyStateProps {
  title: string;
  subtitle: string;
  addLabel: string;
  onAdd: () => void;
}

const RosterEmptyState: React.FC<RosterEmptyStateProps> = ({
  title,
  subtitle,
  addLabel,
  onAdd,
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
  parts.push('minmax(0, 1fr)');
  if (showLastNames) parts.push('minmax(0, 1fr)');
  if (showEmails) parts.push('minmax(0, 1.4fr)');
  if (showRestrictions) parts.push('minmax(9rem, 14rem)');
  parts.push('2rem');
  return parts.join(' ');
}
