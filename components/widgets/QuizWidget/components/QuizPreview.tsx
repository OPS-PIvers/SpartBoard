/**
 * QuizPreview — interactive preview of a quiz in student-like view.
 * Teachers navigate through questions and see correct/incorrect highlighting.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  RotateCcw,
  Timer,
  CheckCircle2,
  XCircle,
  BookOpen,
  Eye,
} from 'lucide-react';
import { QuizData, QuizQuestion } from '@/types';
import { gradeAnswer } from '@/hooks/useQuizSession';
import { ScaledEmptyState } from '@/components/common/ScaledEmptyState';

/** Unbiased Fisher-Yates in-place shuffle (returns new array) */
function fisherYatesShuffle<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

interface QuizPreviewProps {
  quiz: QuizData;
  onBack: () => void;
}

export const QuizPreview: React.FC<QuizPreviewProps> = ({ quiz, onBack }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  const question = quiz.questions[currentIndex];

  const reset = useCallback(() => {
    setSelectedAnswer(null);
    setShowAnswer(false);
    const tl = question?.timeLimit ?? 0;
    setTimeLeft(tl > 0 ? tl : null);
  }, [question]);

  // Reset state when question changes
  useEffect(() => {
    setTimeout(reset, 0);
  }, [currentIndex, reset]);

  // Countdown timer
  useEffect(() => {
    if (timeLeft === null || showAnswer) return;
    if (timeLeft <= 0) {
      setTimeout(() => setShowAnswer(true), 0);
      return;
    }
    const id = setInterval(
      () => setTimeLeft((t) => (t !== null ? t - 1 : null)),
      1000
    );
    return () => clearInterval(id);
  }, [timeLeft, showAnswer]);

  // Shuffle once per question
  const shuffledOptions = useMemo(() => {
    if (question?.type !== 'MC') return [];
    const all = [
      question.correctAnswer,
      ...question.incorrectAnswers.filter(Boolean),
    ];
    return fisherYatesShuffle(all);
  }, [question]);

  if (!question) {
    return (
      <ScaledEmptyState
        icon={BookOpen}
        title="No questions found"
        subtitle="This quiz has no questions to preview."
        action={
          <button
            onClick={onBack}
            className="bg-brand-blue-primary text-white font-bold rounded-xl"
            style={{
              padding: 'min(8px, 2cqmin) min(16px, 4cqmin)',
              fontSize: 'min(12px, 3.5cqmin)',
              marginTop: 'min(12px, 3cqmin)',
            }}
          >
            Go Back
          </button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col h-full font-sans bg-brand-blue-lighter/10">
      {/* Header */}
      <div
        className="flex items-center gap-3 border-b border-brand-blue-primary/10 bg-brand-blue-lighter/30"
        style={{ padding: 'min(12px, 2.5cqmin) min(16px, 4cqmin)' }}
      >
        <button
          onClick={onBack}
          className="p-1.5 hover:bg-brand-blue-primary/10 rounded-lg transition-colors text-brand-blue-primary"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Eye className="w-3.5 h-3.5 text-brand-blue-primary" />
            <span
              className="font-bold text-brand-blue-dark truncate"
              style={{ fontSize: 'min(14px, 4.5cqmin)' }}
            >
              Preview
            </span>
          </div>
          <p
            className="text-brand-blue-primary/60 font-bold"
            style={{ fontSize: 'min(11px, 3.5cqmin)' }}
          >
            {currentIndex + 1} of {quiz.questions.length} · {quiz.title}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {timeLeft !== null && !showAnswer && (
            <div
              className={`flex items-center font-black px-3 py-1 rounded-full shadow-sm ${timeLeft <= 5 ? 'bg-brand-red-primary text-white animate-pulse' : 'bg-brand-blue-primary text-white'}`}
              style={{
                gap: 'min(4px, 1cqmin)',
                fontSize: 'min(12px, 3.5cqmin)',
              }}
            >
              <Timer
                style={{
                  width: 'min(14px, 4cqmin)',
                  height: 'min(14px, 4cqmin)',
                }}
              />
              {timeLeft}s
            </div>
          )}
          <button
            onClick={reset}
            className="p-2 hover:bg-brand-blue-primary/10 rounded-xl transition-all active:rotate-180 duration-500 text-brand-blue-primary"
            title="Reset question"
          >
            <RotateCcw
              style={{
                width: 'min(16px, 4.5cqmin)',
                height: 'min(16px, 4.5cqmin)',
              }}
            />
          </button>
        </div>
      </div>

      {/* Question Content */}
      <div
        className="flex-1 overflow-y-auto custom-scrollbar"
        style={{ padding: 'min(16px, 4cqmin)' }}
      >
        <div className="bg-white border-2 border-brand-blue-primary/10 rounded-2xl p-5 shadow-sm space-y-4">
          <div>
            <span
              className={`font-black rounded-md px-2 py-0.5 uppercase tracking-widest ${
                question.type === 'MC'
                  ? 'bg-blue-100 text-blue-700'
                  : question.type === 'FIB'
                    ? 'bg-amber-100 text-amber-700'
                    : question.type === 'Matching'
                      ? 'bg-purple-100 text-purple-700'
                      : 'bg-teal-100 text-teal-700'
              }`}
              style={{ fontSize: 'min(10px, 3cqmin)' }}
            >
              {question.type}
            </span>
            <p
              className="text-brand-blue-dark font-black leading-tight mt-3"
              style={{ fontSize: 'min(18px, 6cqmin)' }}
            >
              {question.text}
            </p>
          </div>

          <div className="pt-4 border-t border-brand-blue-primary/5">
            {/* Answer area by type */}
            {question.type === 'MC' && (
              <MCAnswerArea
                options={shuffledOptions}
                selectedAnswer={selectedAnswer}
                question={question}
                showAnswer={showAnswer}
                onSelect={(ans) => {
                  setSelectedAnswer(ans);
                  setShowAnswer(true);
                }}
              />
            )}

            {question.type === 'FIB' && (
              <FIBAnswerArea
                correctAnswer={question.correctAnswer}
                showAnswer={showAnswer}
                onReveal={() => setShowAnswer(true)}
              />
            )}

            {(question.type === 'Matching' || question.type === 'Ordering') && (
              <StructuredAnswerArea
                question={question}
                showAnswer={showAnswer}
                onReveal={() => setShowAnswer(true)}
              />
            )}
          </div>

          {/* Teacher reveal footer */}
          {showAnswer && (
            <div
              className="bg-emerald-50 border-2 border-emerald-500/20 rounded-2xl shadow-inner animate-in fade-in slide-in-from-bottom-2"
              style={{
                marginTop: 'min(16px, 4cqmin)',
                padding: 'min(12px, 3cqmin)',
              }}
            >
              <p
                className="text-emerald-800 font-black uppercase tracking-wider"
                style={{
                  fontSize: 'min(10px, 3cqmin)',
                  marginBottom: 'min(4px, 1cqmin)',
                }}
              >
                Authoritative Answer:
              </p>
              <p
                className="text-emerald-700 font-bold"
                style={{ fontSize: 'min(14px, 4.5cqmin)' }}
              >
                {question.correctAnswer}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Navigation Footer */}
      <div
        className="flex items-center justify-between border-t border-brand-blue-primary/10 bg-white"
        style={{ padding: 'min(12px, 3cqmin) min(16px, 4cqmin)' }}
      >
        <button
          onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
          disabled={currentIndex === 0}
          className="flex items-center bg-brand-blue-lighter hover:bg-brand-blue-primary/20 disabled:opacity-30 disabled:grayscale text-brand-blue-primary font-bold rounded-xl transition-all active:scale-90"
          style={{
            gap: 'min(6px, 1.5cqmin)',
            padding: 'min(8px, 2cqmin) min(14px, 3.5cqmin)',
            fontSize: 'min(12px, 3.5cqmin)',
          }}
        >
          <ArrowLeft
            style={{
              width: 'min(16px, 4.5cqmin)',
              height: 'min(16px, 4.5cqmin)',
            }}
          />
          PREV
        </button>

        <div className="hidden sm:flex" style={{ gap: 'min(6px, 1.5cqmin)' }}>
          {quiz.questions.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentIndex(i)}
              className={`rounded-full transition-all ${
                i === currentIndex
                  ? 'bg-brand-blue-primary w-6'
                  : 'bg-brand-blue-primary/20 hover:bg-brand-blue-primary/40 w-2'
              }`}
              style={{
                height: 'min(8px, 2cqmin)',
              }}
            />
          ))}
        </div>

        <button
          onClick={() =>
            setCurrentIndex((i) => Math.min(quiz.questions.length - 1, i + 1))
          }
          disabled={currentIndex === quiz.questions.length - 1}
          className="flex items-center bg-brand-blue-primary hover:bg-brand-blue-dark disabled:opacity-30 text-white font-bold rounded-xl shadow-md transition-all active:scale-90"
          style={{
            gap: 'min(6px, 1.5cqmin)',
            padding: 'min(8px, 2cqmin) min(14px, 3.5cqmin)',
            fontSize: 'min(12px, 3.5cqmin)',
          }}
        >
          NEXT
          <ArrowRight
            style={{
              width: 'min(16px, 4.5cqmin)',
              height: 'min(16px, 4.5cqmin)',
            }}
          />
        </button>
      </div>
    </div>
  );
};

