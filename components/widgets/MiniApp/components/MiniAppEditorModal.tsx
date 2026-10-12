/**
 * MiniAppEditorModal — full-screen modal editor for mini-app content.
 * Launched from the mini-app library view. Wraps the shared
 * EditorModalShell so it stays visually aligned with other content
 * editors (Quiz, Video Activity, Guided Learning).
 */

import React, { useEffect, useId, useMemo, useState } from 'react';
import { Code2, Eye, FileText, Play, Sparkles } from 'lucide-react';
import { SegmentedControl } from '@/components/common/SegmentedControl';
import { injectMiniAppHelper } from '@/utils/miniAppHelper';
import { doc, setDoc } from 'firebase/firestore';
import {
  LibraryFolder,
  MiniAppAnswerKey,
  MiniAppItem,
  TextConfig,
} from '@/types';
import { db } from '@/config/firebase';
import { loadMiniAppKey } from '@/utils/miniAppResults';
import {
  checkMiniApp,
  fromDrafts,
  toDrafts,
  type MiniAppQuestionDraft,
} from '@/utils/miniAppEditorDraft';
import { MiniAppKeyPanel } from './MiniAppKeyPanel';
import { MiniAppTryAsStudent } from './MiniAppTryAsStudent';
import { EditorModalShell } from '@/components/common/EditorModalShell';
import { FolderSelectField } from '@/components/common/library/FolderSelectField';
import { SettingsLabel } from '@/components/common/SettingsLabel';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { DriveFileAttachment } from '@/components/common/DriveFileAttachment';
import { AIGeneratorOverlay } from '@/components/common/AIGeneratorOverlay';
import { generateMiniAppCode, buildPromptWithFileContext } from '@/utils/ai';
import { tourTypeAttr } from '@/config/tourAnchors';

interface MiniAppEditorModalProps {
  isOpen: boolean;
  app: MiniAppItem | null;
  onClose: () => void;
  onSave: (updated: MiniAppItem) => Promise<void>;
  /** Optional folder picker. When `folders` and `onFolderChange` are both provided, a folder-select field is shown. */
  folders?: LibraryFolder[];
  folderId?: string | null;
  onFolderChange?: (folderId: string | null) => void;
  /** Results v2 is on: shows the answer key panel and Try as student. */
  resultsOn?: boolean;
}

