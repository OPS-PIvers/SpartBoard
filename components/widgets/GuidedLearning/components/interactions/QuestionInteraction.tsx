import React, { useState } from 'react';
import { CheckCircle2, XCircle, ArrowRight } from 'lucide-react';
import { GuidedLearningPublicStep } from '@/types';

interface Props {
  step: GuidedLearningPublicStep;
  /** Called when answered; pass the answer and isCorrect */
  onAnswer: (answer: string | string[], isCorrect: boolean) => void;
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
  const [isCorrect, setIsCorrect] = useState(false);

  if (!q) return null;

  const handleSubmit = () => {
    let correct = false;
    let answer: string | string[] = '';

    if (q.type === 'multiple-choice') {
      answer = selectedMC ?? '';
      correct = correctAnswer ? selectedMC === correctAnswer : false;
      if (!studentMode) correct = true; // teacher preview — always pass
    } else if (q.type === 'matching') {
      answer = Object.entries(matchingAnswers).map(([l, r]) => `${l}:${r}`);
      if (correctMatchingPairs) {
        correct = correctMatchingPairs.every(
          (pair) => matchingAnswers[pair.left] === pair.right
        );
      }
      if (!studentMode) correct = true;
    } else if (q.type === 'sorting') {
      answer = sortingOrder;
      if (correctSortingItems) {
        correct = sortingOrder.every(
          (item, i) => item === correctSortingItems[i]
        );
      }
      if (!studentMode) correct = true;
    }

    setIsCorrect(correct);
    setSubmitted(true);
    onAnswer(answer, correct);
  };

  const canSubmit = (() => {
    if (q.type === 'multiple-choice') return selectedMC !== null;
    if (q.type === 'matching')
      return (q.matchingLeft ?? []).every((l) => matchingAnswers[l]);
    return true;
  })();

  return (
    <div className="w-full h-full flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-800/95 backdrop-blur-sm border border-white/20 rounded-2xl p-5 max-w-sm w-full shadow-xl">
        <p className="text-white font-semibold text-sm mb-4 leading-snug">
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
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm border transition-colors ${
                      selectedMC === choice
                        ? 'border-indigo-400 bg-indigo-500/20 text-white'
                        : 'border-white/10 bg-white/5 text-slate-300 hover:border-white/20 hover:bg-white/10'
                    }`}
                  >
                    {choice}
                  </button>
                ))}
              </div>
            )}

            {/* Matching */}
            {q.type === 'matching' && (
              <div className="space-y-2">
                <p className="text-slate-400 text-xs mb-2">
                  Match each item on the left to its pair:
                </p>
                {(q.matchingLeft ?? []).map((left) => (
                  <div key={left} className="flex items-center gap-2">
                    <span className="text-slate-200 text-xs flex-1 bg-slate-700 rounded px-2 py-1">
                      {left}
                    </span>
                    <span className="text-slate-500">→</span>
                    <select
                      value={matchingAnswers[left] ?? ''}
                      onChange={(e) =>
                        setMatchingAnswers((prev) => ({
                          ...prev,
                          [left]: e.target.value,
                        }))
                      }
                      className="flex-1 bg-slate-700 border border-white/10 rounded px-2 py-1 text-white text-xs"
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
                <p className="text-slate-400 text-xs mb-2">
                  Drag or use arrows to put items in the correct order:
                </p>
                {sortingOrder.map((item, idx) => (
                  <div
                    key={item}
                    className="flex items-center gap-2 bg-slate-700 rounded-lg px-3 py-2"
                  >
                    <span className="text-slate-400 text-xs w-5 text-center">
                      {idx + 1}
                    </span>
                    <span className="flex-1 text-slate-200 text-xs">
                      {item}
                    </span>
                    <div className="flex flex-col gap-0.5">
                      <button
                        disabled={idx === 0}
                        onClick={() => {
                          const arr = [...sortingOrder];
                          [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
                          setSortingOrder(arr);
                        }}
                        className="text-slate-400 hover:text-white disabled:opacity-30 text-xs leading-none"
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
                        className="text-slate-400 hover:text-white disabled:opacity-30 text-xs leading-none"
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
              className="mt-4 w-full py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm rounded-xl transition-colors font-medium"
            >
              Submit Answer
            </button>
          </>
        ) : (
          <div className="text-center">
            {isCorrect ? (
              <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
            ) : (
              <XCircle className="w-10 h-10 text-red-400 mx-auto mb-2" />
            )}
            <p
              className={`font-bold text-base mb-1 ${isCorrect ? 'text-emerald-400' : 'text-red-400'}`}
            >
              {isCorrect ? 'Correct!' : 'Not quite'}
            </p>
            {!isCorrect && correctAnswer && (
              <p className="text-slate-400 text-xs mb-3">
                Correct answer:{' '}
                <span className="text-white">{correctAnswer}</span>
              </p>
            )}
            <button
              onClick={onContinue}
              className="flex items-center gap-1.5 mx-auto px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-xl transition-colors"
            >
              Continue
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