// ─── Sub-components ────────────────────────────────────────────────────────────

const MCAnswerArea: React.FC<{
  options: string[];
  selectedAnswer: string | null;
  question: QuizQuestion;
  showAnswer: boolean;
  onSelect: (ans: string) => void;
}> = ({ options, selectedAnswer, question, showAnswer, onSelect }) => (
  <div className="flex flex-col" style={{ gap: 'min(10px, 2.5cqmin)' }}>
    {options.map((opt) => {
      const isSelected = selectedAnswer === opt;
      const isCorrect = gradeAnswer(question, opt);

      let variantClasses =
        'bg-brand-gray-lightest/50 border-brand-blue-primary/10 text-brand-blue-dark hover:bg-brand-blue-lighter/50 hover:border-brand-blue-primary/30';
      if (showAnswer) {
        if (isCorrect)
          variantClasses =
            'bg-emerald-50 border-emerald-500/40 text-emerald-800 shadow-[0_0_8px_rgba(16,185,129,0.15)]';
        else if (isSelected)
          variantClasses =
            'bg-brand-red-lighter/40 border-brand-red-primary/30 text-brand-red-dark opacity-80';
        else
          variantClasses =
            'bg-brand-gray-lightest/30 border-transparent text-brand-gray-primary opacity-40';
      }

      return (
        <button
          key={opt}
          onClick={() => !showAnswer && onSelect(opt)}
          className={`w-full text-left rounded-2xl border-2 transition-all font-bold group ${variantClasses}`}
          style={{
            padding: 'min(12px, 3cqmin) min(16px, 4cqmin)',
            fontSize: 'min(14px, 4.5cqmin)',
          }}
        >
          <div
            className="flex items-center"
            style={{ gap: 'min(12px, 3cqmin)' }}
          >
            <div className="flex-1 min-w-0">{opt}</div>
            {showAnswer && isCorrect && (
              <CheckCircle2
                className="shrink-0 text-emerald-600"
                style={{
                  width: 'min(20px, 5cqmin)',
                  height: 'min(20px, 5cqmin)',
                }}
              />
            )}
            {showAnswer && isSelected && !isCorrect && (
              <XCircle
                className="shrink-0 text-brand-red-primary"
                style={{
                  width: 'min(20px, 5cqmin)',
                  height: 'min(20px, 5cqmin)',
                }}
              />
            )}
          </div>
        </button>
      );
    })}
  </div>
);

