import React from 'react';
import { Pause, Play } from 'lucide-react';
import type { PeriodAccess } from '@/types';
import { EXTEND_MS, type PeriodAccessActions } from '@/hooks/usePeriodAccess';
import { usePeriodRunner } from '@/hooks/usePeriodRunner';
import { PeriodAccessStrip } from '@/components/widgets/QuizWidget/components/monitor/PeriodAccessStrip';
import { ActionButton } from './ActionButton';

interface PeriodAccessControlsProps {
  periodAccess: Record<string, PeriodAccess>;
  actions: PeriodAccessActions;
  logTag: string;
}

/** One chip per period plus Start all / Pause all, for monitors without their own header slot. */
export const PeriodAccessControls: React.FC<PeriodAccessControlsProps> = ({
  periodAccess,
  actions,
  logTag,
}) => {
  const run = usePeriodRunner(periodAccess, logTag);
  return (
    <div
      className="flex flex-wrap items-center"
      style={{ gap: 'min(6px, 1.5cqmin)' }}
    >
      <div className="min-w-0 flex-1">
        <PeriodAccessStrip
          periodAccess={periodAccess}
          extendMs={EXTEND_MS}
          onStart={(key) => run(() => actions.startPeriod(key))}
          onPause={(key) => run(() => actions.pausePeriod(key))}
          onExtend={(key, by) => run(() => actions.extendPeriod(key, by))}
        />
      </div>
      <ActionButton
        variant="secondary"
        label="Start all"
        icon={Play}
        onClick={() => void run(actions.startAll)}
      />
      <ActionButton
        variant="secondary"
        label="Pause all"
        icon={Pause}
        onClick={() => void run(actions.pauseAll)}
      />
    </div>
  );
};
