/**
 * Importer — imports video activity questions from CSV/Sheets.
 * Format: Timestamp (MM:SS), Question, Correct Answer, Incorrect 1, Incorrect 2, Incorrect 3, Time Limit
 */

import React, { useState, useRef } from 'react';
import {
  FileUp,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Info,
  X,
  Clock,
  ExternalLink,
  FileSpreadsheet,
} from 'lucide-react';
import { VideoActivityQuestion } from '@/types';

interface ImporterProps {
  onBack: () => void;
  onData: (questions: VideoActivityQuestion[]) => void;
  createTemplateSheet: () => Promise<string>;
}

/** Convert MM:SS or M:SS string to total seconds. Returns NaN if invalid. */
function mmSsToSeconds(value: string): number {
  if (!value) return 0;
  const parts = value.trim().split(':');
  if (parts.length !== 2) return NaN;
  const m = parseInt(parts[0] ?? '0');
  const s = parseInt(parts[1] ?? '0');
  if (isNaN(m) || isNaN(s) || s >= 60) return NaN;
  return m * 60 + s;
}

export const Importer: React.FC<ImporterProps> = ({
  onBack,
  onData,
  createTemplateSheet,
}) => {
  const [csvText, setCsvText] = useState('');
  const [parsedQuestions, setParsedQuiz] = useState<
    VideoActivityQuestion[] | null
  >(null);
  const [loading, setLoading] = useState(false);
  const [creatingTemplate, setCreatingTemplate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showFormat, setShowFormat] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const parseCSV = (content: string): VideoActivityQuestion[] => {
    const lines = content.split(/\r?\n/).filter((line) => line.trim() !== '');
    if (lines.length === 0) throw new Error('CSV is empty');

    return lines.map((line, index) => {
      // Simple CSV split (handles quotes roughly)
      const parts = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);

      const timestampStr = parts[0]?.replace(/^"|"$/g, '').trim() || '00:00';
      const text = parts[1]?.replace(/^"|"$/g, '').trim() || '';
      const correctAnswer = parts[2]?.replace(/^"|"$/g, '').trim() || '';
      const incorrect1 = parts[3]?.replace(/^"|"$/g, '').trim() || '';
      const incorrect2 = parts[4]?.replace(/^"|"$/g, '').trim() || '';
      const incorrect3 = parts[5]?.replace(/^"|"$/g, '').trim() || '';
      const timeLimit = parseInt(parts[6]?.replace(/^"|"$/g, '') || '30');

      const timestamp = mmSsToSeconds(timestampStr);
      if (isNaN(timestamp)) {
        throw new Error(
          `Invalid timestamp format on line ${index + 1}: ${timestampStr}. Use MM:SS.`
        );
      }

      if (!text || !correctAnswer) {
        throw new Error(
          `Missing question text or correct answer on line ${index + 1}`
        );
      }

      const incorrectAnswers = [incorrect1, incorrect2, incorrect3].filter(
        (a) => a !== ''
      );

      return {
        id: crypto.randomUUID(),
        timestamp,
        text,
        type: 'MC',
        correctAnswer,
        incorrectAnswers,
        timeLimit: isNaN(timeLimit) ? 30 : timeLimit,
      } as VideoActivityQuestion;
    });
  };

  const handleParse = () => {
    if (!csvText.trim()) {
      setError('Please paste your CSV data.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const questions = parseCSV(csvText.trim());
      // Sort by timestamp
      questions.sort((a, b) => a.timestamp - b.timestamp);
      setParsedQuiz(questions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse CSV');
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError(null);
    try {
      const content = await file.text();
      const questions = parseCSV(content);
      questions.sort((a, b) => a.timestamp - b.timestamp);
      setParsedQuiz(questions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse CSV');
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleCreateTemplate = async () => {
    setCreatingTemplate(true);
    setError(null);
    try {
      const url = await createTemplateSheet();
      window.open(url, '_blank');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to create template'
      );
    } finally {
      setCreatingTemplate(false);
    }
  };

  return (
    <div className="flex flex-col h-full font-sans relative">
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
        <div className="flex items-center gap-2">
          <div
            className="bg-brand-blue-primary text-white flex items-center justify-center rounded-lg"
            style={{ width: 'min(24px, 6cqmin)', height: 'min(24px, 6cqmin)' }}
          >
            <FileUp
              style={{
                width: 'min(14px, 3.5cqmin)',
                height: 'min(14px, 3.5cqmin)',
              }}
            />
          </div>
          <span
            className="font-bold text-brand-blue-dark"
            style={{ fontSize: 'min(14px, 4.5cqmin)' }}
          >
            Import from Sheets
          </span>
        </div>
      </div>

      <div
        className="flex-1 overflow-y-auto custom-scrollbar"
        style={{ padding: 'min(16px, 4cqmin)' }}
      >
        <div className="space-y-4">
          {/* Format guide */}
          <button
            onClick={() => setShowFormat(!showFormat)}
            className="w-full flex items-center gap-2 px-3 py-2 bg-white border border-brand-blue-primary/20 rounded-xl text-brand-blue-primary text-xs transition-all hover:bg-brand-blue-lighter/50 font-bold shadow-sm"
          >
            <Info className="w-3.5 h-3.5 shrink-0" />
            <span className="font-bold">Required Template Format</span>
            <span className="ml-auto opacity-40">{showFormat ? '▲' : '▼'}</span>
          </button>

          {showFormat && (
            <div className="bg-brand-blue-lighter/40 border border-brand-blue-primary/10 rounded-xl p-3 space-y-2 text-xs">
              <p className="text-brand-blue-dark font-bold">
                Column layout (Left to Right):
              </p>
              <div className="space-y-1 text-brand-blue-primary font-mono bg-white/50 p-2 rounded-lg border border-brand-blue-primary/5">
                <p>
                  <span className="font-bold text-brand-red-primary">A:</span>{' '}
                  Timestamp (MM:SS)
                </p>
                <p>
                  <span className="font-bold text-brand-red-primary">B:</span>{' '}
                  Question Text
                </p>
                <p>
                  <span className="font-bold text-brand-red-primary">C:</span>{' '}
                  Correct Answer
                </p>
                <p>
                  <span className="font-bold text-brand-red-primary">D–F:</span>{' '}
                  Incorrect Answers
                </p>
                <p>
                  <span className="font-bold text-brand-red-primary">G:</span>{' '}
                  Time Limit (seconds)
                </p>
              </div>
              <p
                className="text-brand-gray-primary leading-relaxed italic"
                style={{ fontSize: 'min(10px, 3cqmin)' }}
              >
                <strong>Tip:</strong> You can create a Gemini Gem to output
                exactly this format for any video.
              </p>

              <button
                onClick={handleCreateTemplate}
                disabled={creatingTemplate}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-white border-2 border-brand-blue-primary/20 hover:border-brand-blue-primary/40 rounded-xl text-brand-blue-primary font-black transition-all shadow-sm active:scale-95 disabled:opacity-50"
                style={{
                  fontSize: 'min(11px, 3.5cqmin)',
                  marginTop: 'min(8px, 2cqmin)',
                }}
              >
                {creatingTemplate ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                )}
                CREATE GOOGLE SHEET TEMPLATE
                <ExternalLink className="w-3 h-3 opacity-40" />
              </button>
            </div>
          )}

          <div className="space-y-3">
            <textarea
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder="Paste CSV rows here..."
              className="w-full h-40 p-4 bg-white border-2 border-brand-blue-primary/10 rounded-2xl text-sm text-brand-blue-dark placeholder-brand-gray-lighter focus:outline-none focus:border-brand-blue-primary resize-none shadow-sm font-mono"
              style={{ fontSize: 'min(12px, 3.5cqmin)' }}
            />

            <div className="flex gap-2">
              <button
                onClick={handleParse}
                disabled={loading || !csvText.trim()}
                className="flex-1 py-3 bg-brand-blue-primary hover:bg-brand-blue-dark disabled:opacity-50 text-white font-black rounded-xl transition-all shadow-md active:scale-95 flex items-center justify-center gap-2"
                style={{ fontSize: 'min(13px, 4cqmin)' }}
              >
                {loading ? (
                  <Loader2 className="animate-spin w-4 h-4" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                Parse Questions
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={loading}
                className="px-4 bg-white border-2 border-brand-blue-primary/20 text-brand-blue-primary hover:bg-brand-blue-lighter/30 rounded-xl transition-all"
              >
                <FileUp className="w-5 h-5" />
              </button>
              <input
                type="file"
                ref={fileInputRef}
                accept=".csv"
                onChange={handleFileUpload}
                className="hidden"
              />
            </div>
          </div>

          {error && (
            <div
              className="flex items-start gap-2 p-3 bg-brand-red-lighter/40 border border-brand-red-primary/20 rounded-xl text-brand-red-dark font-medium"
              style={{ fontSize: 'min(11px, 3.5cqmin)' }}
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Preview of parsed questions */}
          {parsedQuestions && (
            <div className="space-y-3 pt-2 border-t border-brand-blue-primary/10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-emerald-600">
                  <CheckCircle2 className="w-4 h-4" />
                  <span
                    className="font-bold"
                    style={{ fontSize: 'min(13px, 4cqmin)' }}
                  >
                    {parsedQuestions.length} questions ready
                  </span>
                </div>
                <button
                  onClick={() => setParsedQuiz(null)}
                  className="p-1 hover:bg-brand-gray-lightest rounded-lg text-brand-gray-primary"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-2 max-h-52 overflow-y-auto pr-1 custom-scrollbar">
                {parsedQuestions.map((q, _i) => (
                  <div
                    key={q.id}
                    className="flex items-start gap-3 p-3 bg-white border border-brand-blue-primary/5 rounded-xl shadow-sm"
                  >
                    <div
                      className="flex items-center bg-brand-blue-lighter text-brand-blue-primary font-black rounded-md shrink-0"
                      style={{
                        gap: 'min(3px, 0.8cqmin)',
                        padding: 'min(2px, 0.5cqmin) min(7px, 1.8cqmin)',
                        fontSize: 'min(9px, 2.5cqmin)',
                      }}
                    >
                      <Clock
                        style={{
                          width: 'min(10px, 2.5cqmin)',
                          height: 'min(10px, 2.5cqmin)',
                        }}
                      />
                      {partsToMmSs(q.timestamp)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p
                        className="font-bold text-brand-blue-dark truncate"
                        style={{ fontSize: 'min(12px, 3.5cqmin)' }}
                      >
                        {q.text}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={() => onData(parsedQuestions)}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg active:scale-95"
                style={{ fontSize: 'min(14px, 4.5cqmin)' }}
              >
                <CheckCircle2 className="w-5 h-5" />
                USE THESE QUESTIONS
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

function partsToMmSs(seconds: number): string {
  const m = Math.floor(Math.max(0, seconds) / 60);
  const s = Math.floor(Math.max(0, seconds) % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