const FIBAnswerArea: React.FC<{
  correctAnswer: string;
  showAnswer: boolean;
  onReveal: () => void;
}> = ({ showAnswer, onReveal }) => (
  <div className="flex flex-col" style={{ gap: 'min(12px, 3cqmin)' }}>
    <input
      type="text"
      disabled={showAnswer}
      className="w-full bg-white border-2 border-brand-blue-primary/10 rounded-2xl text-brand-blue-dark font-bold focus:outline-none focus:border-brand-blue-primary shadow-inner disabled:bg-brand-gray-lightest/50"
      style={{
        padding: 'min(12px, 3cqmin) min(16px, 4cqmin)',
        fontSize: 'min(14px, 4.5cqmin)',
      }}
      placeholder="Type the answer here..."
    />
    {!showAnswer && (
      <button
        onClick={onReveal}
        className="flex items-center gap-2 text-brand-blue-primary font-black uppercase tracking-widest hover:underline"
        style={{ fontSize: 'min(10px, 3cqmin)' }}
      >
        <Eye className="w-3.5 h-3.5" />
        Reveal Correct Answer
      </button>
    )}
  </div>
);

const StructuredAnswerArea: React.FC<{
  question: QuizQuestion;
  showAnswer: boolean;
  onReveal: () => void;
}> = ({ question, showAnswer, onReveal }) => {
  const pairs =
    question.type === 'Matching'
      ? question.correctAnswer.split('|').map((p) => {
          const [left, right] = p.split(':');
          return { left: left ?? '', right: right ?? '' };
        })
      : question.correctAnswer
          .split('|')
          .map((item, i) => ({ left: String(i + 1), right: item }));

  return (
    <div className="flex flex-col" style={{ gap: 'min(12px, 3cqmin)' }}>
      <div
        className="bg-brand-blue-lighter/30 border border-brand-blue-primary/5 rounded-2xl flex flex-col divide-y divide-brand-blue-primary/5 shadow-inner"
        style={{ padding: 'min(8px, 2cqmin)' }}
      >
        {pairs.map((pair, i) => (
          <div
            key={i}
            className="flex items-center"
            style={{
              gap: 'min(12px, 3cqmin)',
              padding: 'min(10px, 2.5cqmin)',
              fontSize: 'min(14px, 4.5cqmin)',
            }}
          >
            <span className="font-black text-brand-blue-primary w-6 shrink-0">
              {question.type === 'Ordering' ? `${pair.left}.` : pair.left}
            </span>
            <div className="flex-1 flex items-center gap-3">
              <span className="text-brand-blue-primary/30">→</span>
              <span
                className={`font-bold transition-all duration-500 ${
                  showAnswer
                    ? 'text-emerald-700'
                    : 'text-transparent bg-brand-blue-primary/5 rounded blur-[4px] select-none'
                }`}
              >
                {pair.right}
              </span>
            </div>
          </div>
        ))}
      </div>
      {!showAnswer && (
        <button
          onClick={onReveal}
          className="flex items-center gap-2 text-brand-blue-primary font-black uppercase tracking-widest hover:underline"
          style={{ fontSize: 'min(10px, 3cqmin)' }}
        >
          <Eye className="w-3.5 h-3.5" />
          Reveal Sequence
        </button>
      )}
    </div>
  );
};
