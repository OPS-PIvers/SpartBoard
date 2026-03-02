import React, { useState, useCallback, useRef, useEffect } from 'react';
import { X, Plus, Edit, Trash2, Sparkles } from 'lucide-react';
import { useInstructionalRoutines } from '@/hooks/useInstructionalRoutines';
import { LibraryManager } from '@/components/widgets/InstructionalRoutines/LibraryManager';
import { InstructionalRoutine } from '@/config/instructionalRoutines';
import { ConfirmDialog } from '@/components/widgets/InstructionalRoutines/ConfirmDialog';
import { getRoutineColorClasses } from '@/components/widgets/InstructionalRoutines/colorHelpers';
import { Toast } from '@/components/common/Toast';

interface InstructionalRoutinesManagerProps {
  onClose: () => void;
}

export const InstructionalRoutinesManager: React.FC<
  InstructionalRoutinesManagerProps
> = ({ onClose }) => {
  const { routines, deleteRoutine, saveRoutine } = useInstructionalRoutines();
  const [editingRoutine, setEditingRoutine] =
    useState<InstructionalRoutine | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    routineId: string;
    routineName: string;
  } | null>(null);
  const [message, setMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const showMessage = useCallback((type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => setMessage(null), 3000);
  }, []);

  return (
    <div className="fixed inset-0 z-modal-nested bg-black/50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-2xl h-[80vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-black text-sm uppercase tracking-widest text-slate-500">
            Instructional Routines Library
          </h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-colors"
            aria-label="Close"
            type="button"
          >
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50 custom-scrollbar">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
            <div>
              <p className="text-sm text-slate-500 font-medium">
                Manage global templates available to all teachers.
              </p>
            </div>
            <button
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
              className="px-4 py-2 bg-brand-blue-primary text-white rounded-xl text-xs font-black uppercase tracking-wider hover:bg-brand-blue-dark transition-all flex items-center gap-2 shadow-sm whitespace-nowrap"
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
                  className="bg-white border-2 border-slate-200 rounded-2xl p-4 flex items-center justify-between group hover:border-brand-blue-light transition-all shadow-sm"
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
                      onClick={() => setEditingRoutine(routine)}
                      className="p-2 hover:bg-blue-50 rounded-xl text-slate-400 hover:text-brand-blue-primary transition-colors flex items-center gap-1.5 text-xxs font-black uppercase tracking-wider"
                      title="Edit Routine"
                    >
                      <Edit size={16} />
                      <span className="hidden sm:inline">Edit</span>
                    </button>
                    <button
                      onClick={() => {
                        setDeleteConfirm({
                          routineId: routine.id,
                          routineName: routine.name,
                        });
                      }}
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
                <Sparkles className="w-12 h-12 mb-4 opacity-20" />
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
      </div>

      {/* Routine Editor Modal */}
      {editingRoutine && (
        <div className="fixed inset-0 z-modal-deep bg-black/50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-2xl h-[80vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col">
            <LibraryManager
              routine={editingRoutine}
              onChange={setEditingRoutine}
              onSave={async () => {
                await saveRoutine(editingRoutine);
                setEditingRoutine(null);
                showMessage('success', 'Routine saved to library');
              }}
              onCancel={() => setEditingRoutine(null)}
            />
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {deleteConfirm && (
        <ConfirmDialog
          title="Delete Routine"
          message={`Are you sure you want to delete "${deleteConfirm.routineName}"? This action cannot be undone.`}
          confirmLabel="Delete"
          cancelLabel="Cancel"
          onConfirm={async () => {
            try {
              await deleteRoutine(deleteConfirm.routineId);
              showMessage('success', 'Routine deleted successfully');
            } catch (error) {
              console.error('Failed to delete routine:', error);
              showMessage(
                'error',
                'Failed to delete routine. Please try again.'
              );
            } finally {
              setDeleteConfirm(null);
            }
          }}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}

      {/* Toast Notification */}
      {message && (
        <Toast
          message={message.text}
          type={message.type}
          onClose={() => setMessage(null)}
        />
      )}
    </div>
  );
};
