import React from 'react';
import {
  SeatingChartConfig,
  FurnitureItem,
  SeatingChartTemplate,
  WidgetData,
} from '@/types';
import { RefreshCw, Trash2, UserPlus } from 'lucide-react';
import { TEMPLATES, FURNITURE_TYPES } from './constants';

interface SeatingChartSidebarProps {
  mode: 'setup' | 'assign' | 'interact';
  widgetId: string;
  config: SeatingChartConfig;
  updateWidget: (id: string, updates: Partial<WidgetData>) => void;
  template: SeatingChartTemplate;
  localTemplateColumns: string;
  setLocalTemplateColumns: (val: string) => void;
  studentCount: number;
  applyTemplate: () => void;
  addFurniture: (type: FurnitureItem['type']) => void;
  clearAllFurniture: () => void;
  unassignedStudents: { id: string; label: string }[];
  addAllRandomly: () => void;
  handleStudentClick: (studentId: string) => void;
  selectedStudent: string | null;
}

export const SeatingChartSidebar: React.FC<SeatingChartSidebarProps> = ({
  mode,
  widgetId,
  config,
  updateWidget,
  template,
  localTemplateColumns,
  setLocalTemplateColumns,
  studentCount,
  applyTemplate,
  addFurniture,
  clearAllFurniture,
  unassignedStudents,
  addAllRandomly,
  handleStudentClick,
  selectedStudent,
}) => {
  if (mode !== 'setup' && mode !== 'assign') return null;

  return (
    <div className="w-48 bg-slate-50 border-r border-slate-200 flex flex-col overflow-hidden shrink-0 animate-in slide-in-from-left-4 duration-200">
      {mode === 'setup' && (
        <div className="flex flex-col h-full overflow-y-auto custom-scrollbar">
          {/* Template Picker */}
          <div className="p-3 border-b border-slate-200">
            <label className="text-xxs font-black text-slate-500 uppercase tracking-widest block mb-2">
              Template
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              {TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  onClick={() =>
                    updateWidget(widgetId, {
                      config: { ...config, template: t.id },
                    })
                  }
                  title={t.description}
                  className={`flex flex-col items-center justify-center gap-1 p-2 border rounded-lg transition-all text-xxs font-black uppercase leading-none ${
                    template === t.id
                      ? 'bg-indigo-50 border-indigo-400 text-indigo-700 ring-1 ring-indigo-300'
                      : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <t.icon className="w-4 h-4" />
                  <span>{t.label}</span>
                </button>
              ))}
            </div>

            {/* Columns count input */}
            {template === 'rows' && (
              <div className="mt-2">
                <label className="text-xxs font-black text-slate-500 uppercase tracking-widest block mb-1">
                  # of Columns
                </label>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={localTemplateColumns}
                  onChange={(e) => {
                    setLocalTemplateColumns(e.target.value);
                    const parsed = Number.parseInt(e.target.value, 10);
                    if (!Number.isNaN(parsed)) {
                      updateWidget(widgetId, {
                        config: {
                          ...config,
                          templateColumns: Math.min(20, Math.max(1, parsed)),
                        },
                      });
                    }
                  }}
                  onBlur={() => {
                    const parsed = Number.parseInt(localTemplateColumns, 10);
                    if (Number.isNaN(parsed)) {
                      const legacyTemplateRows = (
                        config as SeatingChartConfig & { templateRows?: number }
                      ).templateRows;
                      setLocalTemplateColumns(
                        String(
                          config.templateColumns ?? legacyTemplateRows ?? 6
                        )
                      );
                    }
                  }}
                  className="w-full p-2 text-xs border border-slate-200 bg-white rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none font-black"
                />
              </div>
            )}

            {/* Student count hint */}
            <p className="text-xxs text-slate-400 mt-2 text-center">
              {studentCount > 0 ? `${studentCount} students` : 'No roster set'}
            </p>

            {/* Apply button */}
            <button
              onClick={applyTemplate}
              disabled={
                template === 'freeform' ||
                (studentCount === 0 && template !== 'horseshoe')
              }
              className="mt-2 w-full flex items-center justify-center gap-1.5 p-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white rounded-lg transition-colors text-xxs font-black uppercase tracking-wider"
            >
              <RefreshCw className="w-3 h-3" />
              Apply Layout
            </button>
          </div>

          {/* Multi-select hint */}
          <div className="px-3 py-2 border-b border-slate-200 bg-indigo-50/50">
            <p className="text-xxs text-indigo-500 font-bold leading-tight">
              <span className="font-black">Ctrl+Click</span> to add/remove from
              selection. <span className="font-black">Drag empty space</span> to
              rubber-band select.
            </p>
          </div>

          {/* Manual Add */}
          <div className="p-3 border-b border-slate-200">
            <label className="text-xxs font-black text-slate-500 uppercase tracking-widest block mb-2">
              Add Manually
            </label>
            <div className="grid grid-cols-2 gap-2">
              {FURNITURE_TYPES.map((t) => (
                <button
                  key={t.type}
                  onClick={() => addFurniture(t.type)}
                  className="flex flex-col items-center justify-center gap-1 p-2 bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-lg transition-colors aspect-square shadow-sm"
                >
                  <t.icon className="w-6 h-6 text-slate-600" />
                  <span className="text-xxs font-black uppercase text-slate-500">
                    {t.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Reset */}
          <div className="mt-auto p-3">
            <button
              onClick={clearAllFurniture}
              className="w-full flex items-center justify-center gap-2 p-2 bg-red-500/10 hover:bg-red-500/20 text-red-600 border border-red-500/20 rounded-lg transition-colors text-xxs font-black uppercase tracking-wider"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Reset Canvas
            </button>
          </div>
        </div>
      )}

      {mode === 'assign' && (
        <div className="flex flex-col h-full">
          <div className="p-2 border-b border-slate-200 bg-slate-100 text-xxs font-black uppercase text-slate-600 tracking-widest text-center">
            Unassigned Students
          </div>
          <div className="p-2 border-b border-slate-200">
            <button
              onClick={addAllRandomly}
              className="w-full flex items-center justify-center gap-2 p-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 border border-indigo-200 rounded-lg transition-colors text-xxs font-black uppercase tracking-wider"
            >
              <UserPlus className="w-3.5 h-3.5" />
              Add All Random
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
            {unassignedStudents.length === 0 ? (
              <div className="text-center text-xs text-slate-400 py-4 italic font-bold">
                All assigned!
              </div>
            ) : (
              unassignedStudents.map((student) => (
                <div
                  key={student.id}
                  draggable
                  onDragStart={(e) =>
                    e.dataTransfer.setData('studentId', student.id)
                  }
                  onClick={() => handleStudentClick(student.id)}
                  className={`p-2 bg-white border ${selectedStudent === student.id ? 'border-indigo-500 ring-2 ring-indigo-200' : 'border-slate-200'} rounded-lg shadow-sm text-xs font-black text-slate-700 cursor-grab active:cursor-grabbing hover:border-indigo-300 transition-all`}
                  title="Drag or Click to assign"
                >
                  {student.label}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
