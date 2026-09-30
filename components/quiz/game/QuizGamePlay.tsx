import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { httpsCallable } from 'firebase/functions';
import {
  ArrowRight,
  Check,
  Flame,
  Hand,
  Loader2,
  Pause,
  Timer,
  Trophy,
  X as XIcon,
  Zap,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { functions } from '@/config/firebase';
import type {
  QuizGameState,
  QuizPublicQuestion,
  QuizResponse,
  QuizSession,
  StudentOverride,
} from '@/types';
import { useServerNow } from '@/hooks/useServerNow';
import { getServerNow } from '@/utils/serverTime';
import {
  shufflePublicQuestions,
  shuffleQuestionForStudent,
} from '@/utils/quizShuffle';
import {
  chosenQuestionIds,
  effectiveChooseCount,
  sectionOfQuestion,
  servedSectionQuestionIds,
  shuffleWithinSections,
} from '@/utils/quizSections';
import {
  applyTimeMultiplier,
  serveLocalizedQuestion,
} from '@/utils/quizOverrideServing';
import { applyLocalizedStrings } from '@/utils/quizLocalizedDisplay';
import { toCanonicalAnswer } from '@/utils/quizLocalizedAnswer';
import { resolveStimuli } from '@/utils/quizStimuli';
import { encodeMultiAnswer, parseMultiAnswer } from '@/utils/quizMultiAnswer';
import { cleanBlankAnswer } from '@/utils/quizFibBlanks';
import { formatRevealedAnswer } from '@/utils/quizFibAlternates';
import { rankOrdinal } from '@/utils/reviewLaunch';
import {
  EMPTY_GAME_STATE,
  findMyGameRank,
  formatGameClock,
  gamePlayOrder,
  nextGameQuestion,
  readGameClock,
} from '@/utils/quizGame';
import { CollapsibleStimuli } from '../QuizStimulusView';
import { FibMultiBlankInput, NumberedBlanksText } from '../FibMultiBlankInput';
import { MatchingResponseInput } from '../MatchingResponseInput';
import { OrderingResponseInput } from '../OrderingResponseInput';
import { loadGamePicks, saveGamePicks } from './gamePicks';

interface GameAnswerResult {
  isCorrect: boolean;
  points: number;
  speedBonus: number;
  streak: number;
  totalPoints: number;
  correctAnswer: string;
  firstTry: boolean;
}

type GameRefusal =
  | 'game-not-started'
  | 'game-paused'
  | 'game-over'
  | 'same-question-twice';

const checkAnswer = httpsCallable<
  { sessionId: string; questionId: string; answer: string; startedAt: number },
  GameAnswerResult
>(functions, 'checkQuizGameAnswerV1');

const refusalOf = (err: unknown): GameRefusal | null => {
  const details = (err as { details?: { reason?: unknown } } | null)?.details;
  const reason = details?.reason;
  return reason === 'game-not-started' ||
    reason === 'game-paused' ||
    reason === 'game-over' ||
    reason === 'same-question-twice'
    ? reason
    : null;
};

/** Newer of the server's score and the one this device just got back. */
const newerGame = (
  server: QuizGameState | undefined,
  local: QuizGameState | null
): QuizGameState => {
  if (!local) return server ?? EMPTY_GAME_STATE;
  if (!server) return local;
  return server.answered >= local.answered ? server : local;
};

const applyResult = (
  game: QuizGameState,
  questionId: string,
  answer: string,
  result: GameAnswerResult
): QuizGameState => ({
  points: result.totalPoints,
  streak: result.streak,
  answered: game.answered + 1,
  correct: game.correct + (result.isCorrect ? 1 : 0),
  firstTry:
    questionId in game.firstTry
      ? game.firstTry
      : { ...game.firstTry, [questionId]: result.isCorrect },
  lastCorrect: { ...game.lastCorrect, [questionId]: result.isCorrect },
  last: {
    questionId,
    answer,
    isCorrect: result.isCorrect,
    points: result.points,
    speedBonus: result.speedBonus,
    firstTry: result.firstTry,
    at: getServerNow(),
  },
});

function formatCorrectAnswer(
  raw: string,
  type: QuizPublicQuestion['type']
): string {
  if (type === 'Matching')
    return raw
      .split('|')
      .map((pair) => {
        const sep = pair.indexOf(':');
        return sep < 0
          ? pair
          : `${pair.slice(0, sep)} → ${pair.slice(sep + 1)}`;
      })
      .join(', ');
  if (type === 'Ordering' || type === 'MA') return raw.split('|').join(', ');
  if (type === 'FIB') return formatRevealedAnswer(raw);
  return raw;
}

const structuredComplete = (q: QuizPublicQuestion, answer: string): boolean => {
  const items =
    q.type === 'Matching' ? (q.matchingLeft ?? []) : (q.orderingItems ?? []);
  const segments = answer.split('|');
  if (segments.length !== items.length) return false;
  return q.type === 'Matching'
    ? segments.every((s) => {
        const sep = s.indexOf(':');
        return sep >= 0 && s.slice(sep + 1).length > 0;
      })
    : segments.every((s) => s.length > 0);
};

export interface QuizGamePlayProps {
  session: QuizSession;
  myResponse: QuizResponse;
  /** This student's served questions (bank draws applied), in session order. */
  servedQuestions: QuizPublicQuestion[];
  override?: StudentOverride;
  pin: string;
  onSetHandRaised: (raised: boolean) => Promise<void>;
  reportTabSwitch: () => Promise<number>;
}

/** The self-paced Review game on a student device (plan D17, D18, D22-D25). */
export const QuizGamePlay: React.FC<QuizGamePlayProps> = ({
  session,
  myResponse,
  servedQuestions,
  override,
  pin,
  onSetHandRaised,
  reportTabSwitch,
}) => {
  const { t } = useTranslation();
  const now = useServerNow(250);
  const clock = readGameClock(session, now);
  const seed = `${myResponse.studentUid}:game`;

  const passOne = useMemo(() => {
    if (session.shuffleQuestions !== true) return servedQuestions;
    return session.sections?.length
      ? shuffleWithinSections(servedQuestions, session.sections, (items, key) =>
          shufflePublicQuestions(items, `${seed}:${key}`)
        )
      : shufflePublicQuestions(servedQuestions, seed);
  }, [servedQuestions, session.shuffleQuestions, session.sections, seed]);
  const byId = useMemo(() => new Map(passOne.map((q) => [q.id, q])), [passOne]);
  const servedIds = useMemo(
    () => servedQuestions.map((q) => q.id),
    [servedQuestions]
  );

  // Choose-N picks (D18): stored on the device, rebuilt from answered questions on a new one.
  const [picks, setPicks] = useState<Record<string, string[]>>(() => {
    const stored = loadGamePicks(session.id, myResponse.studentUid);
    for (const section of session.sections ?? []) {
      if (stored[section.id]) continue;
      if (effectiveChooseCount(section, servedIds) === undefined) continue;
      const answered = servedSectionQuestionIds(section, servedIds).some((id) =>
        myResponse.answers.some((a) => a.questionId === id)
      );
      if (answered)
        stored[section.id] = chosenQuestionIds(
          section,
          myResponse.answers,
          servedIds
        );
    }
    return stored;
  });
  const order = useMemo(
    () =>
      gamePlayOrder(
        passOne.map((q) => q.id),
        session.sections,
        picks
      ),
    [passOne, session.sections, picks]
  );

  const [localGame, setLocalGame] = useState<QuizGameState | null>(null);
  const game = newerGame(myResponse.game, localGame);

  const [queue, setQueue] = useState<string[]>([]);
  const [cycles, setCycles] = useState(0);
  const [current, setCurrent] = useState<{
    id: string;
    startedAt: number;
  } | null>(null);
  // Questions the grader won't take (not in the key or the draw); never served again.
  const [dropped, setDropped] = useState<ReadonlySet<string>>(new Set());
  const [skipped, setSkipped] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    question: QuizPublicQuestion;
    result: GameAnswerResult;
  } | null>(null);
  const [seenSections, setSeenSections] = useState<Set<string>>(
    () =>
      new Set(
        (session.sections ?? [])
          .filter((s) => s.questionIds.some((id) => id in game.firstTry))
          .map((s) => s.id)
      )
  );
  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const running = clock.phase === 'running';

  // Pick the next question once the previous one is settled.
  const upcoming =
    !current && !feedback && running
      ? nextGameQuestion(
          order.filter((id) => id !== skipped && !dropped.has(id)),
          game,
          queue,
          cycles,
          seed
        )
      : null;
  const upcomingSection =
    upcoming?.questionId && !(upcoming.questionId in game.firstTry)
      ? sectionOfQuestion(session.sections, upcoming.questionId)
      : undefined;
  const divider =
    upcomingSection && !seenSections.has(upcomingSection.id)
      ? upcomingSection
      : undefined;
  if (upcoming?.questionId && !divider) {
    setQueue(upcoming.queue);
    setCycles(upcoming.cycles);
    setCurrent({ id: upcoming.questionId, startedAt: getServerNow() });
    setDraft('');
    setError(null);
  }

  const question = current ? byId.get(current.id) : undefined;
  const displayQuestion = useMemo(
    () =>
      question && session.shuffleAnswerOptions !== false
        ? shuffleQuestionForStudent(question, seed)
        : question,
    [question, session.shuffleAnswerOptions, seed]
  );

  const locale = override?.language;
  const shownQuestion = useMemo(
    () =>
      displayQuestion
        ? applyLocalizedStrings(
            displayQuestion,
            serveLocalizedQuestion(displayQuestion, locale)
          )
        : undefined,
    [displayQuestion, locale]
  );
  const canonical = (answer: string) =>
    displayQuestion
      ? toCanonicalAnswer(displayQuestion, locale, answer)
      : answer;

  const limitSec = question
    ? applyTimeMultiplier(question.timeLimit, override?.timeMultiplier)
    : 0;
  const questionLeftMs =
    current && limitSec > 0
      ? Math.max(0, current.startedAt + limitSec * 1000 - now)
      : null;

  const submit = useCallback(
    async (answer: string) => {
      if (!current || !question || submitting) return;
      setSubmitting(true);
      setError(null);
      try {
        const { data } = await checkAnswer({
          sessionId: session.id,
          questionId: current.id,
          answer,
          startedAt: current.startedAt,
        });
        setLocalGame((prev) =>
          applyResult(
            newerGame(myResponse.game, prev),
            current.id,
            answer,
            data
          )
        );
        setFeedback({ question, result: data });
        setSkipped(null);
        setCurrent(null);
      } catch (err) {
        const reason = refusalOf(err);
        const code = (err as { code?: unknown } | null)?.code;
        if (reason === 'same-question-twice') {
          setSkipped(current.id);
          setCurrent(null);
        } else if (code === 'functions/not-found') {
          const id = current.id;
          setDropped((prev) => new Set([...prev, id]));
          setCurrent(null);
        } else if (reason === null) {
          setError(
            t(
              'quizGame.saveError',
              "Couldn't send your answer. Check your connection and try again."
            )
          );
        }
      } finally {
        setSubmitting(false);
      }
    },
    [current, question, submitting, session.id, myResponse.game, t]
  );

  // A question's own timer running out sends what's there; empty counts as a miss (D22).
  const timedOut = questionLeftMs === 0;
  const timedOutFor = useRef<string | null>(null);
  const timeoutAnswer = displayQuestion
    ? toCanonicalAnswer(
        displayQuestion,
        locale,
        displayQuestion.type === 'FIB' ? cleanBlankAnswer(draft) : draft
      )
    : '';
  useEffect(() => {
    if (!timedOut || !running || !current) return;
    const key = `${current.id}:${current.startedAt}`;
    if (timedOutFor.current === key) return;
    timedOutFor.current = key;
    void submit(timeoutAnswer);
  }, [timedOut, running, current, submit, timeoutAnswer]);

  // Focus mode: report each tab exit to the teacher's monitor.
  const tabWarnings = session.tabWarningsEnabled !== false;
  useEffect(() => {
    if (!tabWarnings || !running) return;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden')
        void reportTabSwitch().catch(() => undefined);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [tabWarnings, running, reportTabSwitch]);

  const guards =
    session.blockCopyPaste === true
      ? {
          onCopy: (e: React.ClipboardEvent) => e.preventDefault(),
          onCut: (e: React.ClipboardEvent) => e.preventDefault(),
          onPaste: (e: React.ClipboardEvent) => e.preventDefault(),
          onDrop: (e: React.DragEvent) => e.preventDefault(),
        }
      : undefined;

  const handRaised = !!myResponse.handRaisedAt;
  const header = (
    <GameHeader
      clockLabel={formatGameClock(clock.remainingMs)}
      urgent={running && clock.remainingMs <= 30_000}
      points={game.points}
      streak={session.streakBonusEnabled ? game.streak : 0}
      handRaise={
        session.handRaiseEnabled
          ? {
              raised: handRaised,
              onToggle: () => void onSetHandRaised(!handRaised),
            }
          : undefined
      }
    />
  );

  if (clock.phase === 'over') {
    const mine = findMyGameRank(session.liveLeaderboard, {
      pin: pin || myResponse.pin,
      studentUid: myResponse.studentUid,
    });
    return (
      <GameShell>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
          <Trophy className="h-12 w-12 text-amber-500" aria-hidden />
          <h1 className="text-2xl font-black text-slate-900">
            {t('quizGame.over', "Time's up")}
          </h1>
          {mine && (
            <p
              data-testid="game-final-rank"
              className="text-5xl font-black text-brand-blue-primary tabular-nums"
            >
              {rankOrdinal(mine.rank)}
            </p>
          )}
          <div className="grid w-full max-w-xs grid-cols-2 gap-3">
            <Stat
              label={t('quizGame.points', 'Points')}
              value={Math.round(game.points)}
            />
            <Stat
              label={t('quizGame.correct', 'Correct')}
              value={`${game.correct}/${game.answered}`}
            />
          </div>
        </div>
      </GameShell>
    );
  }

  if (clock.phase === 'waiting') {
    return (
      <GameShell>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <Timer className="h-10 w-10 text-brand-blue-primary" aria-hidden />
          <h1 className="text-2xl font-black text-slate-900">
            {session.quizTitle}
          </h1>
          <p className="text-slate-600">
            {t('quizGame.waiting', 'Waiting for your teacher to start')}
          </p>
          <p className="text-4xl font-black tabular-nums text-slate-900">
            {formatGameClock(clock.remainingMs)}
          </p>
        </div>
      </GameShell>
    );
  }

  let body: React.ReactNode;
  if (clock.phase === 'paused') {
    body = (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <Pause className="h-10 w-10 text-slate-500" aria-hidden />
        <h2 className="text-xl font-black text-slate-900">
          {t('quizGame.paused', 'Paused')}
        </h2>
        {session.pauseMessage && (
          <p className="text-slate-600">{session.pauseMessage}</p>
        )}
      </div>
    );
  } else if (feedback) {
    body = (
      <GameFeedback
        result={feedback.result}
        correctAnswer={
          session.showCorrectAnswerToStudent !== false &&
          !feedback.result.isCorrect
            ? formatCorrectAnswer(
                feedback.result.correctAnswer,
                feedback.question.type
              )
            : null
        }
        streakOn={session.streakBonusEnabled === true}
        onNext={() => setFeedback(null)}
      />
    );
  } else if (divider) {
    body = (
      <SectionDivider
        title={divider.title}
        directions={divider.directions}
        questions={servedSectionQuestionIds(divider, servedIds)
          .map((id) => byId.get(id))
          .filter((q): q is QuizPublicQuestion => !!q)}
        chooseCount={
          picks[divider.id]
            ? undefined
            : effectiveChooseCount(divider, servedIds)
        }
        onContinue={(picked) => {
          if (picked) {
            const next = { ...picks, [divider.id]: picked };
            setPicks(next);
            saveGamePicks(session.id, myResponse.studentUid, next);
          }
          setSeenSections((prev) => new Set([...prev, divider.id]));
        }}
      />
    );
  } else if (shownQuestion && current) {
    body = (
      <GameQuestion
        key={`${current.id}:${current.startedAt}`}
        question={shownQuestion}
        stimuli={resolveStimuli(shownQuestion.stimulusIds, session.stimuli)}
        draft={draft}
        onDraft={setDraft}
        onSubmit={(answer) => void submit(canonical(answer))}
        submitting={submitting}
        error={error}
        questionLeftMs={questionLeftMs}
      />
    );
  } else {
    body = (
      <div className="flex flex-1 items-center justify-center p-6 text-center text-slate-600">
        {t('quizGame.allDone', 'You answered every question')}
      </div>
    );
  }

  return (
    <GameShell guards={guards}>
      {header}
      {body}
    </GameShell>
  );
};

const GameShell: React.FC<{
  children: React.ReactNode;
  guards?: React.HTMLAttributes<HTMLDivElement>;
}> = ({ children, guards }) => (
  <div
    {...guards}
    data-testid="quiz-game"
    className="h-screen [height:100dvh] overflow-y-auto overflow-x-hidden bg-slate-50"
  >
    <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col pb-8">
      {children}
    </div>
  </div>
);

const Stat: React.FC<{ label: string; value: React.ReactNode }> = ({
  label,
  value,
}) => (
  <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
      {label}
    </p>
    <p className="text-2xl font-black tabular-nums text-slate-900">{value}</p>
  </div>
);

const GameHeader: React.FC<{
  clockLabel: string;
  urgent: boolean;
  points: number;
  streak: number;
  handRaise?: { raised: boolean; onToggle: () => void };
}> = ({ clockLabel, urgent, points, streak, handRaise }) => {
  const { t } = useTranslation();
  return (
    <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
      <span
        data-testid="game-clock"
        aria-label={t('quizGame.timeLeft', 'Time left')}
        className={`inline-flex items-center gap-1.5 text-2xl font-black tabular-nums ${
          urgent ? 'text-brand-red-primary' : 'text-slate-900'
        }`}
      >
        <Timer className="h-5 w-5" aria-hidden />
        {clockLabel}
      </span>
      <span className="ml-auto text-right">
        <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-500">
          {t('quizGame.points', 'Points')}
        </span>
        <span
          data-testid="game-points"
          className="block text-xl font-black tabular-nums text-brand-blue-primary"
        >
          {Math.round(points)}
        </span>
      </span>
      {streak >= 2 && (
        <span className="inline-flex items-center gap-1 rounded-lg bg-amber-100 px-2 py-1 text-sm font-black text-amber-800">
          <Flame className="h-4 w-4" aria-hidden />
          {streak}
        </span>
      )}
      {handRaise && (
        <button
          type="button"
          onClick={handRaise.onToggle}
          aria-pressed={handRaise.raised}
          aria-label={
            handRaise.raised
              ? t('quizGame.lowerHand', 'Lower hand')
              : t('quizGame.raiseHand', 'Raise hand')
          }
          className={`rounded-lg border p-2 transition-colors ${
            handRaise.raised
              ? 'border-amber-400 bg-amber-100 text-amber-800'
              : 'border-slate-200 text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Hand className="h-5 w-5" aria-hidden />
        </button>
      )}
    </div>
  );
};

const GameQuestion: React.FC<{
  question: QuizPublicQuestion;
  stimuli: ReturnType<typeof resolveStimuli>;
  draft: string;
  onDraft: (next: string) => void;
  onSubmit: (answer: string) => void;
  submitting: boolean;
  error: string | null;
  questionLeftMs: number | null;
}> = ({
  question,
  stimuli,
  draft,
  onDraft,
  onSubmit,
  submitting,
  error,
  questionLeftMs,
}) => {
  const { t } = useTranslation();
  const multiBlank = question.type === 'FIB' && (question.blankCount ?? 0) >= 2;
  const answer =
    question.type === 'FIB' ? cleanBlankAnswer(draft) : draft.trim();
  const ready =
    question.type === 'Matching' || question.type === 'Ordering'
      ? structuredComplete(question, draft)
      : answer.length > 0;
  const choices = question.choices ?? [];
  const picked = new Set(parseMultiAnswer(draft));

  return (
    <div className="flex flex-1 flex-col gap-4 px-4 pt-4">
      {questionLeftMs !== null && (
        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200"
          aria-hidden
        >
          <div
            className="h-full bg-brand-blue-primary transition-[width] duration-200"
            style={{
              width: `${Math.min(100, (questionLeftMs / 1000 / Math.max(1, question.timeLimit)) * 100)}%`,
            }}
          />
        </div>
      )}
      {stimuli.length > 0 && <CollapsibleStimuli stimuli={stimuli} light />}
      <h2 className="text-xl font-black leading-snug text-slate-900 sm:text-2xl">
        {multiBlank ? (
          <NumberedBlanksText text={question.text} light />
        ) : (
          question.text
        )}
      </h2>

      {question.type === 'MC' && (
        <div className="grid gap-3 sm:grid-cols-2">
          {choices.map((choice) => (
            <button
              key={choice}
              type="button"
              disabled={submitting}
              onClick={() => onSubmit(choice)}
              className="min-h-[3.5rem] rounded-2xl border-2 border-slate-200 bg-white px-4 py-3 text-left font-bold text-slate-800 transition-colors hover:border-brand-blue-primary hover:bg-brand-blue-lighter disabled:opacity-60"
            >
              {choice}
            </button>
          ))}
        </div>
      )}

      {question.type === 'MA' && (
        <div className="grid gap-3 sm:grid-cols-2">
          {choices.map((choice) => {
            const on = picked.has(choice);
            return (
              <button
                key={choice}
                type="button"
                role="checkbox"
                aria-checked={on}
                disabled={submitting}
                onClick={() => {
                  const next = new Set(picked);
                  if (on) next.delete(choice);
                  else next.add(choice);
                  onDraft(encodeMultiAnswer(next, choices));
                }}
                className={`flex min-h-[3.5rem] items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left font-bold transition-colors disabled:opacity-60 ${
                  on
                    ? 'border-brand-blue-primary bg-brand-blue-lighter text-brand-blue-dark'
                    : 'border-slate-200 bg-white text-slate-800 hover:border-slate-300'
                }`}
              >
                <span
                  aria-hidden
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 ${
                    on
                      ? 'border-brand-blue-primary bg-brand-blue-primary text-white'
                      : 'border-slate-300'
                  }`}
                >
                  {on && <Check className="h-3.5 w-3.5" />}
                </span>
                {choice}
              </button>
            );
          })}
        </div>
      )}

      {question.type === 'FIB' &&
        (multiBlank ? (
          <FibMultiBlankInput
            count={question.blankCount ?? 0}
            value={draft}
            onChange={onDraft}
            onEnter={() => ready && onSubmit(answer)}
            disabled={submitting}
            light
            inputClassName="bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:border-brand-blue-light"
          />
        ) : (
          <input
            type="text"
            value={draft}
            autoFocus
            onChange={(e) => onDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && ready) onSubmit(answer);
            }}
            disabled={submitting}
            placeholder={t('quizGame.typeAnswer', 'Type your answer')}
            className="w-full rounded-2xl border-2 border-slate-300 bg-white px-5 py-4 text-lg text-slate-900 placeholder-slate-400 focus:border-brand-blue-light focus:outline-none"
          />
        ))}

      {question.type === 'Matching' && (
        <MatchingResponseInput
          question={question}
          savedAnswer={null}
          onChange={onDraft}
          disabled={submitting}
          light
        />
      )}
      {question.type === 'Ordering' && (
        <OrderingResponseInput
          question={question}
          savedAnswer={null}
          onChange={onDraft}
          disabled={submitting}
          light
        />
      )}

      {error && (
        <p
          role="alert"
          className="rounded-xl border border-brand-red-light bg-red-50 px-3 py-2 text-sm font-semibold text-brand-red-primary"
        >
          {error}
        </p>
      )}

      {question.type !== 'MC' && (
        <button
          type="button"
          onClick={() => onSubmit(answer || draft)}
          disabled={!ready || submitting}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-blue-primary py-4 text-lg font-black text-white shadow-lg transition-colors hover:bg-brand-blue-dark disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            t('quizGame.submit', 'Submit')
          )}
        </button>
      )}
      {question.type === 'MC' && submitting && (
        <Loader2
          className="mx-auto h-6 w-6 animate-spin text-brand-blue-primary"
          aria-label={t('quizGame.checking', 'Checking')}
        />
      )}
    </div>
  );
};

