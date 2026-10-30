import React from 'react';
import { useTranslation } from 'react-i18next';
import { BookOpen, X } from 'lucide-react';
import { Z_INDEX } from '@/config/zIndex';

/** Toggle for the stimulus drawer; sits in the question header (D9). */
export const StimulusDrawerButton: React.FC<{
  open: boolean;
  onToggle: () => void;
}> = ({ open, onToggle }) => {
  const { t } = useTranslation();
  return (
    // no-tour-anchor: student quiz screen; tours walk teachers
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls="whiteboard-stimulus-drawer"
      className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-brand-blue-primary transition hover:bg-brand-blue-primary/10 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue-primary"
    >
      <BookOpen aria-hidden className="h-4 w-4" />
      {open
        ? t('quizWhiteboard.drawer.hide', 'Hide materials')
        : t('quizWhiteboard.drawer.show', 'Show materials')}
    </button>
  );
};

/**
 * Left drawer over the canvas. Stays mounted while closed so a video or PDF
 * keeps its place between opens.
 */
export const StimulusDrawer: React.FC<{
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}> = ({ open, onClose, children }) => {
  const { t } = useTranslation();
  return (
    <aside
      id="whiteboard-stimulus-drawer"
      aria-label={t('quizWhiteboard.drawer.label', 'Materials')}
      aria-hidden={!open}
      inert={!open}
      style={{ zIndex: Z_INDEX.drawer }}
      className={`fixed inset-y-0 left-0 flex w-[min(560px,92vw)] flex-col border-r shadow-2xl transition-transform duration-200 ease-out motion-reduce:transition-none ${
        open ? 'translate-x-0' : '-translate-x-full'
      } border-slate-200 bg-white`}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <div className="flex items-center justify-end px-3 pt-3">
        {/* no-tour-anchor: student quiz screen; tours walk teachers */}
        <button
          type="button"
          onClick={onClose}
          aria-label={t('quizWhiteboard.drawer.hide', 'Hide materials')}
          className="touch-target-expand rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-brand-blue-primary"
        >
          <X aria-hidden className="h-5 w-5" />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-6">
        {children}
      </div>
    </aside>
  );
};
