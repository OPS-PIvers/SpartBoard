import React from 'react';
import { useTranslation } from 'react-i18next';
import { Save, AlertTriangle } from 'lucide-react';
import { Student, ClassRoster } from '@/types';
import { Modal } from '@/components/common/Modal';
import { useRosterEditorState } from './useRosterEditorState';

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
 * Wraps the shared `useRosterEditorState` hook in a portal Modal — no
 * widget chrome.
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
    firsts,
    setFirsts,
    lasts,
    setLasts,
    pins,
    setPins,
    showPins,
    setShowPins,
    showLastNames,
    handleToggleToLastNames,
    handleToggleToSingleField,
    previewStudents,
    duplicatePins,
  } = useRosterEditorState(roster);

  const handleSave = async () => {
    if (!name.trim()) return;
    await onSave(name.trim(), previewStudents);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="max-w-2xl"
      className="max-h-[85vh]"
      contentClassName="px-6 pb-6 flex flex-col"
      title={
        roster
          ? t('sidebar.classes.editClassTitle', { defaultValue: 'Edit Class' })
          : t('sidebar.classes.newClassTitle', { defaultValue: 'New Class' })
      }
    >
      <div className="flex flex-col h-full gap-3 min-h-0">
        <div className="flex items-center gap-3 shrink-0">
          <input
            className="flex-1 min-w-0 px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-blue-primary focus:border-brand-blue-primary font-bold"
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
            className="bg-brand-blue-primary text-white px-4 py-2 rounded-xl flex gap-1.5 items-center text-xs font-bold uppercase tracking-wider hover:bg-brand-blue-dark shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save size={14} /> {t('common.save', { defaultValue: 'Save' })}
          </button>
        </div>

        {duplicatePins.size > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-50 border border-yellow-300 rounded-lg text-yellow-800 text-xxs font-semibold shrink-0">
            <AlertTriangle size={12} className="text-yellow-600 shrink-0" />
            {t('sidebar.classes.duplicatePins', {
              defaultValue: 'Duplicate PINs: {{pins}}',
              pins: [...duplicatePins].join(', '),
            })}
          </div>
        )}

        <div
          className={`grid ${
            showLastNames && showPins
              ? 'grid-cols-[1fr_1fr_auto]'
              : showLastNames
                ? 'grid-cols-2'
                : showPins
                  ? 'grid-cols-[1fr_auto]'
                  : 'grid-cols-1'
          } gap-3 flex-1 min-h-0`}
        >
          <div className="flex flex-col h-full min-h-0">
            <div className="flex justify-between items-end mb-1">
              <label className="text-xxs font-bold text-slate-500 uppercase tracking-widest">
                {showLastNames
                  ? t('sidebar.classes.firstNames', {
                      defaultValue: 'First Names',
                    })
                  : t('sidebar.classes.namesOnePerLine', {
                      defaultValue: 'Names (One per line)',
                    })}
              </label>
              <div className="flex gap-2">
                {!showLastNames && (
                  <button
                    onClick={handleToggleToLastNames}
                    className="text-xxs text-blue-600 hover:text-blue-700 font-black uppercase tracking-wider"
                  >
                    {t('sidebar.classes.addLastName', {
                      defaultValue: '+ Last Name',
                    })}
                  </button>
                )}
                {!showPins && (
                  <button
                    onClick={() => setShowPins(true)}
                    className="text-xxs text-violet-600 hover:text-violet-700 font-black uppercase tracking-wider"
                  >
                    {t('sidebar.classes.addQuizPin', {
                      defaultValue: '+ Quiz PIN',
                    })}
                  </button>
                )}
              </div>
            </div>
            <textarea
              className="flex-1 border border-slate-200 focus:border-blue-400 p-3 rounded-xl resize-none text-xs font-mono focus:ring-2 focus:ring-blue-100 outline-none transition-all custom-scrollbar bg-slate-50/30 min-h-0"
              value={firsts}
              onChange={(e) => setFirsts(e.target.value)}
              placeholder={
                showLastNames
                  ? t('sidebar.classes.pasteFirstNames', {
                      defaultValue: 'Paste first names...',
                    })
                  : t('sidebar.classes.pasteFullNames', {
                      defaultValue: 'Paste full names or group names here...',
                    })
              }
            />
          </div>
          {showLastNames && (
            <div className="flex flex-col h-full min-h-0">
              <div className="flex justify-between items-end mb-1">
                <label className="text-xxs font-bold text-slate-500 uppercase tracking-widest">
                  {t('sidebar.classes.lastNames', {
                    defaultValue: 'Last Names',
                  })}
                </label>
                <button
                  onClick={handleToggleToSingleField}
                  className="text-xxs text-slate-400 hover:text-red-500 font-black uppercase tracking-wider transition-colors"
                >
                  {t('sidebar.classes.remove', { defaultValue: 'Remove' })}
                </button>
              </div>
              <textarea
                className="flex-1 border border-slate-200 focus:border-blue-400 p-3 rounded-xl resize-none text-xs font-mono focus:ring-2 focus:ring-blue-100 outline-none transition-all custom-scrollbar bg-slate-50/30 min-h-0"
                value={lasts}
                onChange={(e) => setLasts(e.target.value)}
                placeholder={t('sidebar.classes.pasteLastNames', {
                  defaultValue: 'Paste last names...',
                })}
              />
            </div>
          )}
          {showPins && (
            <div className="flex flex-col h-full min-h-0 w-24">
              <div className="flex justify-between items-end mb-1">
                <label className="text-xxs font-bold text-slate-500 uppercase tracking-widest">
                  {t('sidebar.classes.quizPin', { defaultValue: 'Quiz PIN' })}
                </label>
                <button
                  onClick={() => setShowPins(false)}
                  className="text-xxs text-slate-400 hover:text-red-500 font-black uppercase tracking-wider transition-colors"
                >
                  {t('sidebar.classes.hide', { defaultValue: 'Hide' })}
                </button>
              </div>
              <textarea
                className="flex-1 border border-slate-200 focus:border-violet-400 p-3 rounded-xl resize-none text-xs font-mono focus:ring-2 focus:ring-violet-100 outline-none transition-all custom-scrollbar bg-slate-50/30 min-h-0"
                value={pins}
                onChange={(e) => setPins(e.target.value)}
                placeholder={'01\n02\n03\n...'}
              />
            </div>
          )}
        </div>

        <div className="text-xxs text-slate-400 font-medium shrink-0">
          {t('sidebar.classes.studentCount', {
            count: previewStudents.length,
            defaultValue: '{{count}} Student',
            defaultValue_other: '{{count}} Students',
          })}
        </div>
      </div>
    </Modal>
  );
};
