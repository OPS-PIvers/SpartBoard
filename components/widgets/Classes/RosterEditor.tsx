import React from 'react';
import { Student, ClassRoster } from '@/types';
import { Save, AlertTriangle } from 'lucide-react';
import { SettingsLabel } from '@/components/common/SettingsLabel';
import { WidgetLayout } from '@/components/widgets/WidgetLayout';
import { tourTypeAttr } from '@/config/tourAnchors';
import { useRosterEditorState } from '@/components/classes/useRosterEditorState';

interface EditorProps {
  roster: ClassRoster | null;
  onSave: (name: string, students: Student[]) => void;
  onBack: () => void;
}

/**
 * Widget-chromed roster editor. Used inside the Classes widget.
 *
 * The account-level version lives at `components/classes/RosterEditorModal.tsx`.
 * Both consume `useRosterEditorState` so their behavior can't drift.
 */
export const RosterEditor: React.FC<EditorProps> = ({
  roster,
  onSave,
  onBack,
}) => {
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

  const handleSave = () => {
    if (!name.trim()) return;
    onSave(name, previewStudents);
  };

  return (
    <WidgetLayout
      padding="p-0"
      header={
        <div className="flex justify-between items-center p-3">
          <button
            {...tourTypeAttr('classes-widget.editor-back', 'classes')}
            onClick={onBack}
            className="text-xs text-slate-500 hover:text-blue-600 uppercase tracking-wider font-bold"
          >
            &larr; Back
          </button>
          <div className="flex gap-2 items-center flex-1 ml-4 justify-end">
            <input
              {...tourTypeAttr('classes-widget.editor-name', 'classes')}
              className="border-b-2 border-slate-200 focus:border-blue-500 bg-transparent px-1 py-0.5 outline-hidden text-slate-800 placeholder-slate-400 min-w-0 text-sm font-bold"
              placeholder="Class Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <button
              {...tourTypeAttr('classes-widget.editor-save', 'classes')}
              onClick={handleSave}
              className="bg-green-600 text-white px-3 py-1.5 rounded-lg flex gap-1 items-center text-xs font-bold hover:bg-green-700 shadow-xs transition-colors"
            >
              <Save size={14} /> Save
            </button>
          </div>
        </div>
      }
      content={
        <div className="flex flex-col w-full h-full p-3 gap-2">
          {duplicatePins.size > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-50 border border-yellow-300 rounded-lg text-yellow-800 text-xxs font-semibold shrink-0">
              <AlertTriangle size={12} className="text-yellow-600 shrink-0" />
              Duplicate PINs: {[...duplicatePins].join(', ')}
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
                <SettingsLabel className="text-slate-500 mb-0">
                  {showLastNames ? 'First Names' : 'Names (One per line)'}
                </SettingsLabel>
                <div className="flex gap-2">
                  {!showLastNames && (
                    <button
                      {...tourTypeAttr(
                        'classes-widget.editor-add-last-name',
                        'classes'
                      )}
                      onClick={handleToggleToLastNames}
                      className="text-xxs text-blue-600 hover:text-blue-700 font-black uppercase tracking-wider"
                    >
                      + Last Name
                    </button>
                  )}
                  {!showPins && (
                    <button
                      {...tourTypeAttr(
                        'classes-widget.editor-add-pin',
                        'classes'
                      )}
                      onClick={() => setShowPins(true)}
                      className="text-xxs text-violet-600 hover:text-violet-700 font-black uppercase tracking-wider"
                    >
                      + Quiz PIN
                    </button>
                  )}
                </div>
              </div>
              {/* no-tour-anchor: holds student names and PINs */}
              <textarea
                className="flex-1 border border-slate-200 focus:border-blue-400 p-3 rounded-xl resize-none text-xs font-mono focus:ring-2 focus:ring-blue-100 outline-hidden transition-all custom-scrollbar bg-slate-50/30 min-h-0"
                value={firsts}
                onChange={(e) => setFirsts(e.target.value)}
                placeholder={
                  showLastNames
                    ? 'Paste first names...'
                    : 'Paste full names or group names here...'
                }
              />
            </div>
            {showLastNames && (
              <div className="flex flex-col h-full min-h-0">
                <div className="flex justify-between items-end mb-1">
                  <SettingsLabel className="text-slate-500 mb-0">
                    Last Names
                  </SettingsLabel>
                  <button
                    {...tourTypeAttr(
                      'classes-widget.editor-remove-last-name',
                      'classes'
                    )}
                    onClick={handleToggleToSingleField}
                    className="text-xxs text-slate-400 hover:text-red-500 font-black uppercase tracking-wider transition-colors"
                  >
                    Remove
                  </button>
                </div>
                {/* no-tour-anchor: holds student names and PINs */}
                <textarea
                  className="flex-1 border border-slate-200 focus:border-blue-400 p-3 rounded-xl resize-none text-xs font-mono focus:ring-2 focus:ring-blue-100 outline-hidden transition-all custom-scrollbar bg-slate-50/30 min-h-0"
                  value={lasts}
                  onChange={(e) => setLasts(e.target.value)}
                  placeholder="Paste last names..."
                />
              </div>
            )}
            {showPins && (
              <div className="flex flex-col h-full min-h-0 w-20">
                <div className="flex justify-between items-end mb-1">
                  <SettingsLabel className="text-slate-500 mb-0">
                    Quiz PIN
                  </SettingsLabel>
                  <button
                    {...tourTypeAttr(
                      'classes-widget.editor-hide-pin',
                      'classes'
                    )}
                    onClick={() => setShowPins(false)}
                    className="text-xxs text-slate-400 hover:text-red-500 font-black uppercase tracking-wider transition-colors"
                  >
                    Hide
                  </button>
                </div>
                {/* no-tour-anchor: holds student names and PINs */}
                <textarea
                  className="flex-1 border border-slate-200 focus:border-violet-400 p-3 rounded-xl resize-none text-xs font-mono focus:ring-2 focus:ring-violet-100 outline-hidden transition-all custom-scrollbar bg-slate-50/30 min-h-0"
                  value={pins}
                  onChange={(e) => setPins(e.target.value)}
                  placeholder={'01\n02\n03\n...'}
                />
              </div>
            )}
          </div>
        </div>
      }
    />
  );
};
