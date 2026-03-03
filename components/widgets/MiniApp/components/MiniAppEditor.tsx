import React from 'react';
import { X, Code2, Sparkles, Loader2, Save } from 'lucide-react';
import { WidgetLayout } from '../../WidgetLayout';
import { useAuth } from '@/context/useAuth';

interface MiniAppEditorProps {
  editingId: string | null;
  editTitle: string;
  setEditTitle: (val: string) => void;
  editCode: string;
  setEditCode: (val: string) => void;
  prompt: string;
  setPrompt: (val: string) => void;
  showPromptInput: boolean;
  setShowPromptInput: (val: boolean) => void;
  isGenerating: boolean;
  onGenerate: () => void;
  onSave: () => void;
  onCancel: () => void;
}

export const MiniAppEditor: React.FC<MiniAppEditorProps> = ({
  editingId,
  editTitle,
  setEditTitle,
  editCode,
  setEditCode,
  prompt,
  setPrompt,
  showPromptInput,
  setShowPromptInput,
  isGenerating,
  onGenerate,
  onSave,
  onCancel,
}) => {
  const { canAccessFeature } = useAuth();

  return (
    <WidgetLayout
      padding="p-0"
      header={
        <div className="p-4 flex items-center justify-between">
          <h3 className="text-slate-700 uppercase tracking-wider text-xs flex items-center gap-2 font-black">
            <Code2 className="w-4 h-4 text-indigo-500" />
            {editingId ? 'Edit App' : 'New Mini-App'}
          </h3>
          <button
            onClick={onCancel}
            className="p-1 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-700 transition-colors"
            aria-label={
              editingId ? 'Close mini-app editor' : 'Cancel new mini-app'
            }
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      }
      content={
        <div className="flex-1 w-full h-full flex flex-col p-4 space-y-4 overflow-y-auto custom-scrollbar relative">
          {showPromptInput && (
            <div
              className="absolute inset-0 z-20 bg-white/95 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-200"
              onKeyDown={(e) => {
                if (e.key === 'Escape') setShowPromptInput(false);
              }}
            >
              <div className="w-full max-w-sm space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-black text-indigo-600 flex items-center gap-2 uppercase tracking-tight">
                    <Sparkles className="w-5 h-5" /> Magic Generator
                  </h4>
                  <button
                    onClick={() => setShowPromptInput(false)}
                    className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600"
                    aria-label="Close Magic Generator"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <p className="text-xs text-slate-500 font-bold uppercase tracking-widest opacity-60">
                  Describe the mini-app you want to build.
                </p>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="e.g. A team randomizer for 5 groups with a spinning wheel animation and confetti effect."
                  className="w-full h-32 p-4 bg-white border-2 border-indigo-100 rounded-2xl text-sm text-indigo-900 placeholder-indigo-300 focus:outline-none focus:border-indigo-500 resize-none shadow-inner"
                  autoFocus
                  aria-label="Describe your mini-app"
                />
                <button
                  onClick={onGenerate}
                  disabled={isGenerating || !prompt.trim()}
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-indigo-200 transition-all flex items-center justify-center gap-2"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" /> Generate Code
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-xxs font-black uppercase text-slate-400 tracking-widest mb-1">
                App Title
              </label>
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="e.g. Lunch Randomizer"
                className="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm font-black text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm transition-all"
              />
            </div>
            {canAccessFeature('gemini-functions') && (
              <div className="pt-5">
                <button
                  onClick={() => setShowPromptInput(true)}
                  className="h-[46px] px-4 bg-gradient-to-br from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-indigo-200 transition-all flex items-center gap-2 active:scale-95"
                  title="Generate with AI"
                >
                  <Sparkles className="w-4 h-4" />
                  <span className="hidden sm:inline">Magic</span>
                </button>
              </div>
            )}
          </div>
          <div className="flex-1 flex flex-col min-h-[250px]">
            <label className="block text-xxs font-black uppercase text-slate-400 tracking-widest mb-1">
              HTML Code
            </label>
            <textarea
              value={editCode}
              onChange={(e) => setEditCode(e.target.value)}
              className="flex-1 w-full p-4 bg-slate-900 text-emerald-400 font-mono text-xs rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none leading-relaxed custom-scrollbar shadow-inner"
              spellCheck={false}
              placeholder="Paste your HTML, CSS, and JS here..."
            />
          </div>
        </div>
      }
      footer={
        <div className="p-4 flex gap-3">
          <button
            onClick={onCancel}
            className="px-6 py-3 rounded-xl font-black text-xs uppercase tracking-widest text-slate-500 hover:bg-slate-100 transition-colors border border-slate-200"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            className="flex-1 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-indigo-200 transition-all flex items-center justify-center gap-2 active:scale-95"
          >
            <Save className="w-4 h-4" /> Save App
          </button>
        </div>
      }
    />
  );
};
