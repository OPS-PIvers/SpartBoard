import React, { useState } from 'react';
import { CheckCircle2, XCircle, ArrowRight, BookOpen } from 'lucide-react';
import { GuidedLearningPublicStep } from '@/types';

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
}

export const QuestionInteraction: React.FC<Props> = ({
  step,
  onAnswer,
  onContinue,
  correctAnswer,
  correctMatchingPairs,
  correctSortingItems,
  studentMode = false,
}) => {
  const q = step.question;
  const [selectedMC, setSelectedMC] = useState<string | null>(null);
  const [matchingAnswers, setMatchingAnswers] = useState<
    Record<string, string>
  >({});
  const [sortingOrder, setSortingOrder] = useState<string[]>(
    q?.sortingItems ?? []
  );
  const [submitted, setSubmitted] = useState(false);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);

  if (!q) return null;

  const handleSubmit = () => {
    let correct: boolean | null = null;
    let answer: string | string[] = '';

    if (q.type === 'multiple-choice') {
      answer = selectedMC ?? '';
      if (!studentMode) {
        correct = correctAnswer ? selectedMC === correctAnswer : null;
      }
    } else if (q.type === 'matching') {
      answer = Object.entries(matchingAnswers).map(([l, r]) => `${l}:${r}`);
      if (!studentMode) {
        correct = correctMatchingPairs
          ? correctMatchingPairs.every(
              (pair) => matchingAnswers[pair.left] === pair.right
            )
          : null;
      }
    } else if (q.type === 'sorting') {
      answer = sortingOrder;
      if (!studentMode) {
        correct = correctSortingItems
          ? sortingOrder.every((item, i) => item === correctSortingItems[i])
          : null;
      }
    }

    setIsCorrect(correct);
    setSubmitted(true);
    onAnswer(answer, correct);
  };

  const canSubmit = (() => {
    if (q.type === 'multiple-choice') return selectedMC !== null;
    if (q.type === 'matching')
      return (q.matchingLeft ?? []).every((l) => matchingAnswers[l]);
    if (q.type === 'sorting') {
      const expected = q.sortingItems ?? [];
      return expected.length > 0 && sortingOrder.length === expected.length;
    }
    return true;
  })();

  return (
    <div
      className="w-full h-full flex items-center justify-center overflow-y-auto custom-scrollbar"
      style={{ padding: 'min(16px, 4cqmin)' }}
    >
      <div
        className="bg-slate-800/95 backdrop-blur-sm border border-white/20 rounded-2xl w-full shadow-xl"
        style={{ maxWidth: 'min(420px, 90cqw)', padding: 'min(20px, 5cqmin)' }}
      >
        <p
          className="text-white font-bold mb-4 leading-snug"
          style={{ fontSize: 'min(15px, 4cqmin)' }}
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
                      fontSize: 'min(13px, 3.5cqmin)',
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
                  style={{ fontSize: 'min(11px, 2.8cqmin)' }}
                >
                  Match each item on the left to its pair:
                </p>
                {(q.matchingLeft ?? []).map((left) => (
                  <div
                    key={left}
                    className="flex items-center"
                    style={{ gap: 'min(8px, 2cqmin)' }}
                  >
                    <span
                      className="text-slate-200 font-bold flex-1 bg-slate-700 rounded-lg truncate"
                      style={{
                        padding: 'min(6px, 1.5cqmin) min(10px, 2.5cqmin)',
                        fontSize: 'min(12px, 3cqmin)',
                      }}
                    >
                      {left}
                    </span>
                    <span
                      className="text-slate-500 font-bold"
                      style={{ fontSize: 'min(12px, 3cqmin)' }}
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
                        fontSize: 'min(12px, 3cqmin)',
                      }}
                    >
                      <option value="">-- select --</option>
                      {(q.matchingRight ?? []).map((r) => (
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
                  style={{ fontSize: 'min(11px, 2.8cqmin)' }}
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
                        fontSize: 'min(11px, 2.8cqmin)',
                      }}
                    >
                      {idx + 1}
                    </span>
                    <span
                      className="flex-1 text-slate-200 font-bold truncate"
                      style={{ fontSize: 'min(12px, 3cqmin)' }}
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
                        style={{ fontSize: 'min(10px, 2.5cqmin)' }}
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
                        style={{ fontSize: 'min(10px, 2.5cqmin)' }}
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
                padding: 'min(10px, 2.5cqmin)',
                fontSize: 'min(14px, 3.5cqmin)',
              }}
            >
              Submit Answer
            </button>
          </>
        ) : (
          <div className="text-center">
            {studentMode ? (
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
                  style={{ fontSize: 'min(16px, 4cqmin)' }}
                >
                  Answer recorded
                </p>
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
                  style={{ fontSize: 'min(16px, 4cqmin)' }}
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
                  style={{ fontSize: 'min(16px, 4cqmin)' }}
                >
                  Not quite
                </p>
                {correctAnswer && (
                  <p
                    className="text-slate-400 font-medium mb-3"
                    style={{ fontSize: 'min(12px, 3cqmin)' }}
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
                marginTop: 'min(12px, 3cqmin)',
                padding: 'min(8px, 2cqmin) min(16px, 4cqmin)',
                gap: 'min(6px, 1.5cqmin)',
                fontSize: 'min(14px, 3.5cqmin)',
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
      </div>
    </div>
  );
};
