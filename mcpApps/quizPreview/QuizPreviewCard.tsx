// The quiz card Claude shows: every question as students see it, each with its own box to ask Claude for a change.
import React, { useMemo, useState } from 'react';
import {
  Check,
  ClipboardList,
  ExternalLink,
  KeyRound,
  Maximize2,
  RotateCcw,
} from 'lucide-react';
import { MathText } from '@/components/common/MathText';
import { AnswerImage } from '@/components/quiz/AnswerImage';
import {
  FibMultiBlankInput,
  NumberedBlanksText,
} from '@/components/quiz/FibMultiBlankInput';
import { MatchingResponseInput } from '@/components/quiz/MatchingResponseInput';
import { OrderingResponseInput } from '@/components/quiz/OrderingResponseInput';
import { StimulusRenderer } from '@/components/quiz/QuizStimulusView';
import { WrittenResponseEditor } from '@/components/quiz/WrittenResponseEditor';
import { toPublicQuestion } from '@/hooks/useQuizSession';
import type { QuizPublicQuestion, QuizQuestion, QuizStimulus } from '@/types';
import {
  MAX_ASK,
  questionMessage,
  rubricDraftMessage,
  wholeQuizMessage,
} from './messages';
import type { CardActions } from './cardActions';
import { RubricTable } from './RubricTable';
import type { QuestionView, QuizView } from './types';

// The student player's light-mode classes (components/quiz/QuizStudentApp.tsx).
const TYPE_LABEL: Record<string, string> = {
  MC: 'Multiple Choice',
  MA: 'Choose All That Apply',
  FIB: 'Fill in the Blank',
  Matching: 'Matching',
  Ordering: 'Ordering',
};
const TYPE_BADGE: Record<string, string> = {
  MC: 'bg-blue-100 text-blue-700',
  MA: 'bg-indigo-100 text-indigo-700',
  FIB: 'bg-amber-100 text-amber-700',
  Matching: 'bg-purple-100 text-purple-700',
  Ordering: 'bg-teal-100 text-teal-700',
};
const CHOICE =
  'w-full text-left px-5 py-4 rounded-2xl border-2 text-sm font-medium transition-all ';
const CHOICE_PICKED =
  'border-brand-blue-primary bg-brand-blue-lighter text-brand-blue-primary';
const CHOICE_IDLE =
  'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50';
const CHOICE_KEY = 'border-emerald-400 bg-emerald-50 text-emerald-800';
const FIB_INPUT =
  'bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:border-brand-blue-light';

const barButton =
  'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold transition-colors';
const barIdle = `${barButton} text-slate-200 hover:bg-white/10`;
const barActive = `${barButton} bg-white text-slate-900`;

