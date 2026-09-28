import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Hourglass,
  Loader2,
  Lock,
  MonitorPlay,
  PlayCircle,
  XCircle,
} from 'lucide-react';
import { logError } from '@/utils/logError';
import {
  isQuestionClosedError,
  liveStudentScreen,
} from '@/utils/videoActivityLiveStudent';
import type {
  VideoActivityAnswer,
  VideoActivityCheckResult,
  VideoActivityPublicQuestion,
  VideoActivitySession,
} from '@/types';
import { FibAnswerInput, MaOptionList, McOptionList } from './QuestionOverlay';
import { questionOptions } from '@/utils/videoActivityOptions';
import { VideoActivityPeriodPausedOverlay } from './VideoActivityPeriodLockedScreen';

interface VideoActivityLiveStudentProps {
  session: VideoActivitySession;
  /** Public questions sorted by timestamp. */
  questions: VideoActivityPublicQuestion[];
  answers: VideoActivityAnswer[];
  checkAnswer: (
    questionId: string,
    answer: string
  ) => Promise<VideoActivityCheckResult>;
  submitAnswer: (
    questionId: string,
    answer: string,
    isCorrect?: boolean
  ) => Promise<void>;
  /** True when the caller handled a failed check (a shut class period). */
  onCheckError: (err: unknown) => boolean;
  /** View-only shares grade but never write. */
  readOnly: boolean;
  paused: boolean;
  /** Tab-away and unlock overlays from the app shell. */
  children?: React.ReactNode;
}

export const VideoActivityLiveStudent: React.FC<
  VideoActivityLiveStudentProps
