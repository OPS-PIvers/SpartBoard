import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { UserX } from 'lucide-react';
import type { ClassRoster } from '@/types';
import { getLocalIsoDate } from '@/utils/localDate';
import { AbsentStudentsModal } from '@/components/common/AbsentStudentsModal';

interface AbsentButtonProps {
  /**
   * The roster whose absent list this button reads/writes. When null or
   * empty the button renders nothing — keeps widget headers tidy when no
   * class is selected.
   */
  roster: ClassRoster | null | undefined;
  className?: string;
  /**
   * Optional click override. When provided, the parent owns the modal state
   * and `AbsentButton` renders only the button (no modal). Used by Randomizer,
   * which hoists modal state so its empty-state branch can also trigger it.
   * When omitted, the button is fully self-contained.
   */
  onClick?: () => void;
}

/**
 * Compact "mark students absent" button styled to pair with the compact
 * variant of `ActiveClassChip` (white shell, slate border, brand-blue accent,
 * `min()`-based container-query scaling).
 *
 * Absence is persisted on the roster doc itself, so marking students absent
 * here syncs to every other widget pointed at the same class via the
 * Firestore listener — Stations and Randomizer share state automatically.
 */
export const AbsentButton: React.FC<AbsentButtonProps> = ({
  roster,
  className,
  onClick,
}) => {
  const { t } = useTranslation();
  const [internalOpen, setInternalOpen] = useState(false);

  const today = getLocalIsoDate();
  const absentCount = useMemo(() => {
    if (!roster) return 0;
    return roster.absent?.date === today ? roster.absent.studentIds.length : 0;
  }, [roster, today]);

  if (!roster || roster.students.length === 0) return null;

  const handleClick = onClick ?? (() => setInternalOpen(true));

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        title={t('widgets.random.absent.buttonLabel', {
          defaultValue: 'Mark absent students',
        })}
        aria-label={t('widgets.random.absent.ariaLabel', {
          defaultValue: 'Open attendance — {{count}} marked absent today',
          count: absentCount,
        })}
        className={`relative flex items-center rounded-xl bg-white border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-brand-blue-primary transition-colors cursor-pointer ${className ?? ''}`.trim()}
        style={{
          gap: 'min(6px, 1.5cqmin)',
          padding: 'min(6px, 1.5cqmin) min(10px, 2.5cqmin)',
          height: 'min(32px, 8cqmin)',
        }}
      >
        <UserX
          className="shrink-0"
          style={{
            width: 'min(14px, 4cqmin)',
            height: 'min(14px, 4cqmin)',
          }}
        />
        {absentCount > 0 && (
          <span
            className="font-black bg-red-500 text-white rounded-full leading-none tabular-nums shrink-0"
            style={{
              fontSize: 'min(10px, 3cqmin)',
              padding: 'min(2px, 0.6cqmin) min(6px, 1.6cqmin)',
            }}
          >
            {absentCount}
          </span>
        )}
      </button>

      {!onClick && (
        <AbsentStudentsModal
          isOpen={internalOpen}
          onClose={() => setInternalOpen(false)}
          roster={roster}
        />
      )}
    </>
  );
};
