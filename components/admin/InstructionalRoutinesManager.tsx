import React, { useState } from 'react';
import { tourAttr, tourFieldAttr } from '@/config/tourAnchors';
import { X, Plus, Edit, Trash2, Sparkles } from 'lucide-react';
import { useInstructionalRoutines } from '@/hooks/useInstructionalRoutines';
import { LibraryManager } from '@/components/widgets/InstructionalRoutines/LibraryManager';
import { InstructionalRoutine } from '@/config/instructionalRoutines';
import { useDialog } from '@/context/useDialog';
import { getRoutineColorClasses } from '@/components/widgets/InstructionalRoutines/colorHelpers';
import { useDashboard } from '@/context/useDashboard';
import { logError } from '@/utils/logError';
import { Modal } from '@/components/common/Modal';

interface InstructionalRoutinesManagerProps {
  onClose: () => void;
}

export const InstructionalRoutinesManager: React.FC<
  InstructionalRoutinesManagerProps
> = ({ onClose }) => {
  const { routines, deleteRoutine, saveRoutine } = useInstructionalRoutines();
  const { addToast } = useDashboard();
  const [editingRoutine, setEditingRoutine] =
    useState<InstructionalRoutine | null>(null);
  const { showConfirm } = useDialog();

  const confirmDeleteRoutine = async (routine: InstructionalRoutine) => {
    const ok = await showConfirm(
      `Are you sure you want to delete "${routine.name}"? This action cannot be undone.`,
      { title: 'Delete Routine', confirmLabel: 'Delete', variant: 'danger' }
    );
    if (!ok) return;
    try {
      await deleteRoutine(routine.id);
      addToast('Routine deleted successfully', 'success');
    } catch (error) {
      logError('InstructionalRoutinesManager.deleteRoutine', error, {
        routineId: routine.id,
        routineName: routine.name,
      });
      addToast('Failed to delete routine. Please try again.', 'error');
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      variant="bare"
      zIndex="z-modal-nested"
      maxWidth="max-w-2xl"
      captureEscape
      className="h-[80vh] overflow-hidden rounded-2xl bg-white shadow-2xl [&>div]:flex [&>div]:flex-col [&>div]:overflow-hidden"
    >
      <div className="flex items-center justify-between p-4 border-b">
        <h3 className="font-black text-sm uppercase tracking-widest text-slate-500">
          Instructional Routines Library
        </h3>
        <button
          {...tourAttr('admin.routines.close')}
          onClick={onClose}
          className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-colors"
          aria-label="Close"
          type="button"
        >
          <X size={20} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-6 bg-slate-50 custom-scrollbar">
        <div className="flex justify-end mb-6">
          <button
            {...tourAttr('admin.routines.new-routine')}
            onClick={() =>
              setEditingRoutine({
                id: crypto.randomUUID(),
                name: '',
                grades: 'Universal',
                gradeLevels: ['k-2', '3-5', '6-8', '9-12'],
                icon: 'Zap',
                color: 'blue',
                steps: [
                  {
                    text: '',
                    icon: 'Zap',
                    color: 'blue',
                    label: 'Step',
                  },
                ],
              })
            }
            className="px-4 py-2 bg-brand-blue-primary text-white rounded-xl text-xs font-black uppercase tracking-wider hover:bg-brand-blue-dark transition-all flex items-center gap-2 shadow-xs whitespace-nowrap"
          >
            <Plus className="w-4 h-4" /> New Routine
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3">
          {routines.map((routine) => {
            const colorClasses = getRoutineColorClasses(
              routine.color || 'blue'
            );
            return (
              <div
                key={routine.id}
                className="bg-white border-2 border-slate-200 rounded-2xl p-4 flex items-center justify-between group hover:border-brand-blue-light transition-all shadow-xs"
              >
                <div className="flex items-center gap-4">
                  <div
                    className={`p-3 rounded-xl ${colorClasses.bg} ${colorClasses.text}`}
                  >
                    <div className="w-6 h-6 flex items-center justify-center">
                      <div className="w-4 h-4 rounded-full bg-current opacity-50" />
                    </div>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-black text-slate-800 leading-tight">
                      {routine.name}
                    </span>
                    <span className="text-xxs text-slate-400 font-black uppercase tracking-wider">
                      {routine.grades}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1 sm:gap-2">
                  <button
                    {...tourFieldAttr(
                      'admin.routines.edit',
                      'admin',
                      routine.id
                    )}
                    onClick={() => setEditingRoutine(routine)}
                    className="p-2 hover:bg-blue-50 rounded-xl text-slate-400 hover:text-brand-blue-primary transition-colors flex items-center gap-1.5 text-xxs font-black uppercase tracking-wider"
                    title="Edit Routine"
                  >
                    <Edit size={16} />
                    <span className="hidden sm:inline">Edit</span>
                  </button>
                  <button
                    {...tourFieldAttr(
                      'admin.routines.delete',
                      'admin',
                      routine.id
                    )}
                    onClick={() => void confirmDeleteRoutine(routine)}
                    className="p-2 hover:bg-red-50 rounded-xl text-slate-400 hover:text-red-600 transition-colors flex items-center gap-1.5 text-xxs font-black uppercase tracking-wider"
                    title="Delete Routine"
                  >
                    <Trash2 size={16} />
                    <span className="hidden sm:inline">Delete</span>
                  </button>
                </div>
              </div>
            );
          })}

          {routines.length === 0 && (
            <div className="py-12 flex flex-col items-center justify-center bg-white border-2 border-dashed border-slate-200 rounded-3xl text-slate-400">
              <Sparkles className="w-12 h-12 mb-4 opacity-50" />
              <p className="font-black uppercase tracking-widest text-xs">
                No routines in library
              </p>
              <p className="text-xs mt-1">
                Create your first routine template to get started.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Routine Editor Modal */}
      {editingRoutine && (
        <Modal
          isOpen
          onClose={() => setEditingRoutine(null)}
          variant="bare"
          zIndex="z-modal-deep"
          maxWidth="max-w-2xl"
          dismissible={false}
          className="h-[80vh] overflow-hidden rounded-2xl bg-white shadow-2xl [&>div]:flex [&>div]:flex-col [&>div]:overflow-hidden"
        >
          <LibraryManager
            routine={editingRoutine}
            onChange={setEditingRoutine}
            onSave={async () => {
              if (!editingRoutine) return;
              try {
                await saveRoutine(editingRoutine);
                setEditingRoutine(null);
                addToast('Routine saved to library', 'success');
              } catch (error) {
                logError('InstructionalRoutinesManager.saveRoutine', error, {
                  routineId: editingRoutine.id,
                  routineName: editingRoutine.name,
                });
                addToast('Failed to save routine. Please try again.', 'error');
              }
            }}
            onCancel={() => setEditingRoutine(null)}
          />
        </Modal>
      )}
    </Modal>
  );
};