const GameFeedback: React.FC<{
  result: GameAnswerResult;
  correctAnswer: string | null;
  streakOn: boolean;
  onNext: () => void;
}> = ({ result, correctAnswer, streakOn, onNext }) => {
  const { t } = useTranslation();
  const nextRef = useRef<HTMLButtonElement>(null);
  useEffect(() => nextRef.current?.focus(), []);
  const partial = !result.isCorrect && result.points > 0;
  return (
    <div
      data-testid="game-feedback"
      className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center"
    >
      <span
        className={`flex h-20 w-20 items-center justify-center rounded-full ${
          result.isCorrect
            ? 'bg-emerald-100 text-emerald-700'
            : partial
              ? 'bg-amber-100 text-amber-700'
              : 'bg-red-100 text-brand-red-primary'
        }`}
      >
        {result.isCorrect ? (
          <Check className="h-10 w-10" aria-hidden />
        ) : (
          <XIcon className="h-10 w-10" aria-hidden />
        )}
      </span>
      <h2 className="text-3xl font-black text-slate-900">
        {result.isCorrect
          ? t('quizGame.right', 'Correct')
          : partial
            ? t('quizGame.partial', 'Partly right')
            : t('quizGame.wrong', 'Not quite')}
      </h2>
      <p className="text-2xl font-black tabular-nums text-brand-blue-primary">
        +{Math.round(result.points)}
      </p>
      {(result.speedBonus > 0 || (streakOn && result.streak >= 2)) && (
        <div className="flex flex-wrap justify-center gap-2 text-sm font-bold">
          {result.speedBonus > 0 && (
            <span className="inline-flex items-center gap-1 rounded-lg bg-sky-100 px-2 py-1 text-sky-800">
              <Zap className="h-4 w-4" aria-hidden />
              {t('quizGame.speed', {
                pct: result.speedBonus,
                defaultValue: 'Speed +{{pct}}%',
              })}
            </span>
          )}
          {streakOn && result.streak >= 2 && (
            <span className="inline-flex items-center gap-1 rounded-lg bg-amber-100 px-2 py-1 text-amber-800">
              <Flame className="h-4 w-4" aria-hidden />
              {t('quizGame.streak', {
                count: result.streak,
                defaultValue: '{{count}} in a row',
              })}
            </span>
          )}
        </div>
      )}
      {correctAnswer && (
        <p className="max-w-md text-slate-700">
          <span className="block text-xs font-bold uppercase tracking-wide text-slate-500">
            {t('quizGame.answerWas', 'Answer')}
          </span>
          <span className="font-bold">{correctAnswer}</span>
        </p>
      )}
      <button
        ref={nextRef}
        type="button"
        onClick={onNext}
        className="mt-2 flex w-full max-w-xs items-center justify-center gap-2 rounded-2xl bg-brand-blue-primary py-4 text-lg font-black text-white shadow-lg transition-colors hover:bg-brand-blue-dark"
      >
        {t('quizGame.next', 'Next')}
        <ArrowRight className="h-5 w-5" aria-hidden />
      </button>
    </div>
  );
};

