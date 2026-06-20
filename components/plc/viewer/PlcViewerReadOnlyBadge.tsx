/**
 * PlcViewerReadOnlyBadge — the calm "Viewer — read only" affordance shown
 * where a content create/edit/delete control would otherwise render for a
 * viewer (Decision 3.2, W4-T10).
 *
 * Viewers can read everything in a PLC; this badge stands in for the missing
 * "+ Assign" / "Share" / "New note" CTAs so the surface reads intentionally
 * read-only rather than mysteriously empty. The rules layer (W4-T1
 * `plcCanEditContent`) hard-denies viewer writes — this is the matching
 * client-side affordance.
 *
 * It is a quiet pill (no looping animation, no brand-red alarm) per the
 * "calm confidence / purposeful restraint" design principles. Light-surface
 * palette (`text-slate-500/600`) — every PLC body renders on white/slate-50.
 * An optional `note` describes what's restricted for screen readers + on hover.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Eye } from 'lucide-react';

interface PlcViewerReadOnlyBadgeProps {
  /**
   * Optional surface-specific explanation (e.g. the assessments / notes / todos
   * variant). Surfaced as the title + an sr-only description. Falls back to the
   * generic read-only tooltip.
   */
  note?: string;
  className?: string;
}

export const PlcViewerReadOnlyBadge: React.FC<PlcViewerReadOnlyBadgeProps> = ({
  note,
  className,
}) => {
  const { t } = useTranslation();
  const label = t('plcDashboard.viewer.badge', {
    defaultValue: 'Viewer — read only',
  });
  const tooltip =
    note ??
    t('plcDashboard.viewer.badgeTooltip', {
      defaultValue:
        'You have viewer access to this PLC. You can read everything, but creating, editing, and deleting are turned off.',
    });
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xxs font-semibold uppercase tracking-wider text-slate-500 ${
        className ?? ''
      }`}
      title={tooltip}
    >
      <Eye className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
      {label}
      <span className="sr-only">{tooltip}</span>
    </span>
  );
};
