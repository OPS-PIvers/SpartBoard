import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, XCircle, ArrowRight, BookOpen } from 'lucide-react';
import { GuidedLearningPublicStep } from '@/types';
import { playableQuestion } from '../../utils/playableQuestion';

/** A question's answer key, shown only after Reveal answer is pressed. */
export interface QuestionAnswerKey {
  correctAnswer?: string;
  matchingPairs?: { left: string; right: string }[];
  sortingItems?: string[];
}

interface Props {
  step: GuidedLearningPublicStep;
  /** Called when answered; pass the answer and isCorrect */
  onAnswer: (answer: string | string[], isCorrect: boolean | null) => void;
  onContinue: () => void;
  /** Original step data (with answer key) — only present in teacher/player mode */
  correctAnswer?: string;
  correctMatchingPairs?: { left: string; right: string }[];
  correctSortingItems?: string[];
  studentMode?: boolean;
  /** Subs and the teacher's board: a Reveal answer button shows this key for the room. */
  revealKey?: QuestionAnswerKey;
  /** v2: an answer saved on an earlier visit; the question opens on it. */
  priorAnswer?: string | string[];
  /** v2: the recorded view offers Change answer. */
  allowChange?: boolean;
}

/** Matching answers are stored as `left:right`; split on the first colon. */
function matchingFrom(answer: string | string[] | undefined) {
  const out: Record<string, string> = {};
  if (!Array.isArray(answer)) return out;
  for (const a of answer) {
    const i = a.indexOf(':');
    if (i > 0) out[a.slice(0, i)] = a.slice(i + 1);
  }
  return out;
}

/** A saved answer as one line of text. */
function answerText(answer: string | string[]): string {
  if (typeof answer === 'string') return answer;
  return answer
    .map((a) => {
      const i = a.indexOf(':');
      return i < 0 ? a : `${a.slice(0, i)} → ${a.slice(i + 1)}`;
    })
    .join(', ');
}

