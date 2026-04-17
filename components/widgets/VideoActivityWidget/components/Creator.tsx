/**
 * Creator — Video Activity creation orchestrator.
 * Supports Manual creation, CSV/Sheets Import, and AI Generation (admin-gated).
 */

import React, { useState } from 'react';
import {
  ArrowLeft,
  Youtube,
  Wand2,
  FileSpreadsheet,
  PlusCircle,
  Sparkles,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { VideoActivityData } from '@/types';
import { generateVideoActivity } from '@/utils/ai';
import { ImportWizard } from '@/components/common/library/importer';
import { createVideoActivityImportAdapter } from '../adapters/videoActivityImportAdapter';

interface CreatorProps {
  onBack: () => void;
  onSave: (activity: VideoActivityData) => Promise<void>;
  aiEnabled: boolean; // From widget global settings
  isAdmin: boolean;
  audioTranscriptionEnabled: boolean;
  createTemplateSheet: (title: string) => Promise<string>;
}

type Step = 'info' | 'source' | 'ai' | 'import';

export const Creator: React.FC<CreatorProps> = ({
  onBack,
  onSave,
  aiEnabled,
  isAdmin,
  createTemplateSheet,
}) => {
  const [step, setStep] = useState<Step>('info');
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [questionCount, setQuestionCount] = useState(5);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Allow AI if explicitly enabled OR if user is admin
  const canUseAI = aiEnabled || isAdmin;

  const handleNextFromInfo = () => {
    if (!url.trim() || !title.trim()) {
      setError('Title and YouTube URL are required.');
      return;
    }
    setError(null);
    setStep('source');
  };

  const handleManualCreate = async () => {
    const activity: VideoActivityData = {
      id: crypto.randomUUID(),
      title: title.trim(),
      youtubeUrl: url.trim(),
      questions: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await onSave(activity);
  };

  const handleAIGenerate = async () => {
    setIsGenerating(true);
    setError(null);
    try {
      const result = await generateVideoActivity(url, questionCount);
      const activity: VideoActivityData = {
        id: crypto.randomUUID(),
        title: title.trim() || result.title,
        youtubeUrl: url.trim(),
        questions: result.questions.map((q) => ({
          id: crypto.randomUUID(),
          timestamp: q.timestamp,
          text: q.text,
          type: 'MC',
          correctAnswer: q.correctAnswer ?? '',
          incorrectAnswers: q.incorrectAnswers ?? [],
          timeLimit: q.timeLimit ?? 30,
        })),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await onSave(activity);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setIsGenerating(false);
    }
  };

  // ─── Renderers ─────────────────────────────────────────────────────────────

  if (step === 'import') {
    const importAdapter = createVideoActivityImportAdapter({
      title: title.trim(),
      youtubeUrl: url.trim(),
      onSave: async (activity) => {
        await onSave(activity);
      },
      createTemplateSheet: () => createTemplateSheet(title || 'Video Activity'),
    });
    return (
      <ImportWizard
        isOpen={true}
        onClose={() => setStep('source')}
        adapter={importAdapter}
        defaultTitle={title.trim()}
        onSaved={() => setStep('source')}
      />
    );
  }

  return (
    <div className="flex flex-col h-full font-sans bg-slate-50/50">
      {/* Header */}
      <div
        className="flex items-center gap-3 border-b border-brand-blue-primary/10 bg-white"
        style={{ padding: 'min(12px, 2.5cqmin) min(16px, 4cqmin)' }}
      >
        <button
          onClick={step === 'info' ? onBack : () => setStep('info')}
          className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors text-slate-500"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <span
          className="font-black text-brand-blue-dark uppercase tracking-tight"
          style={{ fontSize: 'min(14px, 4.5cqmin)' }}
        >
          {step === 'info' ? 'New Video Activity' : 'Question Source'}
        </span>
      </div>

      <div
        className="flex-1 overflow-y-auto custom-scrollbar"
        style={{ padding: 'min(16px, 4cqmin)' }}
      >
        <div className="max-w-md mx-auto space-y-6">
          {step === 'info' && (
            <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="space-y-4">
                <div>
                  <label className="block text-xxs font-bold text-slate-400 uppercase tracking-widest mb-1.5 ml-1">
                    Activity Title
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Introduction to Photosynthesis"
                    className="w-full px-4 py-3 bg-white border-2 border-slate-200 rounded-2xl text-slate-800 font-medium focus:outline-none focus:border-brand-blue-primary transition-all shadow-sm"
                    style={{ fontSize: 'min(14px, 4cqmin)' }}
                  />
                </div>

                <div>
                  <label className="block text-xxs font-bold text-slate-400 uppercase tracking-widest mb-1.5 ml-1">
                    YouTube URL
                  </label>
                  <div className="relative">
                    <Youtube className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-red-500" />
                    <input
                      type="url"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder="https://www.youtube.com/watch?v=..."
                      className="w-full pl-12 pr-4 py-3 bg-white border-2 border-slate-200 rounded-2xl text-slate-800 font-medium focus:outline-none focus:border-brand-blue-primary transition-all shadow-sm"
                      style={{ fontSize: 'min(13px, 3.5cqmin)' }}
                    />
                  </div>
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-red-600 text-xs font-medium">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <button
                onClick={handleNextFromInfo}
                className="w-full py-4 bg-brand-blue-primary hover:bg-brand-blue-dark text-white font-black rounded-2xl shadow-lg shadow-brand-blue-primary/20 transition-all active:scale-[0.98] uppercase tracking-widest"
                style={{ fontSize: 'min(14px, 4cqmin)' }}
              >
                Next Step
              </button>
            </div>
          )}

          {step === 'source' && (
            <div className="grid gap-3 animate-in fade-in zoom-in-95 duration-300">
              <p className="text-center text-slate-500 text-xs font-medium mb-2">
                How would you like to add questions to this video?
              </p>

              {/* AI Option */}
              {canUseAI && (
                <button
                  onClick={() => setStep('ai')}
                  className="group relative p-5 bg-white border-2 border-slate-200 hover:border-indigo-500 hover:shadow-md rounded-2xl text-left transition-all overflow-hidden"
                >
                  <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                    <Sparkles className="w-12 h-12 text-indigo-600" />
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-indigo-50 rounded-xl group-hover:bg-indigo-100 transition-colors">
                      <Wand2 className="w-6 h-6 text-indigo-600" />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-800">
                        Magic Creator
                      </h4>
                      <p className="text-xs text-slate-500 leading-relaxed">
                        Generate questions automatically using Gemini&apos;s
                        video understanding.
                      </p>
                    </div>
                  </div>
                </button>
              )}

              {/* Import Option */}
              <button
                onClick={() => setStep('import')}
                className="group relative p-5 bg-white border-2 border-slate-200 hover:border-emerald-500 hover:shadow-md rounded-2xl text-left transition-all overflow-hidden"
              >
                <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                  <FileSpreadsheet className="w-12 h-12 text-emerald-600" />
                </div>
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-emerald-50 rounded-xl group-hover:bg-emerald-100 transition-colors">
                    <FileSpreadsheet className="w-6 h-6 text-emerald-600" />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-800">
                      Import from Sheets
                    </h4>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      Paste CSV data from a Google Sheet or Gemini Gem.
                    </p>
                  </div>
                </div>
              </button>

              {/* Manual Option */}
              <button
                onClick={handleManualCreate}
                className="group relative p-5 bg-white border-2 border-slate-200 hover:border-brand-blue-primary hover:shadow-md rounded-2xl text-left transition-all overflow-hidden"
              >
                <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                  <PlusCircle className="w-12 h-12 text-brand-blue-primary" />
                </div>
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-brand-blue-lighter/50 rounded-xl group-hover:bg-brand-blue-lighter transition-colors">
                    <PlusCircle className="w-6 h-6 text-brand-blue-primary" />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-800">Manual Entry</h4>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      Start from scratch and add your own questions.
                    </p>
                  </div>
                </div>
              </button>
            </div>
          )}

          {step === 'ai' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-5 space-y-4">
                <div className="flex items-center gap-3">
                  <Wand2 className="w-5 h-5 text-indigo-600" />
                  <span className="font-bold text-indigo-900 text-sm">
                    AI Configuration
                  </span>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center text-xs font-bold text-indigo-700/60 uppercase">
                    <span>Target Question Count</span>
                    <span>{questionCount}</span>
                  </div>
                  <input
                    type="range"
                    min={3}
                    max={15}
                    value={questionCount}
                    onChange={(e) => setQuestionCount(parseInt(e.target.value))}
                    className="w-full h-2 bg-indigo-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                  />
                </div>

                <div className="text-xs text-indigo-600/70 italic leading-relaxed">
                  Note: AI generation uses Gemini&apos;s video understanding to
                  analyze the content and generate questions.
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-2 p-4 bg-red-50 border border-red-100 rounded-xl text-red-600 text-xs font-medium leading-relaxed">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <button
                onClick={handleAIGenerate}
                disabled={isGenerating}
                className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-black rounded-2xl shadow-lg shadow-indigo-600/20 transition-all active:scale-[0.98] flex items-center justify-center gap-2 uppercase tracking-widest"
                style={{ fontSize: 'min(14px, 4cqmin)' }}
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="animate-spin w-5 h-5" />
                    Generating Activity...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5" />
                    Generate with Gemini
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
