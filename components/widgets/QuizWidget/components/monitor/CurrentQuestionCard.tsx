import React, { useState } from 'react';
import { ArrowRight, Loader2, Play } from 'lucide-react';
import { QuizSession, QuizQuestion } from '@/types';
import { resolveStimuli } from '@/utils/quizStimuli';
import { CollapsibleStimuli } from '@/components/quiz/QuizStimulusView';

interface CurrentQuestionCardProps {
  session: QuizSession;
  currentQ: QuizQuestion | undefined;
  answered: number;
  total: number;
  doneCount: number;
  onAdvance: () => Promise<void>;
}

// Blue Lighter panel per the approved design — flat fill, no accent stripes.
export const CurrentQuestionCard: React.FC<CurrentQuestionCardProps> = ({
  session,
  currentQ,
  answered,
  total,
  doneCount,
  onAdvance,
}) => {
  const [advancing, setAdvancing] = useState(false);
  const handleAdvance = async () => {
    if (advancing) return;
    setAdvancing(true);
    try {
      await onAdvance();
    } finally {
      setAdvancing(false);
    }
  };

  const isSelfPaced = session.sessionMode === 'student';
  const isLast = session.currentQuestionIndex >= session.totalQuestions - 1;
  const pct = total > 0 ? Math.round((answered / total) * 100) : 0;

  if (session.status === 'ended') {
    return (
      <div
        className="bg-brand-blue-lighter rounded-xl"
        style={{ padding: 'min(16px, 3.5cqmin)' }}
      >
        <p
          className="font-sans font-bold text-brand-blue-dark"
          style={{ fontSize: 'min(16px, 6cqmin)' }}
        >
          Session ended
        </p>
        <p
          className="text-brand-gray-dark"
          style={{
            fontSize: 'min(13px, 4.5cqmin)',
            marginTop: 'min(4px, 1cqmin)',
          }}
        >
          {doneCount} of {total} students finished. Full results are in the
          archive.
        </p>
      </div>
    );
  }

  if (session.status === 'waiting') {
    return (
      <div
        className="bg-brand-blue-lighter rounded-xl flex flex-col"
        style={{ padding: 'min(16px, 3.5cqmin)', gap: 'min(10px, 2.5cqmin)' }}
      >
        <p
          className="font-sans font-bold text-brand-blue-dark"
          style={{ fontSize: 'min(16px, 6cqmin)' }}
        >
          Ready to start
        </p>
        <p
          className="text-brand-gray-dark"
          style={{ fontSize: 'min(13px, 4.5cqmin)' }}
        >
          {total} {total === 1 ? 'student has' : 'students have'} joined.
        </p>
        <button
          onClick={handleAdvance}
          disabled={advancing}
          className="self-start inline-flex items-center bg-brand-blue-primary hover:bg-brand-blue-light text-white font-sans font-semibold rounded-md transition-colors disabled:opacity-60"
          style={{
            gap: 'min(6px, 1.5cqmin)',
            padding: 'min(8px, 2cqmin) min(16px, 3.5cqmin)',
            fontSize: 'min(14px, 5cqmin)',
          }}
        >
          {advancing ? (
            <Loader2
              className="animate-spin"
              style={{
                width: 'min(16px, 5cqmin)',
                height: 'min(16px, 5cqmin)',
              }}
            />
          ) : (
            <Play
              style={{
                width: 'min(16px, 5cqmin)',
                height: 'min(16px, 5cqmin)',
              }}
            />
          )}
          Start quiz session
        </button>
      </div>
    );
  }

  if (isSelfPaced || !currentQ) {
    return (
      <div
        className="bg-brand-blue-lighter rounded-xl flex items-center justify-between"
        style={{
          padding: 'min(12px, 3cqmin) min(16px, 3.5cqmin)',
          gap: 'min(8px, 2cqmin)',
        }}
      >
        <p
          className="text-brand-gray-dark"
          style={{ fontSize: 'min(13px, 4.5cqmin)' }}
        >
          Self-paced · {session.totalQuestions} questions
        </p>
        <p
          className="font-sans font-semibold text-brand-blue-dark tabular-nums"
          style={{ fontSize: 'min(13px, 4.5cqmin)' }}
        >
          {doneCount} of {total} done
        </p>
      </div>
    );
  }

  return (
    <div
      className="bg-brand-blue-lighter rounded-xl flex flex-col"
      style={{ padding: 'min(16px, 3.5cqmin)', gap: 'min(10px, 2.5cqmin)' }}
    >
      <div
        className="flex items-baseline justify-between"
        style={{ gap: 'min(8px, 2cqmin)' }}
      >
        <span
          className="font-sans font-semibold text-brand-blue-primary uppercase tracking-wider"
          style={{ fontSize: 'min(11px, 3.5cqmin)' }}
        >
          Question {session.currentQuestionIndex + 1} of{' '}
          {session.totalQuestions}
        </span>
        <span
          className="text-brand-gray-primary tabular-nums"
          style={{ fontSize: 'min(11px, 3.5cqmin)' }}
        >
          {answered} of {total} answered
        </span>
      </div>
      <p
        className="font-sans font-semibold text-brand-blue-dark"
        style={{ fontSize: 'min(17px, 6cqmin)', lineHeight: 1.3 }}
      >
        {currentQ.text}
      </p>
      {/* Collapsed by default; expandable so the teacher can project the
          stimulus alongside the question. */}
      {(currentQ.stimulusIds?.length ?? 0) > 0 && (
        <CollapsibleStimuli
          stimuli={resolveStimuli(currentQ.stimulusIds, session.stimuli)}
          light
        />
      )}
      {session.revealedAnswers?.[currentQ.id] && (
        <p
          className="text-brand-gray-dark"
          style={{ fontSize: 'min(12px, 4cqmin)' }}
        >
          Revealed to class:{' '}
          <span className="font-semibold">
            {session.revealedAnswers[currentQ.id]}
          </span>
        </p>
      )}
      <div className="flex items-center" style={{ gap: 'min(12px, 3cqmin)' }}>
        <div
          className="flex-1 bg-white rounded-full overflow-hidden"
          style={{ height: 'min(6px, 1.5cqmin)' }}
        >
          <div
            className="h-full bg-brand-blue-primary rounded-full transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        {session.sessionMode !== 'auto' && (
          <button
            onClick={handleAdvance}
            disabled={advancing}
            className="inline-flex items-center bg-brand-blue-primary hover:bg-brand-blue-light text-white font-sans font-semibold rounded-md transition-colors disabled:opacity-60"
            style={{
              gap: 'min(6px, 1.5cqmin)',
              padding: 'min(7px, 1.8cqmin) min(14px, 3cqmin)',
              fontSize: 'min(13px, 4.5cqmin)',
            }}
          >
            {advancing ? (
              <Loader2
                className="animate-spin"
                style={{
                  width: 'min(15px, 4.5cqmin)',
                  height: 'min(15px, 4.5cqmin)',
                }}
              />
            ) : null}
            {isLast ? 'Finish' : 'Next'}
            {!advancing && !isLast && (
              <ArrowRight
                style={{
                  width: 'min(15px, 4.5cqmin)',
                  height: 'min(15px, 4.5cqmin)',
                }}
              />
            )}
          </button>
        )}
      </div>
    </div>
  );
};
