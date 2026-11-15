// A video activity as its students play it, graded locally from the teacher's key; nothing is written.
import React, { useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { PlayCircle } from 'lucide-react';
import { db } from '@/config/firebase';
import type {
  VideoActivityNote,
  VideoActivityPublicQuestion,
  VideoActivityQuestion,
  VideoActivitySession,
} from '@/types';
import { VideoPlayer } from '@/components/videoActivity/VideoPlayer';
import { QuestionOverlay } from '@/components/videoActivity/QuestionOverlay';
import { NoteOverlay } from '@/components/videoActivity/NoteOverlay';
import { VideoActivityLiveStudent } from '@/components/videoActivity/VideoActivityLiveStudent';
import { previewCheckAnswer } from '@/utils/videoActivityPreviewCheck';
import { videoActivityAnswerRules } from '@/utils/videoActivityAnswerRules';
import { isLiveVideoActivitySession } from '@/utils/videoActivityLive';
import { normalizeVideoActivitySession } from '@/utils/videoActivityNormalize';

const noWrite = (): Promise<void> => Promise.resolve();

export const VideoActivityPreviewPlayer: React.FC<{
  session: VideoActivitySession;
  keyQuestions: VideoActivityQuestion[];
}> = ({ session: initial, keyQuestions }) => {
  const live = isLiveVideoActivitySession(initial);
  // A live session follows the teacher's pacing, so it keeps listening.
  const [liveSession, setLiveSession] = useState(initial);
  useEffect(() => {
    if (!live) return;
    return onSnapshot(
      doc(db, 'video_activity_sessions', initial.id),
      (snap) => {
        if (!snap.exists()) return;
        const next = normalizeVideoActivitySession(snap.id, snap.data());
        setLiveSession({
          ...next,
          publicQuestions: next.questionsInContent
            ? initial.publicQuestions
            : next.publicQuestions,
        });
      },
      (err) => console.error('[VideoActivityPreviewPlayer] live read', err)
    );
  }, [live, initial.id, initial.publicQuestions]);
  const session = live ? liveSession : initial;

  const questions = useMemo(
    () =>
      [...(session.publicQuestions ?? [])].sort(
        (a, b) => a.timestamp - b.timestamp
      ),
    [session.publicQuestions]
  );
  const rules = videoActivityAnswerRules(session);
  const check = (questionId: string, answer: string) =>
    Promise.resolve(
      previewCheckAnswer(keyQuestions, rules.showResult, questionId, answer)
    );

  const [answered, setAnswered] = useState<Set<string>>(() => new Set());
  const [active, setActive] = useState<VideoActivityPublicQuestion | null>(
    null
  );
  const [note, setNote] = useState<VideoActivityNote | null>(null);
  const [seek, setSeek] = useState<{ time: number; nonce: number } | null>(
    null
  );

  if (live) {
    return (
      <VideoActivityLiveStudent
        session={session}
        questions={questions}
        answers={[]}
        checkAnswer={check}
        submitAnswer={noWrite}
        onCheckError={() => false}
        readOnly
        paused={false}
      />
    );
  }

  const onAnswer = (_answer: string, isCorrect: boolean) => {
    if (!active) return;
    if (rules.requireCorrectAnswer && !isCorrect) {
      const idx = questions.findIndex((q) => q.id === active.id);
      setSeek({
        time: idx > 0 ? (questions[idx - 1]?.timestamp ?? 0) : 0,
        nonce: Date.now(),
      });
      setActive(null);
      return;
    }
    setAnswered((prev) => new Set(prev).add(active.id));
    setActive(null);
  };

  return (
    <div className="flex h-full flex-col bg-linear-to-b from-white to-slate-100">
      <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 py-2">
        <div className="flex items-center gap-2">
          <PlayCircle className="h-4 w-4 text-brand-red-primary" />
          <span className="max-w-48 truncate text-sm font-bold text-slate-900">
            {session.activityTitle}
          </span>
        </div>
        <span className="text-xs font-medium text-slate-500">
          {answered.size}/{questions.length} answered
        </span>
      </div>
      <div className="min-h-0 flex-1 px-4 py-4 md:px-6 md:py-6">
        <div className="mx-auto flex h-full w-full max-w-5xl items-center justify-center">
          <div className="relative aspect-video h-full w-auto max-w-full overflow-hidden rounded-2xl border border-slate-800 bg-black shadow-2xl">
            <VideoPlayer
              youtubeUrl={session.youtubeUrl ?? ''}
              questions={questions}
              answeredQuestionIds={answered}
              onQuestionTrigger={setActive}
              onVideoEnd={() => undefined}
              questionVisible={active !== null || note !== null}
              allowSkipping={session.settings?.allowSkipping ?? false}
              autoPlay={session.settings?.autoPlay ?? false}
              seekRequest={seek}
              clip={session.clip}
              notes={session.notes}
              onNoteTrigger={setNote}
            />
            {note && !active && (
              <div className="absolute inset-0 z-20 flex items-center justify-center overflow-y-auto bg-black/60 p-2 backdrop-blur-[1px] sm:p-4">
                <NoteOverlay note={note} onContinue={() => setNote(null)} />
              </div>
            )}
            {active && (
              <div className="absolute inset-0 z-20 flex items-center justify-center overflow-y-auto bg-black/60 p-2 backdrop-blur-[1px] sm:p-4">
                <QuestionOverlay
                  key={active.id}
                  question={active}
                  checkAnswer={(answer) => check(active.id, answer)}
                  onAnswer={onAnswer}
                  questionIndex={
                    questions.findIndex((q) => q.id === active.id) + 1
                  }
                  totalQuestions={questions.length}
                  requireCorrectAnswer={rules.requireCorrectAnswer}
                  showResult={rules.showResult}
                  revealAnswer={rules.revealAnswer}
                  optionSeed={null}
                />
              </div>
            )}
          </div>
        </div>
      </div>
      {!active && (
        <div className="w-full px-4 pb-4 pt-3 md:px-6 md:pb-6">
          <div className="mx-auto max-w-5xl rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
            {questions.length > 0
              ? 'Watch the video. Questions will appear on top of the video at each checkpoint.'
              : 'Watch the video to complete this activity.'}
          </div>
        </div>
      )}
    </div>
  );
};
