import React from 'react';
import { useTranslation } from 'react-i18next';
import { RotateCw } from 'lucide-react';

/** Portrait screens can't answer a whiteboard question (D10). */
export const RotateDeviceGate: React.FC<{ overlay?: boolean }> = ({
  overlay = false,
}) => {
  const { t } = useTranslation();
  return (
    <div
      role="status"
      className={`flex flex-col items-center justify-center gap-3 rounded-3xl border border-slate-200 px-6 py-12 text-center ${overlay ? 'absolute inset-0 z-10 bg-white' : 'bg-white/90'}`}
    >
      <RotateCw aria-hidden className="h-10 w-10 text-brand-blue-primary" />
      <h3 className="text-lg font-bold text-slate-900">
        {t('quizWhiteboard.rotate.title', 'Turn your device sideways')}
      </h3>
      <p className="text-sm text-slate-600">
        {t('quizWhiteboard.rotate.body', 'The whiteboard needs a wide screen.')}
      </p>
    </div>
  );
};
