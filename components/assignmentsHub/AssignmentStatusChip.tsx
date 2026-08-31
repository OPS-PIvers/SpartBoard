// AssignmentStatusChip — the ONE shared per-student status chip (spec §5 D1, §4 Design Contract); unrelated to an assignment's own lifecycle status.

import React from 'react';
import { useTranslation } from 'react-i18next';

export type AssignmentStudentStatus =
  | 'not-started'
  | 'in-progress'
  | 'submitted'
  | 'graded';

const STATUS_STYLES: Record<AssignmentStudentStatus, string> = {
  'not-started': 'bg-slate-100 text-slate-500',
  'in-progress': 'bg-amber-50 text-amber-600',
  submitted: 'bg-brand-blue-lighter text-brand-blue-primary',
  graded: 'bg-emerald-50 text-emerald-600',
};

const STATUS_LABEL_KEYS: Record<
  AssignmentStudentStatus,
  { key: string; fallback: string }
> = {
  'not-started': {
    key: 'assignmentsHub.status.notStarted',
    fallback: 'Not started',
  },
  'in-progress': {
    key: 'assignmentsHub.status.inProgress',
    fallback: 'In progress',
  },
  submitted: { key: 'assignmentsHub.status.submitted', fallback: 'Submitted' },
  graded: { key: 'assignmentsHub.status.graded', fallback: 'Graded' },
};

export const AssignmentStatusChip: React.FC<{
  status: AssignmentStudentStatus;
}> = ({ status }) => {
  const { t } = useTranslation();
  const { key, fallback } = STATUS_LABEL_KEYS[status];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xxs font-bold ${STATUS_STYLES[status]}`}
    >
      {t(key, { defaultValue: fallback })}
    </span>
  );
};
