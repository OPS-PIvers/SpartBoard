/**
 * MiniAppEditorModal — full-screen modal editor for mini-app content.
 * Launched from the mini-app library view. Wraps the shared
 * EditorModalShell so it stays visually aligned with other content
 * editors (Quiz, Video Activity, Guided Learning).
 */

import React, { useMemo, useState } from 'react';
import { Code2, FileText, Loader2, Sparkles, X } from 'lucide-react';
import { LibraryFolder, MiniAppItem, TextConfig } from '@/types';
import { EditorModalShell } from '@/components/common/EditorModalShell';
import { FolderSelectField } from '@/components/common/library/FolderSelectField';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { DriveFileAttachment } from '@/components/common/DriveFileAttachment';
import { generateMiniAppCode, buildPromptWithFileContext } from '@/utils/ai';

interface MiniAppEditorModalProps {
  isOpen: boolean;
  app: MiniAppItem | null;
  onClose: () => void;
  onSave: (updated: MiniAppItem) => Promise<void>;
  /** Optional folder picker. When `folders` and `onFolderChange` are both provided, a folder-select field is shown. */
  folders?: LibraryFolder[];
  folderId?: string | null;
  onFolderChange?: (folderId: string | null) => void;
}

export const MiniAppEditorModal: React.FC<MiniAppEditorModalProps> = ({
  isOpen,
  app,
  onClose,
  onSave,
  folders,
  folderId,
  onFolderChange,
}) => {
  const { canAccessFeature } = useAuth();
  const { addToast, activeDashboard } = useDashboard();

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
                className="h-[46px] px-4 bg-brand-blue-primary hover:bg-brand-blue-dark text-white rounded-xl font-bold text-xs uppercase tracking-wider shadow-sm transition-colors flex items-center gap-2 active:scale-95"
                title="Generate with AI"
              >
                <Sparkles className="w-4 h-4" />
                Draft with AI
              </button>
            </div>
          )}
        </div>

        {folders && onFolderChange && (
          <FolderSelectField
            folders={folders}
            value={folderId ?? null}
            onChange={onFolderChange}
          />
        )}

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