> = ({
  session,
  questions,
  answers,
  checkAnswer,
  submitAnswer,
  onCheckError,
  readOnly,
  paused,
  children,
}) => {
  // Verdicts from this tab's checks; after a refresh the response's isCorrect stands in.
  const [results, setResults] = useState<
    Record<string, VideoActivityCheckResult>
  >({});
  // Answers the server accepted before the response snapshot caught up.
  const [pending, setPending] = useState<Record<string, string>>({});
  const [closedQuestionId, setClosedQuestionId] = useState<string | null>(null);

  // A new pacing step clears a local "closed" verdict, so a reopened question can be answered.
  const phaseKey = `${session.live?.currentQuestionId ?? ''}|${session.live?.questionPhase ?? ''}`;
  const [prevPhaseKey, setPrevPhaseKey] = useState(phaseKey);
  if (prevPhaseKey !== phaseKey) {
    setPrevPhaseKey(phaseKey);
    setClosedQuestionId(null);
  }

  const mergedAnswers = useMemo(() => {
    const extra = Object.entries(pending)
      .filter(([id]) => !answers.some((a) => a.questionId === id))
      .map(([questionId, answer]) => ({
        questionId,
        answer,
        answeredAt: 0,
        ...(results[questionId]
          ? { isCorrect: results[questionId].isCorrect }
          : {}),
      }));
    return extra.length > 0 ? [...answers, ...extra] : answers;
  }, [answers, pending, results]);

  const screen = liveStudentScreen(
    session,
    questions,
    mergedAnswers,
    closedQuestionId
  );

  const submit = async (
    question: VideoActivityPublicQuestion,
    answer: string
  ): Promise<string | null> => {
    let result: VideoActivityCheckResult;
    try {
      result = await checkAnswer(question.id, answer);
    } catch (err) {
      if (isQuestionClosedError(err)) {
        setClosedQuestionId(question.id);
        return null;
      }
      if (onCheckError(err)) return null;
      logError('VideoActivityLiveStudent.checkAnswer', err, {
        questionId: question.id,
      });
      return "Couldn't send your answer. Try again.";
    }
    setResults((prev) => ({ ...prev, [question.id]: result }));
    setPending((prev) => ({ ...prev, [question.id]: answer }));
    // The check already recorded the answer server-side; this write is a no-op backstop.
    if (!readOnly) {
      await submitAnswer(question.id, answer, result.isCorrect).catch(
        (err: unknown) =>
          logError('VideoActivityLiveStudent.submitAnswer', err, {
            questionId: question.id,
          })
      );
    }
    return null;
  };

  const questionNumber = (question: VideoActivityPublicQuestion) =>
    questions.findIndex((q) => q.id === question.id) + 1;

  let body: React.ReactNode;
  switch (screen.kind) {
    case 'waiting':
      body = (
        <StatusCard
          icon={<Hourglass className="w-10 h-10 text-brand-blue-primary" />}
          title="You're in."
          subtitle="Waiting for your teacher to start."
        />
      );
      break;
    case 'watch':
      body = (
        <StatusCard
          icon={<MonitorPlay className="w-10 h-10 text-brand-blue-primary" />}
          title="Watch the board."
        />
      );
      break;
    case 'ended':
      body = (
        <StatusCard
          icon={
            <Loader2 className="w-10 h-10 text-brand-blue-primary animate-spin" />
          }
          title="Finishing…"
        />
      );
      break;
    case 'question':
      body = (
        <LiveQuestionCard
          key={screen.question.id}
          question={screen.question}
          number={questionNumber(screen.question)}
          onSubmit={(answer) => submit(screen.question, answer)}
        />
      );
      break;
    case 'submitted':
      body = (
        <LockedAnswerCard
          question={screen.question}
          number={questionNumber(screen.question)}
          answer={screen.answer}
          banner={
            <Banner tone="neutral" icon={<Lock className="w-4 h-4" />}>
              Submitted, eyes on the board
            </Banner>
          }
        />
      );
      break;
    case 'revealed': {
      const { question, answer } = screen;
      if (!answer) {
        body = (
          <LockedAnswerCard
            question={question}
            number={questionNumber(question)}
            answer={null}
            banner={
              <Banner tone="neutral" icon={<Lock className="w-4 h-4" />}>
                You didn&apos;t answer this one
              </Banner>
            }
          />
        );
        break;
      }
      const local = results[question.id];
      const verdict = local?.isCorrect ?? answer.isCorrect;
      body = (
        <LockedAnswerCard
          question={question}
          number={questionNumber(question)}
          answer={answer.answer}
          verdict={verdict}
          correctAnswer={local?.correctAnswer ?? null}
          banner={
            verdict === undefined ? (
              <Banner tone="neutral" icon={<Lock className="w-4 h-4" />}>
                Your answer
              </Banner>
            ) : verdict ? (
              <Banner
                tone="positive"
                icon={<CheckCircle2 className="w-4 h-4" />}
              >
                Correct
              </Banner>
            ) : (
              <Banner tone="negative" icon={<XCircle className="w-4 h-4" />}>
                Incorrect
              </Banner>
            )
          }
        />
      );
      break;
    }
    case 'closed':
      body = (
        <StatusCard
          icon={<Lock className="w-10 h-10 text-slate-500" />}
          title="Question closed"
        />
      );
      break;
  }

  return (
    <div className="h-screen h-dvh overflow-hidden bg-slate-50 flex flex-col relative">
      {children}
      <div className="bg-white border-b border-slate-200 px-4 py-2 flex items-center gap-2 shrink-0">
        <PlayCircle
          className="w-4 h-4 text-brand-red-primary shrink-0"
          aria-hidden
        />
        <span className="text-slate-900 font-bold text-sm truncate">
          {session.activityTitle}
        </span>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto pb-8">
        <div
          className="min-h-full flex flex-col items-center justify-center p-4"
          aria-live="polite"
        >
          <div className="w-full max-w-xl">{body}</div>
        </div>
      </div>
      {paused && <VideoActivityPeriodPausedOverlay />}
    </div>
  );
};

// ─── Parts ─────────────────────────────────────────────────────────────────────

const StatusCard: React.FC<{
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
}> = ({ icon, title, subtitle }) => (
  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-6 py-10 flex flex-col items-center text-center gap-3">
    <span aria-hidden>{icon}</span>
    <h1 className="text-2xl font-black text-slate-900">{title}</h1>
    {subtitle && <p className="text-slate-600 text-base">{subtitle}</p>}
  </div>
);

const TONES = {
  neutral: 'bg-slate-100 border-slate-200 text-slate-700',
  positive: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  negative: 'bg-red-50 border-red-200 text-red-700',
} as const;

const Banner: React.FC<{
  tone: keyof typeof TONES;
  icon: React.ReactNode;
  children: React.ReactNode;
}> = ({ tone, icon, children }) => (
  <div className="px-5 pb-5">
    <div
      role="status"
      className={`flex items-center justify-center gap-2 text-sm font-bold py-2.5 rounded-xl border ${TONES[tone]}`}
    >
      <span aria-hidden>{icon}</span>
      {children}
    </div>
  </div>
);

