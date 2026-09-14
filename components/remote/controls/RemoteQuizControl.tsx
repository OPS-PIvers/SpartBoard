// Phone remote for a live quiz: the private hands/idle list the board deliberately hides.

import React, { useMemo, useState } from 'react';
import { Clock, Hand } from 'lucide-react';
import {
  WidgetData,
  QuizConfig,
  QuizData,
  QuizResponse,
  QuizSession,
} from '@/types';
import { useDashboard } from '@/context/useDashboard';
import { useQuizSessionTeacher } from '@/hooks/useQuizSession';
import { useMonitorData } from '@/components/widgets/QuizWidget/components/monitor/useMonitorData';

interface RemoteQuizControlProps {
  widget: WidgetData;
  updateWidget: (id: string, updates: Partial<WidgetData>) => void;
}

// The remote never scores or shows questions, so the answer key is not fetched on a phone.
const EMPTY_QUIZ: QuizData = {
  id: 'remote',
  title: '',
  questions: [],
  createdAt: 0,
  updatedAt: 0,
};

const NoLiveQuiz: React.FC = () => (
  <p className="p-6 text-center text-sm text-slate-300">No live quiz</p>
);

const FlagsPanel: React.FC<{
  session: QuizSession;
  responses: QuizResponse[];
  config: QuizConfig;
  onClearHand: (key: string) => Promise<void>;
}> = ({ session, responses, config, onClearHand }) => {
  const { rosters } = useDashboard();
  const [clearing, setClearing] = useState<string | null>(null);
  const { byBucket } = useMonitorData(
    session,
    responses,
    EMPTY_QUIZ,
    config,
    rosters
  );

  const inProgress = byBucket.inProgress;
  const handRaiseOn = session.handRaiseEnabled === true;
  const hands = useMemo(
    () => (handRaiseOn ? inProgress.filter((s) => s.hand != null) : []),
    [inProgress, handRaiseOn]
  );
  const idle = useMemo(
    () =>
      inProgress.filter(
        (s) => (!handRaiseOn || s.hand == null) && s.idle != null
      ),
    [inProgress, handRaiseOn]
  );

  const handleClear = async (key: string) => {
    setClearing(key);
    try {
      await onClearHand(key);
    } catch (err) {
      console.error('[RemoteQuizControl] clearHandForStudent failed:', err);
    } finally {
      setClearing(null);
    }
  };

  if (hands.length === 0 && idle.length === 0) {
    return (
      <p className="p-6 text-center text-sm text-slate-300">
        No hands or idle students
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      {hands.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-bold uppercase tracking-widest text-slate-300">
            Raised hands ({hands.length})
          </h3>
          {hands.map((s) => (
            <div
              key={s.key}
              data-testid="remote-hand-row"
              className="flex items-center justify-between gap-3 rounded-2xl border border-blue-400/40 bg-blue-500/20 px-3 py-2"
            >
              <div className="flex min-w-0 items-center gap-2">
                <Hand className="w-4 h-4 shrink-0 text-blue-300" aria-hidden />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">
                    {s.name}
                  </p>
                  <p className="text-xs text-slate-300">
                    {`Raised hand${(s.hand ?? 0) >= 1 ? ` ${s.hand} min ago` : ''} · Q${s.onQuestion}`}
                  </p>
                </div>
              </div>
              <button
                onClick={() => void handleClear(s.key)}
                disabled={clearing === s.key}
                style={{ touchAction: 'manipulation' }}
                className="touch-manipulation shrink-0 rounded-xl border border-blue-400/60 px-3 py-2 text-sm font-bold text-blue-200 transition-all active:scale-95 disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-blue-400/60"
                aria-label={`Clear raised hand for ${s.name}`}
              >
                Clear
              </button>
            </div>
          ))}
        </section>
      )}

      {idle.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-bold uppercase tracking-widest text-slate-300">
            Idle ({idle.length})
          </h3>
          {idle.map((s) => (
            <div
              key={s.key}
              data-testid="remote-idle-row"
              className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-3 py-2"
            >
              <p className="truncate text-sm font-medium text-white">
                {s.name}
              </p>
              <span className="inline-flex shrink-0 items-center gap-1 text-xs tabular-nums text-amber-300">
                <Clock className="w-3.5 h-3.5" aria-hidden />
                {s.idle} min
              </span>
            </div>
          ))}
        </section>
      )}
    </div>
  );
};

export const RemoteQuizControl: React.FC<RemoteQuizControlProps> = ({
  widget,
}) => {
  const config = (widget.config ?? {}) as QuizConfig;
  const { session, responses, clearHandForStudent } = useQuizSessionTeacher(
    config.activeAssignmentId
  );

  if (!session || session.status === 'ended') return <NoLiveQuiz />;

  return (
    <FlagsPanel
      session={session}
      responses={responses}
      config={config}
      onClearHand={clearHandForStudent}
    />
  );
};
