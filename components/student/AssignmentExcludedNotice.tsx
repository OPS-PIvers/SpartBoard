// Shown on a direct-session entry when the student's pointer doc is marked
// `excluded` — the teacher skipped them for this assignment.

import React from 'react';
import { useTranslation } from 'react-i18next';
import { CircleSlash } from 'lucide-react';

export const AssignmentExcludedNotice: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div
      role="status"
      className="min-h-screen flex flex-col items-center justify-center gap-3 bg-slate-100 px-6 text-center"
    >
      <CircleSlash className="w-10 h-10 text-slate-400" aria-hidden="true" />
      <h1 className="text-xl font-bold text-slate-800">
        {t('studentAssignment.excludedTitle')}
      </h1>
      <p className="max-w-md text-sm text-slate-600">
        {t('studentAssignment.excludedBody')}
      </p>
    </div>
  );
};