export const MiniAppEditorModal: React.FC<MiniAppEditorModalProps> = ({
  isOpen,
  app,
  onClose,
  onSave,
  folders,
  folderId,
  onFolderChange,
  resultsOn = false,
}) => {
  const { canAccessFeature, user } = useAuth();
  const { addToast, activeDashboard } = useDashboard();
  const htmlFieldId = useId();

  // --- Snapshot originals ---
  const originalTitle = app?.title ?? '';
  const originalHtml = app?.html ?? '';

  // --- Local draft state ---
  const [title, setTitle] = useState(originalTitle);
  const [html, setHtml] = useState(originalHtml);
  const [saving, setSaving] = useState(false);
  const [collectsResults, setCollectsResults] = useState(
    app?.collectsResults ?? false
  );
  const [rows, setRows] = useState<MiniAppQuestionDraft[]>(() =>
    toDrafts(app?.manifest, null)
  );
  const [loadedKey, setLoadedKey] = useState<MiniAppAnswerKey | null>(null);
  const [trying, setTrying] = useState(false);
  const [view, setView] = useState<'preview' | 'code'>(
    app?.html.trim() ? 'preview' : 'code'
  );

  // AI generator state
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
    setCollectsResults(app?.collectsResults ?? false);
    setRows(toDrafts(app?.manifest, null));
    setLoadedKey(null);
    setTrying(false);
    setView(app?.html.trim() ? 'preview' : 'code');
    setSaving(false);
    setPrompt('');
    setShowPromptInput(false);
    setIsGenerating(false);
    setFileContext(null);
    setFileName(null);
  }

  const appId = app?.id;
  const uid = user?.uid;
  // The key lives outside the app doc, so it loads after open and fills the answers in.
  useEffect(() => {
    if (!resultsOn || !uid || !appId) return;
    let live = true;
    void loadMiniAppKey(uid, appId).then((key) => {
      if (!live || !key) return;
      setLoadedKey(key);
      setRows((current) =>
        current.map((row) => {
          const filled = toDrafts(
            { questions: [{ id: row.id, type: row.type, prompt: '' }] },
            key
          )[0];
          return row.answer || row.tolerance
            ? row
            : { ...row, answer: filled.answer, tolerance: filled.tolerance };
        })
      );
    });
    return () => {
      live = false;
    };
  }, [resultsOn, uid, appId]);

  const draft = useMemo(() => fromDrafts(rows), [rows]);
  const previewDoc = useMemo(() => injectMiniAppHelper(html), [html]);
  const originalDraft = useMemo(
    () => fromDrafts(toDrafts(app?.manifest, loadedKey)),
    [app?.manifest, loadedKey]
  );
  const resultsDirty =
    resultsOn &&
    (collectsResults !== (app?.collectsResults ?? false) ||
      JSON.stringify(draft) !== JSON.stringify(originalDraft));
  const problems = useMemo(
    () =>
      resultsOn && collectsResults
        ? checkMiniApp(html, draft.manifest, draft.key)
        : [],
    [resultsOn, collectsResults, html, draft]
  );

  // --- Dirty check ---
  const isDirty =
    title !== originalTitle || html !== originalHtml || resultsDirty;

  // --- Save ---
  // New identity on every draft edit — the autosave quiet period restarts on it.
  const draftToken = useMemo(
    () => [title, html, collectsResults, draft],
    [title, html, collectsResults, draft]
  );

  const incompleteNotice = title.trim() ? null : 'App title is required';

  // Persist only — the shell owns closing.
  const persistDraft = async () => {
    if (!app) return;
    setSaving(true);
    try {
      await onSave({
        ...app,
        title: title.trim(),
        html,
        ...(resultsOn
          ? {
              collectsResults,
              manifest: collectsResults ? draft.manifest : app.manifest,
            }
          : {}),
      });
      if (resultsOn && collectsResults && user)
        await setDoc(doc(db, 'users', user.uid, 'mini_app_keys', app.id), {
          questions: draft.key.questions,
        });
    } finally {
      setSaving(false);
    }
  };

  // --- AI generator ---
  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setIsGenerating(true);
    try {
      const fullPrompt = buildPromptWithFileContext(
        prompt,
        fileContext,
        fileName
      );
      const result = await generateMiniAppCode(fullPrompt, 'mini-app');
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
      tourScope="miniApp"
      saveAnchor={tourTypeAttr('mini-app.editor-save', 'miniApp')}
      isOpen={isOpen}
      title={title}
      onTitleChange={setTitle}
      titlePlaceholder="App title"
      headerExtras={
        folders && onFolderChange ? (
          <FolderSelectField
            variant="header"
            folders={folders}
            value={folderId ?? null}
            onChange={onFolderChange}
            anchor={tourTypeAttr('mini-app.editor-folder', 'miniApp')}
          />
        ) : undefined
      }
      subtitle={
        <span className="flex items-center gap-1.5">
          <Code2 className="w-3.5 h-3.5" />
          Mini-App Editor
        </span>
      }
      isDirty={isDirty}
      isSaving={saving}
      onSave={persistDraft}
      autosave={{ draftToken, resetKey: app?.id }}
      incompleteNotice={incompleteNotice}
      onClose={onClose}
      saveLabel="Save App"
      footerExtras={
        <>
          {resultsOn && (
            <button
              type="button"
              onClick={() => setTrying(true)}
              disabled={!html.trim()}
              className="h-[36px] px-3 bg-white border border-slate-200 hover:border-brand-blue-light text-brand-blue-primary rounded-xl font-bold text-xs uppercase tracking-wider shadow-sm transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              <Play className="w-4 h-4" />
              Try as student
            </button>
          )}
          {canAccessFeature('gemini-functions') &&
          canAccessFeature('mini-app-ai') ? (
            <button
              onClick={() => setShowPromptInput(true)}
              className="h-[36px] px-3 bg-brand-blue-primary hover:bg-brand-blue-dark text-white rounded-xl font-bold text-xs uppercase tracking-wider shadow-sm transition-colors flex items-center gap-2 active:scale-95"
              title="Generate with AI"
              {...tourTypeAttr('mini-app.draft-with-ai', 'miniApp')}
            >
              <Sparkles className="w-4 h-4" />
              Draft with AI
            </button>
          ) : null}
        </>
      }
      saveDisabled={!title.trim()}
      saveErrorMessage={false}
      bodyClassName="px-6 py-5 bg-slate-50/50"
    >
      <div className="flex flex-col gap-4 min-h-full relative">
        {/* AI generator Overlay */}
        <AIGeneratorOverlay
          open={showPromptInput}
          onClose={() => setShowPromptInput(false)}
          title="Draft with AI"
          description="Describe the mini-app you want to build."
          headerExtras={
            <button
              onClick={importFromNotes}
              className="text-xxs font-black uppercase text-indigo-500 hover:text-indigo-600 flex items-center gap-1 transition-colors"
              title="Import prompt from a Notes widget on your dashboard"
              {...tourTypeAttr('mini-app.import-from-notes', 'miniApp')}
            >
              <FileText className="w-3 h-3" /> Import from Notes
            </button>
          }
          generating={isGenerating}
          canGenerate={!!prompt.trim()}
          onGenerate={() => void handleGenerate()}
          generateLabel="Generate Code"
          closeAnchor={tourTypeAttr('mini-app.ai-close', 'miniApp')}
          generateAnchor={tourTypeAttr('mini-app.ai-generate', 'miniApp')}
        >
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g. A team randomizer for 5 groups with a spinning wheel animation and confetti effect."
            className="w-full h-32 p-4 bg-white border-2 border-indigo-100 rounded-2xl text-sm text-indigo-900 placeholder-indigo-300 focus:outline-none focus:border-indigo-500 resize-none shadow-inner"
            autoFocus
            aria-label="Describe your mini-app"
            {...tourTypeAttr('mini-app.ai-prompt', 'miniApp')}
          />
          {canAccessFeature('ai-file-context') && (
            <DriveFileAttachment
              onFileContent={(content, name) => {
                setFileContext(content);
                setFileName(name);
              }}
              disabled={isGenerating}
              anchor={tourTypeAttr('mini-app.ai-attach-drive', 'miniApp')}
            />
          )}
        </AIGeneratorOverlay>

        {trying && (
          <MiniAppTryAsStudent
            title={title || 'Mini app'}
            html={html}
            manifest={collectsResults ? draft.manifest : { questions: [] }}
            answerKey={collectsResults ? draft.key : { questions: {} }}
            onClose={() => setTrying(false)}
          />
        )}

        <div
          className={`flex-1 flex min-h-[250px] ${resultsOn ? 'flex-col lg:flex-row gap-5' : 'flex-col'}`}
        >
          {/* HTML Code textarea */}
          <div className="flex-1 flex flex-col min-h-[250px]">
            {resultsOn ? (
              <div className="mb-2">
                <SegmentedControl
                  value={view}
                  onChange={setView}
                  ariaLabel="Show the app or its code"
                  options={[
                    { value: 'preview', label: 'Preview', icon: Eye },
                    { value: 'code', label: 'Code', icon: Code2 },
                  ]}
                />
              </div>
            ) : (
              <SettingsLabel htmlFor={htmlFieldId}>HTML Code</SettingsLabel>
            )}
            {resultsOn && view === 'preview' ? (
              <iframe
                srcDoc={previewDoc}
                title={`${title || 'Mini app'} preview`}
                sandbox="allow-scripts allow-forms allow-modals"
                className="flex-1 w-full rounded-xl border border-slate-200 bg-white"
              />
            ) : (
              <textarea
                id={htmlFieldId}
                value={html}
                onChange={(e) => setHtml(e.target.value)}
                className="flex-1 w-full p-4 bg-slate-900 text-emerald-400 font-mono text-xs rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none leading-relaxed custom-scrollbar shadow-inner"
                spellCheck={false}
                {...tourTypeAttr('mini-app.html-code', 'miniApp')}
                placeholder="Paste your HTML, CSS, and JS here..."
              />
            )}
          </div>
          {resultsOn && (
            <div className="lg:w-[380px] shrink-0 flex flex-col min-h-0 lg:border-l lg:border-slate-200 lg:pl-5">
              <MiniAppKeyPanel
                collectsResults={collectsResults}
                onCollectsResultsChange={setCollectsResults}
                rows={rows}
                onRowsChange={setRows}
                problems={problems}
              />
            </div>
          )}
        </div>
      </div>
    </EditorModalShell>
  );
};