const QuestionShell: React.FC<{
  question: VideoActivityPublicQuestion;
  number: number;
  children: React.ReactNode;
}> = ({ question, number, children }) => (
  <div className="w-full rounded-2xl border border-slate-200 shadow-sm overflow-hidden bg-white">
    <div className="bg-brand-blue-primary px-5 py-3">
      <span className="text-white text-xs font-bold uppercase tracking-wider">
        Question {number}
      </span>
    </div>
    <div className="px-5 pt-5 pb-3">
      <p className="text-base font-semibold text-slate-900 leading-snug">
        {question.text}
      </p>
      {question.type === 'MA' && (
        <p className="text-xs text-slate-500 mt-1">Select all that apply.</p>
      )}
    </div>
    {children}
  </div>
);

const splitMa = (answer: string): Set<string> =>
  new Set(answer.split('|').filter((s) => s.length > 0));

const noop = () => undefined;

const LiveQuestionCard: React.FC<{
  question: VideoActivityPublicQuestion;
  number: number;
  onSubmit: (answer: string) => Promise<string | null>;
}> = ({ question, number, onSubmit }) => {
  const type = question.type ?? 'MC';
  const options = useMemo(() => questionOptions(question), [question]);
  const [mcSelected, setMcSelected] = useState<string | null>(null);
  const [fibAnswer, setFibAnswer] = useState('');
  const [maSelected, setMaSelected] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const answer =
    type === 'MC'
      ? (mcSelected ?? '')
      : type === 'FIB'
        ? fibAnswer.trim()
        : Array.from(maSelected).sort().join('|');
  const canSubmit = !sending && answer.length > 0;

  const handleSubmit = () => {
    if (!canSubmit) return;
    setSending(true);
    setError(null);
    void onSubmit(answer).then((message) => {
      setSending(false);
      setError(message);
    });
  };

  return (
    <QuestionShell question={question} number={number}>
      {type === 'MC' && (
        <McOptionList
          options={options}
          selected={mcSelected}
          onSelect={setMcSelected}
          locked={sending}
          correctAnswer={null}
        />
      )}
      {type === 'FIB' && (
        <FibAnswerInput
          value={fibAnswer}
          onChange={setFibAnswer}
          onEnter={handleSubmit}
          locked={sending}
          graded={false}
          isCorrect={false}
          correctAnswer={null}
        />
      )}
      {type === 'MA' && (
        <MaOptionList
          options={options}
          selected={maSelected}
          onToggle={(option) =>
            setMaSelected((prev) => {
              const next = new Set(prev);
              if (next.has(option)) next.delete(option);
              else next.add(option);
              return next;
            })
          }
          locked={sending}
          correctAnswer={null}
        />
      )}
      {error && (
        <p role="alert" className="px-5 pb-3 text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="px-5 pb-5">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          aria-busy={sending}
          className="w-full bg-brand-blue-primary hover:bg-brand-blue-dark disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold rounded-xl py-3 text-base transition-colors shadow-sm"
        >
          {sending ? 'Sending…' : 'Submit'}
        </button>
      </div>
    </QuestionShell>
  );
};

const LockedAnswerCard: React.FC<{
  question: VideoActivityPublicQuestion;
  number: number;
  /** Null when the student missed it. */
  answer: string | null;
  verdict?: boolean;
  /** Known only in the tab that checked the answer. */
  correctAnswer?: string | null;
  banner: React.ReactNode;
}> = ({ question, number, answer, verdict, correctAnswer = null, banner }) => {
  const type = question.type ?? 'MC';
  const options = useMemo(() => questionOptions(question), [question]);
  const key = verdict === undefined ? null : correctAnswer;
  return (
    <QuestionShell question={question} number={number}>
      {answer !== null && type === 'MC' && (
        <McOptionList
          options={options}
          selected={answer}
          onSelect={noop}
          locked
          correctAnswer={key}
        />
      )}
      {answer !== null && type === 'FIB' && (
        <FibAnswerInput
          value={answer}
          onChange={noop}
          onEnter={noop}
          locked
          graded={verdict !== undefined}
          isCorrect={verdict === true}
          correctAnswer={key}
        />
      )}
      {answer !== null && type === 'MA' && (
        <MaOptionList
          options={options}
          selected={splitMa(answer)}
          onToggle={noop}
          locked
          correctAnswer={key}
        />
      )}
      {banner}
    </QuestionShell>
  );
};