const SectionDivider: React.FC<{
  title: string;
  directions?: string;
  questions: QuizPublicQuestion[];
  /** Set when the student still has to pick which questions to play. */
  chooseCount?: number;
  onContinue: (picked?: string[]) => void;
}> = ({ title, directions, questions, chooseCount, onContinue }) => {
  const { t } = useTranslation();
  const [picked, setPicked] = useState<string[]>([]);
  const needsPick = chooseCount !== undefined;
  const ready = !needsPick || picked.length === chooseCount;
  return (
    <div
      data-testid="game-section-divider"
      className="flex flex-1 flex-col gap-4 px-4 pt-6"
    >
      <h2 className="text-2xl font-black text-slate-900">{title}</h2>
      {directions && (
        <p className="whitespace-pre-line text-slate-700">{directions}</p>
      )}
      {needsPick && (
        <>
          <p className="text-sm font-bold text-slate-600">
            {t('quizGame.pickN', {
              count: chooseCount,
              picked: picked.length,
              defaultValue: 'Pick {{count}} ({{picked}} picked)',
            })}
          </p>
          <div className="flex flex-col gap-2">
            {questions.map((q) => {
              const on = picked.includes(q.id);
              const full = !on && picked.length >= (chooseCount ?? 0);
              return (
                <button
                  key={q.id}
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  disabled={full}
                  onClick={() =>
                    setPicked((prev) =>
                      on ? prev.filter((id) => id !== q.id) : [...prev, q.id]
                    )
                  }
                  className={`flex items-start gap-3 rounded-xl border-2 px-3 py-3 text-left text-sm font-semibold transition-colors disabled:opacity-40 ${
                    on
                      ? 'border-brand-blue-primary bg-brand-blue-lighter text-brand-blue-dark'
                      : 'border-slate-200 bg-white text-slate-800'
                  }`}
                >
                  <span
                    aria-hidden
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 ${
                      on
                        ? 'border-brand-blue-primary bg-brand-blue-primary text-white'
                        : 'border-slate-300'
                    }`}
                  >
                    {on && <Check className="h-3.5 w-3.5" />}
                  </span>
                  <span className="line-clamp-3">{q.text}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
      <button
        type="button"
        disabled={!ready}
        onClick={() => onContinue(needsPick ? picked : undefined)}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-blue-primary py-4 text-lg font-black text-white shadow-lg transition-colors hover:bg-brand-blue-dark disabled:cursor-not-allowed disabled:opacity-50"
      >
        {t('quizGame.start', 'Start')}
        <ArrowRight className="h-5 w-5" aria-hidden />
      </button>
    </div>
  );
};
