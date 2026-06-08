/**
 * AssignDestinationModal — the library-row "Assign" chooser (Phase 2). Before
 * the existing class/period assign flow, the teacher first picks WHERE the quiz
 * goes:
 *
 *   SpartBoard Only  |  Google Classroom  |  Schoology
 *
 * - SpartBoard Only → today's assign flow unchanged (class/period/PLC/due date).
 * - Google Classroom → the same SpartBoard assign flow, then the partner-first
 *   "Assign to Google Classroom" course picker (only offered when the host
 *   enables it — admin-gated during rollout).
 * - Schoology → a how-to modal (the embedded LTI assign is done from inside
 *   Schoology, not via an API), handled by the host.
 *
 * Purely a picker — the host owns each destination's actual flow.
 */
import React from 'react';
import { GraduationCap, MonitorPlay, School, X } from 'lucide-react';
import { Modal } from '@/components/common/Modal';

export type AssignDestination = 'spartboard' | 'classroom' | 'schoology';

interface AssignDestinationModalProps {
  quizTitle: string;
  /** Show the Google Classroom option (admin-gated by the host). */
  showClassroom: boolean;
  onPick: (destination: AssignDestination) => void;
  onClose: () => void;
}

interface DestinationOption {
  id: AssignDestination;
  title: string;
  body: string;
  Icon: React.ComponentType<{ className?: string }>;
}

export const AssignDestinationModal: React.FC<AssignDestinationModalProps> = ({
  quizTitle,
  showClassroom,
  onPick,
  onClose,
}) => {
  const options: DestinationOption[] = [
    {
      id: 'spartboard',
      title: 'SpartBoard Only',
      body: 'Assign to your classes and share the join link from SpartBoard.',
      Icon: MonitorPlay,
    },
    ...(showClassroom
      ? [
          {
            id: 'classroom' as const,
            title: 'Google Classroom',
            body: 'Create the assignment, then post it to a Google Classroom course with grade sync.',
            Icon: GraduationCap,
          },
        ]
      : []),
    {
      id: 'schoology',
      title: 'Schoology',
      body: 'Add it from inside Schoology — we’ll show you how.',
      Icon: School,
    },
  ];

  return (
    <Modal
      isOpen
      onClose={onClose}
      ariaLabel="Choose where to assign"
      maxWidth="max-w-md"
      contentClassName=""
      customHeader={
        <div className="flex items-start justify-between px-5 pt-5 pb-3 border-b border-slate-100">
          <div className="flex items-start gap-3">
            <div className="shrink-0 w-9 h-9 rounded-lg bg-brand-blue-lighter/40 text-brand-blue-primary flex items-center justify-center">
              <School className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Assign quiz
              </h2>
              <p className="text-xs text-slate-500 mt-0.5 truncate max-w-[20rem]">
                {quizTitle}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      }
    >
      <div className="px-5 pb-5 pt-4 space-y-3">
        <p className="text-xs text-slate-600">
          Where do you want to assign this quiz?
        </p>
        <div className="space-y-2">
          {options.map((opt) => {
            const Icon = opt.Icon;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => onPick(opt.id)}
                className="w-full text-left rounded-xl border border-slate-200 bg-white px-4 py-3 transition-all hover:border-brand-blue-primary hover:bg-brand-blue-lighter/20 focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40"
              >
                <div className="flex items-start gap-3">
                  <div className="shrink-0 w-9 h-9 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center">
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-slate-900 text-sm">
                      {opt.title}
                    </h3>
                    <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                      {opt.body}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </Modal>
  );
};