export const QuizPreviewCard: React.FC<{
  view: QuizView;
  actions: CardActions;
  fullscreen: boolean;
  superseded: boolean;
}> = ({ view, actions, fullscreen, superseded }) => {
  const [showKey, setShowKey] = useState(false);
  const [run, setRun] = useState(0);
  const locked = superseded || view.shared_with_plc;

  // Shuffled once per card (and per Start over), like a student's attempt.
  const publicById = useMemo(() => {
    void run;
    return new Map(
      view.quiz.questions.map((q) => [q.id, toPublicQuestion(q)] as const)
    );
  }, [view.quiz, run]);
  const storedById = useMemo(
    () => new Map(view.quiz.questions.map((q) => [q.id, q] as const)),
    [view.quiz]
  );
  const stimuliById = useMemo(
    () => new Map((view.quiz.stimuli ?? []).map((s) => [s.id, s] as const)),
    [view.quiz]
  );
  const changed = view.questions.filter((q) => q.changed);
  const total = view.questions.length;
  const shownStimuli = new Set<string>();

  return (
    <div
      className={`flex flex-col bg-white font-sans ${fullscreen ? 'h-screen' : ''}`}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 bg-slate-900 px-3 py-2 text-white">
        <div className="flex min-w-0 flex-1 items-baseline gap-2">
          <span className="truncate text-sm font-bold">{view.title}</span>
          <span className="shrink-0 text-xs text-slate-300 tabular-nums">
            {total} {total === 1 ? 'question' : 'questions'} ·{' '}
            {view.total_points} pts
          </span>
        </div>
        <div className="flex items-center gap-1">
          {/* no-tour-anchor: this bar lives inside Claude, where tours never run */}
          <button
            type="button"
            className={showKey ? barActive : barIdle}
            onClick={() => setShowKey((v) => !v)}
            aria-pressed={showKey}
          >
            <KeyRound className="h-3.5 w-3.5" aria-hidden />
            Answer key
          </button>
          <span className="mx-1 h-5 w-px bg-slate-700" aria-hidden />
          {/* no-tour-anchor: inside Claude */}
          <button
            type="button"
            className={barIdle}
            onClick={() => setRun((n) => n + 1)}
            title="Clear answers"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            <span className="sr-only">Clear answers</span>
          </button>
          {!fullscreen && (
            // no-tour-anchor: inside Claude
            <button
              type="button"
              className={barIdle}
              onClick={actions.expand}
              title="Full screen"
            >
              <Maximize2 className="h-3.5 w-3.5" aria-hidden />
              <span className="sr-only">Full screen</span>
            </button>
          )}
          {/* no-tour-anchor: inside Claude */}
          <button
            type="button"
            className={barIdle}
            onClick={() => actions.open(view.open_url)}
            title="Open SpartBoard"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            <span className="sr-only">Open SpartBoard</span>
          </button>
        </div>
      </div>

      {superseded && (
        <p className="border-b border-slate-200 bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-700">
          A newer version is below.
        </p>
      )}
      {!superseded && (changed.length > 0 || view.removed_questions > 0) && (
        <p className="border-b border-brand-blue-lighter bg-brand-blue-lighter/60 px-4 py-2 text-xs font-semibold text-brand-blue-primary">
          {[
            changed.length > 0
              ? `Updated ${changed.map((q) => `Q${q.n}`).join(', ')}`
              : '',
            view.removed_questions > 0
              ? `${view.removed_questions} removed`
              : '',
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      )}
      {view.shared_with_plc && (
        <p className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-600">
          Shared with a PLC, so changes happen in SpartBoard.
        </p>
      )}

      <div
        className={`min-h-0 overflow-y-auto bg-linear-to-b from-white to-slate-50 pb-6 ${fullscreen ? 'flex-1' : 'max-h-[640px]'}`}
      >
        {view.questions.map((qv) => {
          const stored = qv.id ? storedById.get(qv.id) : undefined;
          const pub = qv.id ? publicById.get(qv.id) : undefined;
          if (!stored || !pub) return null;
          const stimuli = (stored.stimulusIds ?? []).flatMap((id) => {
            const s = stimuliById.get(id);
            if (!s || shownStimuli.has(id)) return [];
            shownStimuli.add(id);
            return [s];
          });
          return (
            <QuestionBlock
              key={`${run}:${qv.id}`}
              view={view}
              qv={qv}
              stored={stored}
              pub={pub}
              stimuli={stimuli}
              total={total}
              showKey={showKey}
              locked={locked}
              actions={actions}
            />
          );
        })}
        {!locked && (
          <div className="mx-auto max-w-2xl px-6 pt-4">
            <AskBox
              label={view.kind === 'quiz' ? 'The whole quiz' : 'The whole bank'}
              placeholder="For example: add two harder questions"
              onSend={(ask) => actions.ask(wholeQuizMessage(view, ask))}
            />
          </div>
        )}
      </div>
    </div>
  );
};

const QuestionBlock: React.FC<{
  view: QuizView;
  qv: QuestionView;
  stored: QuizQuestion;
  pub: QuizPublicQuestion;
  stimuli: QuizStimulus[];
  total: number;
  showKey: boolean;
  locked: boolean;
  actions: CardActions;
}> = ({ view, qv, stored, pub, stimuli, total, showKey, locked, actions }) => {
  const isFree = qv.type === 'free_response';
  return (
    <section
      aria-label={`Question ${qv.n}`}
      className="mx-auto max-w-2xl border-b border-slate-200 px-6 pb-6 pt-6 last:border-b-0"
    >
      <div className="mb-6 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">
            {qv.n} / {total}
          </span>
          {qv.changed && (
            <span className="rounded-sm bg-emerald-100 px-1.5 py-0.5 text-xxs font-bold uppercase tracking-wider text-emerald-700">
              Updated
            </span>
          )}
          <span className="text-xs text-slate-400">
            {qv.points} {qv.points === 1 ? 'pt' : 'pts'}
          </span>
        </div>
        <span
          className={`rounded-sm px-2 py-0.5 text-xs font-medium ${TYPE_BADGE[pub.type] ?? 'bg-rose-100 text-rose-700'}`}
        >
          {TYPE_LABEL[pub.type] ?? 'Free Response'}
        </span>
      </div>

      {stimuli.length > 0 && (
        <div className="mb-6 flex flex-col gap-3">
          {stimuli.map((s) => (
            <StimulusRenderer
              key={s.id}
              stimulus={s}
              light
              enforcePlayLimit={false}
            />
          ))}
        </div>
      )}

      <h2 className="mb-8 whitespace-pre-line text-xl font-bold leading-snug text-slate-900 wrap-break-word">
        {(pub.blankCount ?? 0) >= 2 ? (
          <NumberedBlanksText text={pub.text} light />
        ) : (
          <MathText text={pub.text} />
        )}
      </h2>

      <AnswerArea pub={pub} stored={stored} showKey={showKey} />

      {showKey && <KeyNote qv={qv} />}

      {isFree && (
        <RubricSection view={view} qv={qv} locked={locked} actions={actions} />
      )}

      {!locked && (
        <div className="mt-6">
          <AskBox
            label={`Question ${qv.n}`}
            placeholder="For example: make the wrong answers harder"
            onSend={(ask) => actions.ask(questionMessage(view, qv, ask))}
          />
        </div>
      )}
    </section>
  );
};

const AnswerArea: React.FC<{
  pub: QuizPublicQuestion;
  stored: QuizQuestion;
  showKey: boolean;
}> = ({ pub, stored, showKey }) => {
  const [answer, setAnswer] = useState('');
  const [picked, setPicked] = useState<Set<string>>(() => new Set());

  if (pub.type === 'MC' || pub.type === 'MA') {
    const multi = pub.type === 'MA';
    const correct = new Set(
      multi
        ? stored.correctAnswer.split('|').filter(Boolean)
        : [stored.correctAnswer]
    );
    const choices = pub.choices ?? [];
    return (
      <div className="space-y-3">
        {multi && (
          <p className="text-sm font-semibold text-slate-500">
            Choose all that apply
          </p>
        )}
        {choices.map((opt, i) => {
          const isPicked = multi ? picked.has(opt) : answer === opt;
          const isKey = showKey && correct.has(opt);
          const image =
            pub.choiceImages?.length === choices.length
              ? pub.choiceImages[i]
              : '';
          return (
            // no-tour-anchor: inside Claude
            <button
              key={opt}
              type="button"
              role={multi ? 'checkbox' : undefined}
              aria-checked={multi ? isPicked : undefined}
              onClick={() => {
                if (!multi) return setAnswer(opt);
                setPicked((prev) => {
                  const next = new Set(prev);
                  if (next.has(opt)) next.delete(opt);
                  else next.add(opt);
                  return next;
                });
              }}
              className={
                CHOICE +
                (isKey ? CHOICE_KEY : isPicked ? CHOICE_PICKED : CHOICE_IDLE)
              }
            >
              <span className="flex items-center gap-3">
                {multi && (
                  <span
                    aria-hidden="true"
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 ${
                      isPicked
                        ? 'border-current bg-current'
                        : 'border-current opacity-60'
                    }`}
                  >
                    {isPicked && (
                      <Check
                        className="h-3.5 w-3.5 text-white"
                        strokeWidth={3}
                      />
                    )}
                  </span>
                )}
                {image && <AnswerImage src={image} />}
                <span className="min-w-0 flex-1 wrap-break-word">
                  <MathText text={opt} />
                </span>
                {isKey && (
                  <Check
                    className="h-4 w-4 shrink-0 text-emerald-600"
                    strokeWidth={3}
                    aria-label="Correct"
                  />
                )}
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  if (pub.type === 'FIB') {
    return (pub.blankCount ?? 0) >= 2 ? (
      <FibMultiBlankInput
        count={pub.blankCount ?? 0}
        value={answer}
        onChange={setAnswer}
        onEnter={() => undefined}
        disabled={false}
        light
        inputClassName={FIB_INPUT}
      />
    ) : (
      // no-tour-anchor: inside Claude
      <input
        type="text"
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        placeholder="Type your answer…"
        aria-label="Your answer"
        className={`w-full rounded-2xl border-2 px-5 py-4 text-sm focus:outline-hidden focus:ring-0 ${FIB_INPUT}`}
      />
    );
  }

  if (pub.type === 'Matching') {
    return (
      <MatchingResponseInput
        question={pub}
        savedAnswer={null}
        onChange={setAnswer}
        light
        sideBank={false}
      />
    );
  }

  if (pub.type === 'Ordering') {
    return (
      <OrderingResponseInput
        question={pub}
        savedAnswer={null}
        onChange={setAnswer}
        light
        sideBank={false}
      />
    );
  }

  return (
    <WrittenResponseEditor
      questionKey={pub.id}
      value={answer}
      onChange={setAnswer}
      placeholder={pub.placeholder}
      minWords={stored.minWords}
      maxWords={stored.maxWords}
      enforceWordLimit={stored.enforceWordLimit}
      light
    />
  );
};

/** The correct answer for types the inputs can't mark in place. */
const KeyNote: React.FC<{ qv: QuestionView }> = ({ qv }) => {
  const rows: { label: string; value: string }[] = [];
  if (qv.type === 'fill_in_blank') {
    const blanks = qv.blanks?.length
      ? qv.blanks
      : [
          {
            answer: qv.correct_answer ?? '',
            accepted_alternates: qv.accepted_alternates,
          },
        ];
    blanks.forEach((b, i) =>
      rows.push({
        label: blanks.length > 1 ? `Blank ${i + 1}` : 'Answer',
        value: [b.answer, ...(b.accepted_alternates ?? [])].join(' or '),
      })
    );
  } else if (qv.type === 'matching') {
    (qv.pairs ?? []).forEach((p) =>
      rows.push({ label: p.term, value: p.match })
    );
  } else if (qv.type === 'ordering') {
    (qv.items_in_order ?? []).forEach((item, i) =>
      rows.push({ label: String(i + 1), value: item })
    );
  } else if (qv.type === 'free_response' && !qv.rubric) {
    rows.push({ label: 'Scoring', value: 'Scored by hand' });
  }
  if (qv.standards?.length)
    rows.push({ label: 'Standards', value: qv.standards.join(', ') });
  if (qv.learning_targets?.length)
    rows.push({ label: 'Targets', value: qv.learning_targets.join('; ') });
  if (rows.length === 0) return null;
  return (
    <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm">
      {rows.map((r, i) => (
        <React.Fragment key={i}>
          <dt className="font-bold text-emerald-900/70">{r.label}</dt>
          <dd className="font-semibold text-emerald-800">
            <MathText text={r.value} />
          </dd>
        </React.Fragment>
      ))}
    </dl>
  );
};

const RubricSection: React.FC<{
  view: QuizView;
  qv: QuestionView;
  locked: boolean;
  actions: CardActions;
}> = ({ view, qv, locked, actions }) => {
  const [status, setStatus] = useState('');
  if (qv.rubric) {
    return (
      <div className="mt-4 space-y-2">
        <p className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
          <ClipboardList className="h-4 w-4 text-slate-500" aria-hidden />
          {qv.rubric.title} · {qv.rubric.max_points} pts
          <span className="font-normal text-slate-500">
            {qv.rubric.shown_to_students ? '' : ' · hidden from students'}
          </span>
        </p>
        <RubricTable rubric={qv.rubric} />
      </div>
    );
  }
  if (locked) return null;
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      {/* no-tour-anchor: inside Claude */}
      <button
        type="button"
        className="flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition-colors hover:border-brand-blue-primary hover:text-brand-blue-primary"
        onClick={() => {
          setStatus('Sending…');
          void actions
            .ask(rubricDraftMessage(view, qv))
            .then((ok) => setStatus(ok ? 'Sent to Claude.' : 'Not sent.'));
        }}
      >
        <ClipboardList className="h-3.5 w-3.5" aria-hidden />
        Draft a rubric with Claude
      </button>
      {status && (
        <span role="status" className="text-xs text-slate-500">
          {status}
        </span>
      )}
    </div>
  );
};

const AskBox: React.FC<{
  label: string;
  placeholder: string;
  onSend: (ask: string) => Promise<boolean>;
}> = ({ label, placeholder, onSend }) => {
  const [text, setText] = useState('');
  const [status, setStatus] = useState('');
  const send = () => {
    const ask = text.trim();
    if (!ask) return;
    setStatus('Sending…');
    void onSend(ask).then((ok) => {
      setStatus(ok ? 'Sent to Claude.' : 'Not sent.');
      if (ok) setText('');
    });
  };
  return (
    <div>
      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-1.5 pl-3 focus-within:border-brand-blue-primary focus-within:ring-2 focus-within:ring-brand-blue-primary/20">
        <span className="shrink-0 text-xs font-bold text-slate-500">
          {label}
        </span>
        {/* no-tour-anchor: inside Claude */}
        <input
          type="text"
          value={text}
          maxLength={MAX_ASK}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
          placeholder={placeholder}
          aria-label={`Ask Claude to change ${label.toLowerCase()}`}
          className="min-w-0 flex-1 bg-transparent py-1.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none"
        />
        {/* no-tour-anchor: inside Claude */}
        <button
          type="button"
          onClick={send}
          disabled={!text.trim()}
          className="rounded-lg bg-brand-blue-dark px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-brand-blue-primary disabled:opacity-40"
        >
          Ask Claude
        </button>
      </div>
      {status && (
        <p role="status" className="mt-1 text-xs text-slate-500">
          {status}
        </p>
      )}
    </div>
  );
};