export const QuestionInteraction: React.FC<Props> = ({
  step,
  onAnswer,
  onContinue,
  correctAnswer,
  correctMatchingPairs,
  correctSortingItems,
  studentMode = false,
  revealKey,
  priorAnswer,
  allowChange = false,
}) => {
  const { t } = useTranslation();
  const q = step.question;
  // Keyed by step, since one instance can serve consecutive questions.
  const [revealedStepId, setRevealedStepId] = useState<string | null>(null);
  const revealed = revealedStepId === step.id;
  // The teacher's Play passes the author's copy, so build the columns from either shape once.
  const [shown] = useState(() =>
    q ? playableQuestion(q, correctSortingItems) : undefined
  );
  const priorSorting =
    Array.isArray(priorAnswer) &&
    q?.type === 'sorting' &&
    priorAnswer.length === (shown?.sortingItems ?? []).length
      ? priorAnswer
      : null;
  const [selectedMC, setSelectedMC] = useState<string | null>(
    typeof priorAnswer === 'string' && priorAnswer ? priorAnswer : null
  );
  const [matchingAnswers, setMatchingAnswers] = useState<
    Record<string, string>
  >(() => matchingFrom(priorAnswer));
  const [sortingOrder, setSortingOrder] = useState<string[]>(
    priorSorting ?? shown?.sortingItems ?? []
  );
  const [submitted, setSubmitted] = useState(priorAnswer !== undefined);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  // The saved answer shown in the recorded view, until the learner changes it.
  const [recorded, setRecorded] = useState(priorAnswer);

  if (!q) return null;

  const grade = (): { answer: string | string[]; correct: boolean | null } => {
    if (q.type === 'multiple-choice') {
      return {
        answer: selectedMC ?? '',
        correct:
          !studentMode && correctAnswer ? selectedMC === correctAnswer : null,
      };
    }
    if (q.type === 'matching') {
      return {
        answer: Object.entries(matchingAnswers).map(([l, r]) => `${l}:${r}`),
        correct:
          !studentMode && correctMatchingPairs
            ? correctMatchingPairs.every(
                (pair) => matchingAnswers[pair.left] === pair.right
              )
            : null,
      };
    }
    if (q.type === 'sorting') {
      return {
        answer: sortingOrder,
        correct:
          !studentMode && correctSortingItems
            ? sortingOrder.every((item, i) => item === correctSortingItems[i])
            : null,
      };
    }
    return { answer: '', correct: null };
  };

  const handleSubmit = () => {
    const { answer, correct } = grade();
    setIsCorrect(correct);
    setRecorded(undefined);
    setSubmitted(true);
    onAnswer(answer, correct);
  };
  // A saved answer shows as recorded rather than graded again.
  const showRecorded = studentMode || recorded !== undefined;

  const canSubmit = (() => {
    if (q.type === 'multiple-choice') return selectedMC !== null;
    if (q.type === 'matching')
      return (shown?.matchingLeft ?? []).every((l) => matchingAnswers[l]);
    if (q.type === 'sorting') {
      const expected = q.sortingItems ?? [];
      return expected.length > 0 && sortingOrder.length === expected.length;
    }
    return true;
  })();

  return (
    <div
      className="w-full h-full flex items-center justify-center overflow-y-auto custom-scrollbar"
      style={{ padding: 'var(--gl-text-body, min(12px, 3cqmin))' }}
    >
      <div
        className="bg-slate-800/95 backdrop-blur-sm border border-white/20 rounded-2xl w-full shadow-xl max-h-full overflow-y-auto"
        style={{
          maxWidth: 'var(--gl-question-max-w, min(420px, 90cqw))',
          padding: 'min(14px, 3.5cqmin)',
        }}
      >
        <p
          className="text-white font-bold mb-4 leading-snug"
          style={{ fontSize: 'var(--gl-text-title, min(15px, 4cqmin))' }}
        >
          {q.text}
        </p>

        {!submitted ? (
          <>
            {/* Multiple Choice */}
            {q.type === 'multiple-choice' && (
              <div className="space-y-2">
                {(q.choices ?? []).map((choice) => (
                  <button
                    key={choice}
                    onClick={() => setSelectedMC(choice)}
                    className={`w-full text-left rounded-xl border transition-all active:scale-[0.98] ${
                      selectedMC === choice
                        ? 'border-indigo-400 bg-indigo-500/20 text-white shadow-lg shadow-indigo-500/10'
                        : 'border-white/10 bg-white/5 text-slate-300 hover:border-white/20 hover:bg-white/10'
                    }`}
                    style={{
                      padding: 'min(10px, 2.5cqmin) min(14px, 3.5cqmin)',
                      fontSize: 'var(--gl-text-body, min(13px, 3.5cqmin))',
                    }}
                  >
                    {choice}
                  </button>
                ))}
              </div>
            )}

            {/* Matching */}
            {q.type === 'matching' && (
              <div className="space-y-2">
                <p
                  className="text-slate-400 font-medium mb-2"
                  style={{
                    fontSize: 'var(--gl-text-small, min(11px, 2.8cqmin))',
                  }}
                >
                  Match each item on the left to its pair:
                </p>
                {(shown?.matchingLeft ?? []).map((left) => (
                  <div
                    key={left}
                    className="flex items-center"
                    style={{ gap: 'min(8px, 2cqmin)' }}
                  >
                    <span
                      className="text-slate-200 font-bold flex-1 bg-slate-700 rounded-lg truncate"
                      style={{
                        padding: 'min(6px, 1.5cqmin) min(10px, 2.5cqmin)',
                        fontSize: 'var(--gl-text-body, min(12px, 3cqmin))',
                      }}
                    >
                      {left}
                    </span>
                    <span
                      className="text-slate-500 font-bold"
                      style={{
                        fontSize: 'var(--gl-text-body, min(12px, 3cqmin))',
                      }}
                    >
                      →
                    </span>
                    <select
                      value={matchingAnswers[left] ?? ''}
                      onChange={(e) =>
                        setMatchingAnswers((prev) => ({
                          ...prev,
                          [left]: e.target.value,
                        }))
                      }
                      className="flex-1 bg-slate-700 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/40 appearance-none"
                      style={{
                        padding: 'min(6px, 1.5cqmin) min(10px, 2.5cqmin)',
                        fontSize: 'var(--gl-text-body, min(12px, 3cqmin))',
                      }}
                    >
                      <option value="">-- select --</option>
                      {(shown?.matchingRight ?? []).map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            )}

            {/* Sorting */}
            {q.type === 'sorting' && (
              <div className="space-y-1.5">
                <p
                  className="text-slate-400 font-medium mb-2"
                  style={{
                    fontSize: 'var(--gl-text-small, min(11px, 2.8cqmin))',
                  }}
                >
                  Drag or use arrows to put items in the correct order:
                </p>
                {sortingOrder.map((item, idx) => (
                  <div
                    key={item}
                    className="flex items-center bg-slate-700 rounded-lg"
                    style={{
                      gap: 'min(8px, 2cqmin)',
                      padding: 'min(6px, 1.5cqmin) min(10px, 2.5cqmin)',
                    }}
                  >
                    <span
                      className="text-slate-400 font-mono font-bold text-center"
                      style={{
                        width: 'min(20px, 5cqmin)',
                        fontSize: 'var(--gl-text-small, min(11px, 2.8cqmin))',
                      }}
                    >
                      {idx + 1}
                    </span>
                    <span
                      className="flex-1 text-slate-200 font-bold truncate"
                      style={{
                        fontSize: 'var(--gl-text-body, min(12px, 3cqmin))',
                      }}
                    >
                      {item}
                    </span>
                    <div
                      className="flex flex-col"
                      style={{ gap: 'min(2px, 0.5cqmin)' }}
                    >
                      <button
                        disabled={idx === 0}
                        onClick={() => {
                          const arr = [...sortingOrder];
                          [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
                          setSortingOrder(arr);
                        }}
                        className="text-slate-400 hover:text-white disabled:opacity-30 leading-none transition-colors"
                        style={{
                          fontSize: 'var(--gl-text-small, min(10px, 2.5cqmin))',
                        }}
                        aria-label="Move up"
                      >
                        ▲
                      </button>
                      <button
                        disabled={idx === sortingOrder.length - 1}
                        onClick={() => {
                          const arr = [...sortingOrder];
                          [arr[idx + 1], arr[idx]] = [arr[idx], arr[idx + 1]];
                          setSortingOrder(arr);
                        }}
                        className="text-slate-400 hover:text-white disabled:opacity-30 leading-none transition-colors"
                        style={{
                          fontSize: 'var(--gl-text-small, min(10px, 2.5cqmin))',
                        }}
                        aria-label="Move down"
                      >
                        ▼
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold rounded-xl transition-all active:scale-95 shadow-lg shadow-indigo-500/20"
              style={{
                marginTop: 'min(16px, 4cqmin)',
                padding: 'var(--gl-text-small, min(10px, 2.5cqmin))',
                fontSize: 'var(--gl-text-body, min(14px, 3.5cqmin))',
              }}
            >
              Submit Answer
            </button>
          </>
        ) : (
          <div className="text-center">
            {showRecorded ? (
              <>
                <BookOpen
                  className="text-indigo-400 mx-auto mb-2"
                  style={{
                    width: 'min(40px, 10cqmin)',
                    height: 'min(40px, 10cqmin)',
                  }}
                />
                <p
                  className="font-bold mb-1 text-indigo-300"
                  style={{
                    fontSize: 'var(--gl-text-title, min(16px, 4cqmin))',
                  }}
                >
                  {t('glPlayer.question.recorded')}
                </p>
                {recorded !== undefined && answerText(recorded) && (
                  <p
                    className="text-slate-200"
                    style={{
                      fontSize: 'var(--gl-text-body, min(12px, 3cqmin))',
                    }}
                  >
                    {t('glPlayer.question.yourAnswer', {
                      answer: answerText(recorded),
                    })}
                  </p>
                )}
                {allowChange && (
                  <button
                    type="button"
                    onClick={() => {
                      setRecorded(undefined);
                      setSubmitted(false);
                    }}
                    className="rounded-lg border border-white/15 bg-white/5 text-slate-200 font-semibold hover:bg-white/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/90"
                    style={{
                      marginTop: 'min(8px, 2cqmin)',
                      padding: 'min(6px, 1.5cqmin) min(12px, 3cqmin)',
                      fontSize: 'var(--gl-text-small, min(12px, 3cqmin))',
                    }}
                  >
                    {t('glPlayer.question.change')}
                  </button>
                )}
              </>
            ) : isCorrect ? (
              <>
                <CheckCircle2
                  className="text-emerald-400 mx-auto mb-2"
                  style={{
                    width: 'min(40px, 10cqmin)',
                    height: 'min(40px, 10cqmin)',
                  }}
                />
                <p
                  className="font-bold mb-1 text-emerald-400"
                  style={{
                    fontSize: 'var(--gl-text-title, min(16px, 4cqmin))',
                  }}
                >
                  Correct!
                </p>
              </>
            ) : (
              <>
                <XCircle
                  className="text-red-400 mx-auto mb-2"
                  style={{
                    width: 'min(40px, 10cqmin)',
                    height: 'min(40px, 10cqmin)',
                  }}
                />
                <p
                  className="font-bold mb-1 text-red-400"
                  style={{
                    fontSize: 'var(--gl-text-title, min(16px, 4cqmin))',
                  }}
                >
                  Not quite
                </p>
                {correctAnswer && (
                  <p
                    className="text-slate-400 font-medium mb-3"
                    style={{
                      fontSize: 'var(--gl-text-body, min(12px, 3cqmin))',
                    }}
                  >
                    Correct answer:{' '}
                    <span className="text-white">{correctAnswer}</span>
                  </p>
                )}
              </>
            )}
            <button
              onClick={onContinue}
              className="flex items-center mx-auto bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl transition-all active:scale-95 shadow-lg shadow-indigo-500/20"
              style={{
                marginTop: 'var(--gl-text-body, min(12px, 3cqmin))',
                padding: 'min(8px, 2cqmin) min(16px, 4cqmin)',
                gap: 'min(6px, 1.5cqmin)',
                fontSize: 'var(--gl-text-body, min(14px, 3.5cqmin))',
              }}
            >
              Continue
              <ArrowRight
                style={{
                  width: 'min(16px, 4cqmin)',
                  height: 'min(16px, 4cqmin)',
                }}
              />
            </button>
          </div>
        )}
        {revealKey && (
          <div
            className="border-t border-white/10 text-left"
            style={{
              marginTop: 'min(14px, 3.5cqmin)',
              paddingTop: 'min(10px, 2.5cqmin)',
            }}
          >
            <button
              type="button"
              aria-expanded={revealed}
              onClick={() => setRevealedStepId(revealed ? null : step.id)}
              className="rounded-lg border border-white/15 bg-white/5 text-slate-200 font-semibold hover:bg-white/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/90"
              style={{
                padding: 'min(6px, 1.5cqmin) min(12px, 3cqmin)',
                fontSize: 'var(--gl-text-small, min(12px, 3cqmin))',
              }}
            >
              {revealed ? t('glPlayer.reveal.hide') : t('glPlayer.reveal.show')}
            </button>
            {revealed && (
              <div
                role="region"
                aria-label={t('glPlayer.reveal.title')}
                data-testid="gl-answer-key"
                className="rounded-xl bg-emerald-500/15 border border-emerald-400/40 text-white"
                style={{
                  marginTop: 'min(8px, 2cqmin)',
                  padding: 'min(10px, 2.5cqmin) min(12px, 3cqmin)',
                  fontSize: 'var(--gl-text-body, min(13px, 3.5cqmin))',
                }}
              >
                <p
                  className="font-bold text-emerald-200"
                  style={{ marginBottom: 'min(4px, 1cqmin)' }}
                >
                  {t('glPlayer.reveal.title')}
                </p>
                {q.type === 'multiple-choice' && (
                  <p>{revealKey.correctAnswer}</p>
                )}
                {q.type === 'matching' && (
                  <ul>
                    {(revealKey.matchingPairs ?? []).map((p) => (
                      <li key={p.left}>
                        {p.left} → {p.right}
                      </li>
                    ))}
                  </ul>
                )}
                {q.type === 'sorting' && (
                  <ol className="list-decimal list-inside">
                    {(revealKey.sortingItems ?? []).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ol>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
