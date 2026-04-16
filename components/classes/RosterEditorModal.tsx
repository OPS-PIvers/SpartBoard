import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Save, AlertTriangle, X, Plus, Users } from 'lucide-react';
import { Student, ClassRoster } from '@/types';
import { Modal } from '@/components/common/Modal';
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
  onSave: (name: string, students: Student[]) => Promise<void> | void;
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
    showRestrictions,
    setShowRestrictions,
    toggleRestriction,
    validStudents,
    duplicatePins,
  } = useRosterRowsState(roster);

  const handleSave = async () => {
    if (!name.trim()) return;
    await onSave(name.trim(), validStudents);
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
            disabled={!name.trim()}
            className="bg-brand-blue-primary text-white px-5 py-2 rounded-xl flex gap-1.5 items-center text-sm font-bold uppercase tracking-wider hover:bg-brand-blue-dark shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save size={16} /> {t('common.save', { defaultValue: 'Save' })}
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={handleToggleLastNames}
              className={`text-xs font-black uppercase tracking-wider transition-colors ${
                showLastNames
                  ? 'text-slate-400 hover:text-red-500'
                  : 'text-blue-600 hover:text-blue-700'
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
                  ? 'text-slate-400 hover:text-red-500'
                  : 'text-violet-600 hover:text-violet-700'
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
              onClick={() => setShowRestrictions((v) => !v)}
              className={`text-xs font-black uppercase tracking-wider transition-colors ${
                showRestrictions
                  ? 'text-slate-400 hover:text-red-500'
                  : 'text-amber-600 hover:text-amber-700'
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
              defaultValue: 'Tip: paste multiple names at once to add in bulk.',
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
      </div>
    </Modal>
  );
};

interface RosterHeaderProps {
  showLastNames: boolean;
  showPins: boolean;
  showRestrictions: boolean;
  firstLabel: string;
  lastLabel: string;
  pinLabel: string;
  restrictionsLabel: string;
}

const RosterHeader: React.FC<RosterHeaderProps> = ({
  showLastNames,
  showPins,
  showRestrictions,
  firstLabel,
  lastLabel,
  pinLabel,
  restrictionsLabel,
}) => {
  return (
    <div
      className="hidden md:grid items-center gap-3 px-3 py-2 bg-slate-100/60 border-b border-slate-200 text-xxs font-bold text-slate-500 uppercase tracking-widest sticky top-0 z-10"
      style={{
        gridTemplateColumns: buildGridTemplate(
          showLastNames,
          showPins,
          showRestrictions
        ),
      }}
    >
      <span className="text-right pr-1">#</span>
      {showPins && <span>{pinLabel}</span>}
      <span>{firstLabel}</span>
      {showLastNames && <span>{lastLabel}</span>}
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
  showRestrictions: boolean;
  allRows: DraftRow[];
  isDuplicatePin: boolean;
  firstNamePlaceholder: string;
  lastNamePlaceholder: string;
  pinPlaceholder: string;
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
  showRestrictions,
  allRows,
  isDuplicatePin,
  firstNamePlaceholder,
  lastNamePlaceholder,
  pinPlaceholder,
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

  const candidates = useMemo<RestrictionsPickerCandidate[]>(
    () =>
      allRows
        .filter((r) => r.id !== row.id)
        .map((r) => ({
          id: r.id,
          label:
            `${r.firstName} ${r.lastName}`.trim() ||
            `(unnamed #${allRows.indexOf(r) + 1})`,
        }))
        .filter((c) => c.label.length > 0),
    [allRows, row.id]
  );

  return (
    <li
      className="grid items-center gap-3 px-3 py-2 hover:bg-white transition-colors"
      style={{
        gridTemplateColumns: buildGridTemplate(
          showLastNames,
          showPins,
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
      {showRestrictions && (
        <RestrictionsPicker
          studentId={row.id}
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
 * Grid columns: [#] [PIN?] [First] [Last?] [Restrictions?] [Delete]
 */
function buildGridTemplate(
  showLastNames: boolean,
  showPins: boolean,
  showRestrictions: boolean
): string {
  const parts = ['2rem'];
  if (showPins) parts.push('5rem');
  parts.push('minmax(0, 1fr)');
  if (showLastNames) parts.push('minmax(0, 1fr)');
  if (showRestrictions) parts.push('minmax(9rem, 14rem)');
  parts.push('2rem');
  return parts.join(' ');
}
