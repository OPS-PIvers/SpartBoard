/**
 * QuizManager — teacher's quiz library view.
 * Lists all saved quizzes with actions: Preview, Edit, Go Live, Results, Delete.
 */

import React, { useState } from 'react';
import {
  Plus,
  FileUp,
  Play,
  Edit2,
  Trash2,
  BarChart3,
  Eye,
  BookOpen,
  Loader2,
  AlertCircle,
  Clock,
  User,
  Zap,
  X,
} from 'lucide-react';
import { QuizMetadata, QuizSessionMode } from '@/types';

interface QuizManagerProps {
  quizzes: QuizMetadata[];
  loading: boolean;
  error: string | null;
  onImport: () => void;
  onEdit: (quiz: QuizMetadata) => void;
  onPreview: (quiz: QuizMetadata) => void;
  onGoLive: (quiz: QuizMetadata, mode: QuizSessionMode) => void;
  onResume: () => void;
  onEndSession: () => Promise<void>;
  onResults: (quiz: QuizMetadata) => void;
  onDelete: (quiz: QuizMetadata) => void;
  hasActiveSession: boolean;
  activeQuizId: string | null;
}

export const QuizManager: React.FC<QuizManagerProps> = ({
  quizzes,
  loading,
  error,
  onImport,
  onEdit,
  onPreview,
  onGoLive,
  onResume,
  onEndSession,
  onResults,
  onDelete,
  hasActiveSession,
  activeQuizId,
}) => {
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [selectedForLive, setSelectedForLive] = useState<QuizMetadata | null>(
    null
  );

  if (loading) {
    return (
      <div
        className="flex flex-col items-center justify-center h-full text-brand-blue-primary"
        style={{ gap: 'min(12px, 3cqmin)' }}
      >
        <Loader2
          className="animate-spin"
          style={{ width: 'min(32px, 8cqmin)', height: 'min(32px, 8cqmin)' }}
        />
        <span style={{ fontSize: 'min(14px, 4cqmin)', fontWeight: 500 }}>
          Loading quizzes…
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full font-sans relative">
      {/* Mode Selection Modal */}
      {selectedForLive && (
        <div className="absolute inset-0 z-50 bg-brand-blue-dark/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="bg-brand-blue-primary p-4 flex items-center justify-between">
              <div className="flex items-center gap-2 text-white">
                <Play className="w-5 h-5 fill-current" />
                <span className="font-black uppercase tracking-tight">
                  Go Live
                </span>
              </div>
              <button
                onClick={() => setSelectedForLive(null)}
                className="text-white/60 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="text-center">
                <p className="font-bold text-brand-blue-dark text-base truncate px-2">
                  {selectedForLive.title}
                </p>
                <p
                  className="text-brand-blue-primary/60 font-black uppercase tracking-widest mt-1"
                  style={{ fontSize: 'min(10px, 3cqmin)' }}
                >
                  Choose Session Mode
                </p>
              </div>

              <div className="grid gap-3">
                <ModeButton
                  icon={<User className="w-5 h-5" />}
                  title="Teacher-paced"
                  desc="You control when to move to the next question."
                  onClick={() => {
                    onGoLive(selectedForLive, 'teacher');
                    setSelectedForLive(null);
                  }}
                />
                <ModeButton
                  icon={<Zap className="w-5 h-5" />}
                  title="Auto-progress"
                  desc="Moves automatically once everyone has answered."
                  onClick={() => {
                    onGoLive(selectedForLive, 'auto');
                    setSelectedForLive(null);
                  }}
                />
                <ModeButton
                  icon={<Clock className="w-5 h-5" />}
                  title="Self-paced"
                  desc="Students move through questions at their own speed."
                  onClick={() => {
                    onGoLive(selectedForLive, 'student');
                    setSelectedForLive(null);
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div
        className="flex items-center justify-between border-b border-brand-blue-primary/10 bg-brand-blue-lighter/30"
        style={{ padding: 'min(12px, 2.5cqmin) min(16px, 4cqmin)' }}
      >
        <div className="flex items-center" style={{ gap: 'min(8px, 2cqmin)' }}>
          <div
            className="bg-brand-blue-primary text-white flex items-center justify-center rounded-lg"
            style={{ width: 'min(24px, 6cqmin)', height: 'min(24px, 6cqmin)' }}
          >
            <BookOpen
              style={{
                width: 'min(14px, 3.5cqmin)',
                height: 'min(14px, 3.5cqmin)',
              }}
            />
          </div>
          <div className="flex flex-col">
            <span
              className="font-bold text-brand-blue-dark leading-none"
              style={{ fontSize: 'min(14px, 4.5cqmin)' }}
            >
              Quiz Library
            </span>
            <span
              className="text-brand-blue-primary/70 font-medium"
              style={{ fontSize: 'min(11px, 3cqmin)' }}
            >
              {quizzes.length} saved {quizzes.length === 1 ? 'quiz' : 'quizzes'}
            </span>
          </div>
        </div>
        <button
          onClick={onImport}
          className="flex items-center bg-brand-blue-primary hover:bg-brand-blue-dark text-white font-bold rounded-xl transition-all shadow-sm active:scale-95"
          style={{
            gap: 'min(6px, 1.5cqmin)',
            padding: 'min(6px, 1.5cqmin) min(12px, 3cqmin)',
            fontSize: 'min(12px, 3.5cqmin)',
          }}
        >
          <Plus
            style={{ width: 'min(14px, 4cqmin)', height: 'min(14px, 4cqmin)' }}
          />
          New Quiz
        </button>
      </div>

      {/* Active Session Banner */}
      {hasActiveSession && (
        <div
          className="bg-emerald-50 border-y border-emerald-200 flex items-center justify-between"
          style={{
            padding: 'min(8px, 2cqmin) min(16px, 4cqmin)',
            gap: 'min(12px, 3cqmin)',
          }}
        >
          <div className="flex items-center gap-2">
            <Zap className="text-emerald-600 w-4 h-4 animate-pulse" />
            <span className="text-emerald-800 font-bold text-xs uppercase tracking-tight">
              Session in Progress
            </span>
          </div>
          <button
            onClick={onResume}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-lg transition-all active:scale-95 shadow-sm"
            style={{
              padding: 'min(4px, 1cqmin) min(12px, 3cqmin)',
              fontSize: 'min(11px, 3cqmin)',
            }}
          >
            RESUME MONITOR
          </button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div
          className="flex items-center bg-brand-red-lighter/40 border border-brand-red-primary/30 rounded-xl text-brand-red-dark"
          style={{
            margin: 'min(12px, 2.5cqmin) min(16px, 4cqmin) 0',
            padding: 'min(10px, 2.5cqmin)',
            gap: 'min(8px, 2cqmin)',
            fontSize: 'min(11px, 3.5cqmin)',
            fontWeight: 500,
          }}
        >
          <AlertCircle
            className="shrink-0"
            style={{
              width: 'min(16px, 4.5cqmin)',
              height: 'min(16px, 4.5cqmin)',
            }}
          />
          {error}
        </div>
      )}

      {/* Quiz list */}
      <div
        className="flex-1 overflow-y-auto custom-scrollbar"
        style={{ padding: 'min(16px, 4cqmin)' }}
      >
        {quizzes.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center h-full text-brand-blue-primary/40 py-12"
            style={{ gap: 'min(16px, 4cqmin)' }}
          >
            <div
              className="bg-brand-blue-lighter/50 p-6 rounded-full border-2 border-dashed border-brand-blue-primary/20"
              style={{ padding: 'min(24px, 6cqmin)' }}
            >
              <FileUp
                style={{
                  width: 'min(48px, 12cqmin)',
                  height: 'min(48px, 12cqmin)',
                }}
              />
            </div>
            <div className="text-center">
              <p
                className="font-bold text-brand-blue-primary"
                style={{ fontSize: 'min(15px, 5cqmin)' }}
              >
                No quizzes yet
              </p>
              <p
                className="text-brand-blue-primary/60 font-medium"
                style={{
                  fontSize: 'min(12px, 3.5cqmin)',
                  marginTop: 'min(4px, 1cqmin)',
                  maxWidth: '180px',
                }}
              >
                Import a CSV or Google Sheet to build your library
              </p>
            </div>
            <button
              onClick={onImport}
              className="flex items-center bg-brand-blue-primary hover:bg-brand-blue-dark text-white font-bold rounded-2xl transition-all shadow-md active:scale-95"
              style={{
                gap: 'min(8px, 2cqmin)',
                padding: 'min(10px, 2.5cqmin) min(20px, 5cqmin)',
                fontSize: 'min(14px, 4.5cqmin)',
              }}
            >
              <Plus
                style={{
                  width: 'min(18px, 4.5cqmin)',
                  height: 'min(18px, 4.5cqmin)',
                }}
              />
              Start Importing
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {quizzes.map((quiz) => (
              <div
                key={quiz.id}
                className="bg-white border border-brand-blue-primary/10 rounded-2xl shadow-sm hover:shadow-md hover:border-brand-blue-primary/20 transition-all group overflow-hidden"
                style={{ padding: 'min(12px, 3cqmin)' }}
              >
                {/* Quiz info */}
                <div
                  className="flex items-start justify-between"
                  style={{
                    gap: 'min(12px, 3cqmin)',
                    marginBottom: 'min(12px, 3cqmin)',
                  }}
                >
                  <div className="min-w-0">
                    <h3
                      className="font-bold text-brand-blue-dark truncate"
                      style={{ fontSize: 'min(15px, 5cqmin)' }}
                    >
                      {quiz.title}
                    </h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span
                        className="bg-brand-blue-lighter text-brand-blue-primary font-bold rounded-md"
                        style={{
                          fontSize: 'min(10px, 3cqmin)',
                          padding: 'min(1px, 0.2cqmin) min(6px, 1.5cqmin)',
                          textTransform: 'uppercase',
                        }}
                      >
                        {quiz.questionCount} Qs
                      </span>
                      <span
                        className="text-brand-gray-primary font-medium"
                        style={{ fontSize: 'min(11px, 3.5cqmin)' }}
                      >
                        Updated{' '}
                        {new Date(
                          quiz.updatedAt || quiz.createdAt
                        ).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Action buttons */}
                {confirmDelete === quiz.id ? (
                  <div
                    className="flex items-center justify-end bg-brand-red-lighter/30 rounded-xl"
                    style={{
                      gap: 'min(8px, 2cqmin)',
                      padding: 'min(8px, 2cqmin)',
                    }}
                  >
                    <span
                      className="text-brand-red-dark font-bold"
                      style={{ fontSize: 'min(12px, 3.5cqmin)' }}
                    >
                      Delete?
                    </span>
                    <button
                      onClick={() => {
                        setConfirmDelete(null);
                        onDelete(quiz);
                      }}
                      className="bg-brand-red-primary hover:bg-brand-red-dark text-white font-bold rounded-lg transition-colors shadow-sm"
                      style={{
                        padding: 'min(6px, 1.5cqmin) min(12px, 3cqmin)',
                        fontSize: 'min(12px, 3.5cqmin)',
                      }}
                    >
                      Confirm
                    </button>
                    <button
                      onClick={() => setConfirmDelete(null)}
                      className="bg-brand-gray-light hover:bg-brand-gray-primary text-white font-bold rounded-lg transition-colors"
                      style={{
                        padding: 'min(6px, 1.5cqmin) min(12px, 3cqmin)',
                        fontSize: 'min(12px, 3.5cqmin)',
                      }}
                    >
                      Back
                    </button>
                  </div>
                ) : (
                  <div
                    className="flex items-center flex-wrap"
                    style={{ gap: 'min(8px, 2cqmin)' }}
                  >
                    <ActionButton
                      icon={
                        <Eye
                          style={{
                            width: 'min(14px, 4cqmin)',
                            height: 'min(14px, 4cqmin)',
                          }}
                        />
                      }
                      label="Preview"
                      onClick={() => onPreview(quiz)}
                      variant="ghost"
                    />
                    <ActionButton
                      icon={
                        <Edit2
                          style={{
                            width: 'min(14px, 4cqmin)',
                            height: 'min(14px, 4cqmin)',
                          }}
                        />
                      }
                      label="Edit"
                      onClick={() => onEdit(quiz)}
                      variant="ghost"
                    />
                    <ActionButton
                      icon={
                        <BarChart3
                          style={{
                            width: 'min(14px, 4cqmin)',
                            height: 'min(14px, 4cqmin)',
                          }}
                        />
                      }
                      label="Stats"
                      onClick={() => onResults(quiz)}
                      variant="ghost"
                    />
                    <ActionButton
                      icon={
                        <Trash2
                          style={{
                            width: 'min(14px, 4cqmin)',
                            height: 'min(14px, 4cqmin)',
                          }}
                        />
                      }
                      label=""
                      onClick={() => setConfirmDelete(quiz.id)}
                      variant="danger"
                    />
                    <div className="ml-auto flex items-center gap-2">
                      {hasActiveSession && quiz.id === activeQuizId ? (
                        <>
                          <button
                            onClick={onEndSession}
                            className="flex items-center bg-brand-red-primary hover:bg-brand-red-dark text-white font-black rounded-xl shadow-md transition-all active:scale-95 group/btn"
                            style={{
                              gap: 'min(6px, 1.5cqmin)',
                              padding: 'min(8px, 2cqmin) min(14px, 3.5cqmin)',
                              fontSize: 'min(11px, 3.5cqmin)',
                            }}
                          >
                            <X
                              style={{
                                width: 'min(14px, 4cqmin)',
                                height: 'min(14px, 4cqmin)',
                              }}
                            />
                            END
                          </button>
                          <button
                            onClick={onResume}
                            className="flex items-center bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl shadow-md transition-all active:scale-95 group/btn"
                            style={{
                              gap: 'min(6px, 1.5cqmin)',
                              padding: 'min(8px, 2cqmin) min(14px, 3.5cqmin)',
                              fontSize: 'min(11px, 3.5cqmin)',
                            }}
                          >
                            <Zap
                              className="animate-pulse"
                              style={{
                                width: 'min(14px, 4cqmin)',
                                height: 'min(14px, 4cqmin)',
                              }}
                            />
                            RESUME
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => setSelectedForLive(quiz)}
                          disabled={hasActiveSession}
                          className="flex items-center bg-emerald-600 hover:bg-emerald-700 disabled:bg-brand-gray-lighter disabled:text-brand-gray-primary text-white font-black rounded-xl shadow-md transition-all active:scale-95 group/btn"
                          style={{
                            gap: 'min(6px, 1.5cqmin)',
                            padding: 'min(8px, 2cqmin) min(14px, 3.5cqmin)',
                            fontSize: 'min(13px, 4cqmin)',
                          }}
                        >
                          <Play
                            className="group-hover/btn:scale-110 transition-transform fill-current"
                            style={{
                              width: 'min(14px, 4cqmin)',
                              height: 'min(14px, 4cqmin)',
                            }}
                          />
                          GO LIVE
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const ModeButton: React.FC<{
  icon: React.ReactNode;
  title: string;
  desc: string;
  onClick: () => void;
}> = ({ icon, title, desc, onClick }) => (
  <button
    onClick={onClick}
    className="w-full text-left p-3 rounded-2xl border-2 border-brand-blue-primary/10 hover:border-brand-blue-primary hover:bg-brand-blue-lighter/30 transition-all flex items-start gap-3 group"
  >
    <div className="bg-brand-blue-lighter text-brand-blue-primary p-2 rounded-xl group-hover:bg-brand-blue-primary group-hover:text-white transition-colors">
      {icon}
    </div>
    <div>
      <p className="font-black text-brand-blue-dark text-sm leading-tight">
        {title}
      </p>
      <p
        className="text-brand-gray-primary font-medium leading-tight mt-0.5"
        style={{ fontSize: 'min(11px, 3.25cqmin)' }}
      >
        {desc}
      </p>
    </div>
  </button>
);

const ActionButton: React.FC<{
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  variant: 'ghost' | 'danger';
}> = ({ icon, label, onClick, variant }) => (
  <button
    onClick={onClick}
    className={`flex items-center rounded-lg font-bold transition-all active:scale-90 ${
      variant === 'danger'
        ? 'text-brand-red-primary hover:bg-brand-red-lighter/40'
        : 'text-brand-blue-primary hover:bg-brand-blue-lighter/50'
    }`}
    style={{
      gap: 'min(4px, 1cqmin)',
      padding: 'min(6px, 1.5cqmin)',
      fontSize: 'min(12px, 3.5cqmin)',
    }}
    title={label}
  >
    {icon}
    {label && <span>{label}</span>}
  </button>
);
