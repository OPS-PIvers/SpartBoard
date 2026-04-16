/**
 * MiniAppEditorModal — full-screen modal editor for mini-app content.
 * Launched from the mini-app library view. Wraps the shared
 * EditorModalShell so it stays visually aligned with other content
 * editors (Quiz, Video Activity, Guided Learning).
 *
 * Adapted from VideoActivityEditorModal. The "Collect Live Results"
 * section modifies widget.config directly (not library-item content),
 * so those fields are excluded from isDirty.
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Code2,
  FileSpreadsheet,
  FileText,
  Globe,
  Info,
  Loader2,
  Sparkles,
  X,
} from 'lucide-react';
import { MiniAppConfig, MiniAppItem, TextConfig, WidgetData } from '@/types';
import { EditorModalShell } from '@/components/common/EditorModalShell';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { useGoogleDrive } from '@/hooks/useGoogleDrive';
import { useMiniAppGlobalConfig } from '../hooks/useMiniAppGlobalConfig';
import { Toggle } from '@/components/common/Toggle';
import { DriveFileAttachment } from '@/components/common/DriveFileAttachment';
import { generateMiniAppCode, buildPromptWithFileContext } from '@/utils/ai';

interface MiniAppEditorModalProps {
  isOpen: boolean;
  app: MiniAppItem | null;
  widget: WidgetData;
  onClose: () => void;
  onSave: (updated: MiniAppItem) => Promise<void>;
}

export const MiniAppEditorModal: React.FC<MiniAppEditorModalProps> = ({
  isOpen,
  app,
  widget,
  onClose,
  onSave,
}) => {
  const { canAccessFeature } = useAuth();
  const { updateWidget, addToast, activeDashboard } = useDashboard();
  const { driveService } = useGoogleDrive();
  const config = widget.config as MiniAppConfig;
  const { globalConfig } = useMiniAppGlobalConfig();
  const lastSharedIdRef = useRef<string | null>(null);

  // --- Snapshot originals ---
  const originalTitle = app?.title ?? '';
  const originalHtml = app?.html ?? '';

  // --- Local draft state ---
  const [title, setTitle] = useState(originalTitle);
  const [html, setHtml] = useState(originalHtml);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Magic Generator state
  const [prompt, setPrompt] = useState('');
  const [showPromptInput, setShowPromptInput] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [fileContext, setFileContext] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  // Collect Live Results state
  const [isCreatingSheet, setIsCreatingSheet] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  // --- Reset state when app prop identity changes ---
  const [prevApp, setPrevApp] = useState<MiniAppItem | null>(app);
  if (app !== prevApp) {
    setPrevApp(app);
    setTitle(app?.title ?? '');
    setHtml(app?.html ?? '');
    setSaving(false);
    setError(null);
    setPrompt('');
    setShowPromptInput(false);
    setIsGenerating(false);
    setFileContext(null);
    setFileName(null);
    setIsCreatingSheet(false);
    setShowHelp(false);
  }

  // --- Dirty check ---
  const isDirty = useMemo(
    () => title !== originalTitle || html !== originalHtml,
    [title, originalTitle, html, originalHtml]
  );

  // --- Save ---
  const handleSave = async () => {
    if (!app) return;
    if (!title.trim()) {
      setError('Please enter a title');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({
        ...app,
        title: title.trim(),
        html,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  // --- Magic Generator ---
  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setIsGenerating(true);
    try {
      const fullPrompt = buildPromptWithFileContext(
        prompt,
        fileContext,
        fileName
      );
      const result = await generateMiniAppCode(fullPrompt);
      setTitle(result.title);
      setHtml(result.html);
      setShowPromptInput(false);
      setPrompt('');
      addToast('App generated successfully!', 'success');
    } catch (err) {
      addToast(
        err instanceof Error ? err.message : 'Failed to generate app',
        'error'
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const importFromNotes = () => {
    const textWidgetsWithContent =
      activeDashboard?.widgets.filter(
        (w) => w.type === 'text' && (w.config as TextConfig).content
      ) ?? [];

    if (textWidgetsWithContent.length === 0) {
      addToast('No Notes widget with content found on dashboard.', 'error');
      return;
    }

    textWidgetsWithContent.sort(
      (a, b) =>
        ((b.config as TextConfig).content?.length || 0) -
        ((a.config as TextConfig).content?.length || 0)
    );

    const textConfig = textWidgetsWithContent[0].config as TextConfig;

    let plainText = '';
    if (typeof DOMParser === 'undefined') {
      const rawContent = textConfig.content ?? '';
      plainText = rawContent
        .replace(/<\/?[^>]+(>|$)/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    } else {
      const parser = new DOMParser();
      const doc = parser.parseFromString(textConfig.content ?? '', 'text/html');
      plainText = doc.body?.textContent?.trim() ?? '';
    }

    const trimmed = plainText.trim();
    if (!trimmed) {
      addToast('Notes widget has no readable text to import.', 'error');
      return;
    }

    setPrompt(trimmed);
    addToast('Prompt imported from Notes!', 'success');
  };

  // --- Collect Live Results handlers ---
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
        const errorMsg = e instanceof Error ? e.message : '';
        if (
          errorMsg.includes('403') ||
          errorMsg.includes('Authorization') ||
          errorMsg.includes('appNotAuthorizedToFile')
        ) {
          addToast(
            `Permission denied. Please click 'Reset' to create a new sheet or manually share your existing sheet with ${globalConfig.botEmail} as an Editor.`,
            'error'
          );
        } else {
          addToast(
            'Failed to share sheet. Check your drive permissions.',
            'error'
          );
        }
      }
    },
    [driveService, globalConfig, addToast]
  );

  const handleToggleCollect = async (checked: boolean) => {
    updateWidget(widget.id, {
      config: { ...config, collectResults: checked },
    });

    if (checked && !config.googleSheetId) {
      await handleCreateNewSheet();
    } else if (checked && config.googleSheetId) {
      await shareSheetWithBot(config.googleSheetId);
    }
  };

  const handleUnlinkSheet = () => {
    updateWidget(widget.id, {
      config: {
        ...config,
        googleSheetUrl: undefined,
        googleSheetId: undefined,
      },
    });
    lastSharedIdRef.current = null;
    addToast('Sheet unlinked.', 'info');
  };

  const handleCreateNewSheet = async () => {
    if (!driveService || !globalConfig?.botEmail) {
      addToast('Google Drive not connected or system bot not ready.', 'error');
      return;
    }

    setIsCreatingSheet(true);
    try {
      const folderId = await driveService.getFolderPath('MiniApp Results');
      const sheetFileName = `${title || 'Untitled App'} - Results`;
      const sheet = await driveService.createSpreadsheet(
        sheetFileName,
        folderId
      );

      const sheetUrl = `https://docs.google.com/spreadsheets/d/${sheet.id}/edit`;
      updateWidget(widget.id, {
        config: {
          ...config,
          googleSheetUrl: sheetUrl,
          googleSheetId: sheet.id,
          collectResults: true,
        },
      });

      await driveService.addEditorPermission(sheet.id, globalConfig.botEmail);
      lastSharedIdRef.current = sheet.id;
      addToast('New results sheet created and shared!', 'success');
    } catch (err) {
      console.error(err);
      addToast('Failed to create sheet automatically.', 'error');
    } finally {
      setIsCreatingSheet(false);
    }
  };

  return (
    <EditorModalShell
      isOpen={isOpen}
      title={title.trim() || (originalTitle ? 'Edit App' : 'New App')}
      subtitle={
        <span className="flex items-center gap-1.5">
          <Code2 className="w-3.5 h-3.5" />
          Mini-App Editor
        </span>
      }
      isDirty={isDirty}
      isSaving={saving}
      onSave={handleSave}
      onClose={onClose}
      saveLabel="Save App"
      saveDisabled={!title.trim()}
      saveErrorMessage={false}
      bodyClassName="px-6 py-5 bg-slate-50/50"
    >
      <div className="flex flex-col gap-4 h-full relative">
        {/* Magic Generator Overlay */}
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

              <div className="flex justify-end">
                <button
                  onClick={importFromNotes}
                  className="text-xxs font-black uppercase text-indigo-500 hover:text-indigo-600 flex items-center gap-1 transition-colors"
                  title="Import prompt from a Notes widget on your dashboard"
                >
                  <FileText className="w-3 h-3" /> Import from Notes
                </button>
              </div>

              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="e.g. A team randomizer for 5 groups with a spinning wheel animation and confetti effect."
                className="w-full h-32 p-4 bg-white border-2 border-indigo-100 rounded-2xl text-sm text-indigo-900 placeholder-indigo-300 focus:outline-none focus:border-indigo-500 resize-none shadow-inner"
                autoFocus
                aria-label="Describe your mini-app"
              />
              {canAccessFeature('ai-file-context') && (
                <DriveFileAttachment
                  onFileContent={(content, name) => {
                    setFileContext(content);
                    setFileName(name);
                  }}
                  disabled={isGenerating}
                />
              )}
              <button
                onClick={handleGenerate}
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

        {/* Title + Magic button */}
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="block text-xxs font-black uppercase text-slate-400 tracking-widest mb-1">
              App Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
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
                Magic
              </button>
            </div>
          )}
        </div>

        {/* HTML Code textarea */}
        <div className="flex-1 flex flex-col min-h-[250px]">
          <label className="block text-xxs font-black uppercase text-slate-400 tracking-widest mb-1">
            HTML Code
          </label>
          <textarea
            value={html}
            onChange={(e) => setHtml(e.target.value)}
            className="flex-1 w-full p-4 bg-slate-900 text-emerald-400 font-mono text-xs rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none leading-relaxed custom-scrollbar shadow-inner"
            spellCheck={false}
            placeholder="Paste your HTML, CSS, and JS here..."
          />
        </div>

        {/* Results Collection Section */}
        <div className="bg-slate-50 border-t border-slate-200 p-4 shrink-0 flex flex-col gap-3 -mx-6 -mb-5 rounded-b-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-black uppercase tracking-widest text-slate-500">
                Collect Live Results
              </span>
              <button
                onClick={() => setShowHelp(!showHelp)}
                className="p-1 text-slate-400 hover:text-indigo-500 transition-colors"
                title="How to use results collection"
              >
                <Info className="w-3.5 h-3.5" />
              </button>
            </div>
            <Toggle
              checked={!!config.collectResults}
              onChange={handleToggleCollect}
            />
          </div>

          {showHelp && (
            <div className="p-3 bg-white border border-indigo-100 rounded-xl space-y-2 animate-in slide-in-from-top-1 duration-200">
              <div className="flex items-center justify-between">
                <h4 className="text-xxs font-black text-indigo-600 uppercase tracking-widest">
                  Developer Guide
                </h4>
                <button
                  onClick={() => setShowHelp(false)}
                  className="text-slate-300 hover:text-slate-500"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
              <p className="text-xxs text-slate-600 leading-relaxed">
                To save data to your sheet, your app must send a message to the
                parent window. Include this code in your mini-app&apos;s
                JavaScript:
              </p>
              <pre className="p-2 bg-slate-900 rounded-lg text-xxxs text-emerald-400 font-mono overflow-x-auto">
                {`window.parent.postMessage({
  type: 'SPART_MINIAPP_RESULT',
  payload: {
    score: 100,
    item: 'Apple'
  }
}, '*');`}
              </pre>
              <p className="text-xxxs text-slate-400 italic">
                Note: The payload can be any JSON object.
              </p>
            </div>
          )}

          {config.collectResults && (
            <div className="animate-in fade-in slide-in-from-top-2">
              {isCreatingSheet ? (
                <div className="flex items-center gap-3 p-3 bg-indigo-50 border border-indigo-100 rounded-xl">
                  <Loader2 className="w-4 h-4 text-indigo-500 animate-spin" />
                  <span className="text-xs font-bold text-indigo-700 uppercase tracking-tight">
                    Creating your results sheet...
                  </span>
                </div>
              ) : config.googleSheetId ? (
                <div className="flex items-center justify-between p-3 bg-emerald-50 border border-emerald-100 rounded-xl">
                  <div className="flex-1 min-w-0 mr-3">
                    <div className="flex items-center gap-2 mb-1">
                      <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
                      <span className="text-xs font-bold text-emerald-700 uppercase tracking-tight truncate">
                        Results Linked
                      </span>
                    </div>
                    <p className="text-xxs text-emerald-600/70 font-medium truncate">
                      Google Sheet is connected
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={handleUnlinkSheet}
                      className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      title="Unlink and use a different sheet"
                    >
                      <X className="w-4 h-4" />
                    </button>
                    <a
                      href={config.googleSheetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 bg-white border border-emerald-200 text-emerald-600 hover:bg-emerald-100 rounded-lg text-xxs font-black uppercase tracking-widest transition-all shadow-sm flex items-center gap-1.5"
                    >
                      <Globe className="w-3 h-3" />
                      Open
                    </a>
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-slate-100 border border-slate-200 rounded-xl">
                  <p className="text-xxs text-slate-500 font-bold uppercase tracking-tight">
                    Sheet will be created automatically.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Inline error (validation) */}
        {error && (
          <div className="px-4 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}
      </div>
    </EditorModalShell>
  );
};
