import React from 'react';
import { Modal } from '@/components/common/Modal';
import { RoutineGuideRoutine } from '@/types';
import { ROUTINE_GUIDE_INFO_FIELDS as SECTIONS } from '@/config/routineGuide';

export const RoutineInfoModal: React.FC<{
  routine: RoutineGuideRoutine;
  onClose: () => void;
}> = ({ routine, onClose }) => (
  <Modal isOpen onClose={onClose} title={routine.name} maxWidth="max-w-xl">
    <div className="space-y-5 pb-2">
      {SECTIONS.map((s) => {
        const text = routine.info?.[s.key]?.trim();
        if (!text) return null;
        return (
          <section key={s.key}>
            <h4 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-1.5">
              {s.label}
            </h4>
            <p className="text-base text-slate-800 leading-relaxed whitespace-pre-line">
              {text}
            </p>
          </section>
        );
      })}
    </div>
  </Modal>
);
