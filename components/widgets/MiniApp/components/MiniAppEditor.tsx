import React, { useCallback, useRef } from 'react';
import { X, Code2, Sparkles, Loader2, Save, Box } from 'lucide-react';
import { WidgetLayout } from '../../WidgetLayout';
import { useAuth } from '@/context/useAuth';
import { MiniAppConfig, WidgetData } from '@/types';
import { useGoogleDrive } from '@/hooks/useGoogleDrive';
import { useDashboard } from '@/context/useDashboard';
import { Toggle } from '@/components/common/Toggle';
import { useMiniAppGlobalConfig } from '../hooks/useMiniAppGlobalConfig';

interface MiniAppEditorProps {
  widget: WidgetData;
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
  widget,
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
  const { updateWidget, addToast } = useDashboard();
  const { driveService } = useGoogleDrive();
  const config = widget.config as MiniAppConfig;
  const { globalConfig } = useMiniAppGlobalConfig();
  const lastSharedIdRef = useRef<string | null>(null);

  const shareSheetWithBot = useCallback(
    async (sheetId: string) => {
      if (!driveService || !globalConfig?.botEmail || !sheetId) return;
      if (lastSharedIdRef.current === sheetId) return;

      try {
        await driveService.addEditorPermission(sheetId, globalConfig.botEmail);
        lastSharedIdRef.current = sheetId;
        addToast('Sheet linked and shared with system!', 'success');
      } catch (e) {
        console.error(e);
        addToast(
          'Failed to share sheet. Check your drive permissions.',
          'error'
        );
      }
    },
    [driveService, globalConfig, addToast]
  );

  // 3. TEACHER HANDLERS: Auto-share the Google Sheet
  const handleToggleCollect = async (checked: boolean) => {
    updateWidget(widget.id, {
      config: { ...config, collectResults: checked },
    });

    if (checked && config.googleSheetId) {
      await shareSheetWithBot(config.googleSheetId);
    }
  };

  const handleUrlChange = async (url: string) => {
    const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
    const sheetId = match ? match[1] : '';

    updateWidget(widget.id, {
      config: { ...config, googleSheetUrl: url, googleSheetId: sheetId },
    });

    if (config.collectResults && sheetId) {
      await shareSheetWithBot(sheetId);
    }
  };

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

          {/* Results Collection Section */}
          <div className="bg-slate-50 border-t border-slate-200 p-4 shrink-0 flex flex-col gap-3 -mx-4 -mb-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-widest text-slate-500">
                Collect Live Results
              </span>
              <Toggle
                checked={!!config.collectResults}
                onChange={handleToggleCollect}
              />
            </div>

            {config.collectResults && (
              <div className="animate-in fade-in slide-in-from-top-2">
                <label className="block text-xxs font-bold uppercase text-slate-400 mb-1">
                  Google Sheet URL
                </label>
                <div className="relative flex items-center">
                  <div className="absolute left-3 text-slate-400 pointer-events-none">
                    <Box size={16} />
                  </div>
                  <input
                    type="text"
                    value={config.googleSheetUrl ?? ''}
                    onChange={(e) => void handleUrlChange(e.target.value)}
                    placeholder="Paste your Google Sheet link here..."
                    className="w-full pl-9 pr-4 py-2.5 text-sm bg-slate-100 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all placeholder:text-slate-400 text-slate-700 font-bold"
                  />
                </div>
                {config.googleSheetId && (
                  <p className="text-xxs text-emerald-500 font-bold mt-1 uppercase tracking-wider">
                    ✓ Sheet Connected & Ready
                  </p>
                )}
              </div>
            )}
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
