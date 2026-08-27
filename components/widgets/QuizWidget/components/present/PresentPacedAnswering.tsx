import React, { useEffect, useState } from 'react';
import { QuizQuestion, QuizSession } from '@/types';
import { StimulusRenderer } from '@/components/quiz/QuizStimulusView';
import { resolveStimuli } from '@/utils/quizStimuli';

interface PresentPacedAnsweringProps {
  session: QuizSession;
  question: QuizQuestion;
  answered: number;
  total: number;
}

/**
 * Answer choices are deliberately absent: `shuffleAnswerOptions` defaults true
 * and shuffles per student, so a projected option list would contradict every
 * device in the room.
 */
export const PresentPacedAnswering: React.FC<PresentPacedAnsweringProps> = ({
  session,
  question,
  answered,
  total,
}) => {
  const [now, setNow] = useState(() => Date.now());
  const [anchor, setAnchor] = useState(() => ({
    id: question.id,
    at: Date.now(),
  }));
  // Anchored to the ticker's clock, not a fresh read — render stays pure.
  if (anchor.id !== question.id) setAnchor({ id: question.id, at: now });

  const limit = question.timeLimit ?? 0;
  const autoAt = session.autoProgressAt ?? null;
  const ticking = limit > 0 || autoAt != null;

  useEffect(() => {
    if (!ticking) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [ticking]);

  // Auto mode has a shared anchor on the session doc; teacher-paced mirrors the
  // student client's local countdown.
  const remaining = autoAt
    ? Math.max(0, Math.ceil((autoAt - now) / 1000))
    : limit > 0
      ? Math.max(0, limit - Math.floor((now - anchor.at) / 1000))
      : null;

  const stimuli = resolveStimuli(question.stimulusIds, session.stimuli);

  return (
    <>
      <p
        className="font-sans font-semibold text-white max-w-[80vw] leading-snug"
        style={{ fontSize: 'clamp(1.6rem, 5vw, 4.5rem)', textWrap: 'balance' }}
      >
        {question.text}
      </p>
      {stimuli.length > 0 && (
        <div
          className="w-full max-w-[70vw] flex flex-col"
          style={{ gap: '1.5vh', maxHeight: '40vh', overflow: 'hidden' }}
        >
          {stimuli.map((s) => (
            // No `onPlayCompleted` — projector playback never burns a play.
            <StimulusRenderer
              key={s.id}
              stimulus={s}
              enforcePlayLimit={false}
            />
          ))}
        </div>
      )}
      <div className="flex items-baseline" style={{ gap: '4vw' }}>
        {remaining != null && (
          <p
            className="font-sans font-bold text-white tabular-nums"
            style={{ fontSize: 'clamp(2rem, 6vw, 5rem)' }}
            aria-label="Time remaining"
          >
            {remaining}s
          </p>
        )}
        <p
          className="font-sans text-white/70 tabular-nums"
          style={{ fontSize: 'clamp(1rem, 2.4vw, 2.2rem)' }}
        >
          {answered} of {total} answered
        </p>
      </div>
    </>
  );
};
