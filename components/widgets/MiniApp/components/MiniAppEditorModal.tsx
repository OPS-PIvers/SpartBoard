/**
 * MiniAppEditorModal — full-screen modal editor for mini-app content.
 * Launched from the mini-app library view. Wraps the shared
 * EditorModalShell so it stays visually aligned with other content
 * editors (Quiz, Video Activity, Guided Learning).
 */

import React, { useEffect, useId, useMemo, useState } from 'react';
import { Code2, Eye, FileText, Play, Undo2, Wand2 } from 'lucide-react';
import { SegmentedControl } from '@/components/common/SegmentedControl';
import { injectMiniAppHelper } from '@/utils/miniAppHelper';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import {
  LibraryFolder,
  MiniAppAnswerKey,
  MiniAppItem,
  TextConfig,
} from '@/types';
import { db } from '@/config/firebase';
import { logError } from '@/utils/logError';
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
import {
  AI_PANEL_LINK_CLASS,
  AI_PROMPT_TEXTAREA_CLASS,
} from '@/components/common/aiPanelStyles';
import {
  generateMiniAppCode,
  editMiniAppCode,
  buildPromptWithFileContext,
} from '@/utils/ai';
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
  /** Results v2 is on (flag plus submissions mode): shows the answer key panel. */
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
  // Preview/Code, the light code box and Try as student need only the flag.
  const editorOn = resultsOn || canAccessFeature('mini-app-results');
  const aiOn =
    canAccessFeature('gemini-functions') && canAccessFeature('mini-app-ai');
  const aiEditOn = aiOn && canAccessFeature('mini-app-ai-edit');

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
  // The key is written only after its read succeeds, so a slow or failed read never blanks it.
  const [keyStatus, setKeyStatus] = useState<'loading' | 'ready' | 'failed'>(
    'loading'
  );
  const [savedKeyJson, setSavedKeyJson] = useState<string | null>(null);
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
  const [aiMode, setAiMode] = useState<'edit' | 'draft'>('edit');
  // The code before the last AI change, until the teacher types or undoes it.
  const [beforeAi, setBeforeAi] = useState<string | null>(null);
  const canEditWithAi = aiEditOn && html.trim() !== '';
  const editing = canEditWithAi && aiMode === 'edit';

  // --- Reset state when app prop identity changes ---
  const [prevApp, setPrevApp] = useState<MiniAppItem | null>(app);
  if (app !== prevApp) {
    setPrevApp(app);
    setTitle(app?.title ?? '');
    setHtml(app?.html ?? '');
    setCollectsResults(app?.collectsResults ?? false);
    setRows(toDrafts(app?.manifest, null));
    setLoadedKey(null);
    setKeyStatus('loading');
    setSavedKeyJson(null);
    setTrying(false);
    setView(app?.html.trim() ? 'preview' : 'code');
    setSaving(false);
    setPrompt('');
    setShowPromptInput(false);
    setIsGenerating(false);
    setAiMode('edit');
    setBeforeAi(null);
    setFileContext(null);
    setFileName(null);
  }

  const appId = app?.id;
  const uid = user?.uid;
  // The key lives outside the app doc, so it loads after open and fills the answers in.
  useEffect(() => {
    if (!resultsOn || !uid || !appId) return;
    let live = true;
    getDoc(doc(db, 'users', uid, 'mini_app_keys', appId)).then(
      (snap) => {
        if (!live) return;
        const key = snap.exists() ? (snap.data() as MiniAppAnswerKey) : null;
        setSavedKeyJson(JSON.stringify(key ?? { questions: {} }));
        setKeyStatus('ready');
        if (!key) return;
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
      },
      (err: unknown) => {
        if (!live) return;
        logError('MiniAppEditorModal.loadKey', err, { appId });
        setKeyStatus('failed');
      }
    );
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
      const writesKey = resultsOn && collectsResults;
      // Never save questions without their key: a failed key read blocks the save so it retries.
      if (writesKey && keyStatus !== 'ready')
        throw new Error('The answer key has not loaded.');
      const keyJson = JSON.stringify(draft.key);
      if (writesKey && user && keyJson !== savedKeyJson) {
        await setDoc(doc(db, 'users', user.uid, 'mini_app_keys', app.id), {
          questions: draft.key.questions,
        });
        setSavedKeyJson(keyJson);
        setLoadedKey(draft.key);
      }
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
      const result = editing
        ? await editMiniAppCode(html, fullPrompt)
        : await generateMiniAppCode(fullPrompt, 'mini-app');
      if (!editing || !title.trim()) setTitle(result.title);
      if (aiEditOn) setBeforeAi(html);
      setHtml(result.html);
      if (editorOn) setView('preview');
      setShowPromptInput(false);
      setPrompt('');
      addToast(
        editing ? 'App updated.' : 'App generated successfully!',
        'success'
      );
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
          {beforeAi !== null && (
            <button
              type="button"
              onClick={() => {
                setHtml(beforeAi);
                setBeforeAi(null);
              }}
              className="h-[36px] px-3 bg-white border border-slate-200 hover:border-brand-blue-light text-slate-700 rounded-xl font-bold text-xs uppercase tracking-wider shadow-sm transition-colors flex items-center gap-2"
              {...tourTypeAttr('mini-app.undo-ai', 'miniApp')}
            >
              <Undo2 className="w-4 h-4" />
              Undo AI change
            </button>
          )}
          {editorOn && (
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
          {aiOn ? (
            <button
              onClick={() => {
                setAiMode('edit');
                setShowPromptInput(true);
              }}
              className="h-[36px] px-3 bg-white border border-slate-200 hover:border-brand-blue-light text-slate-700 rounded-xl font-bold text-xs uppercase tracking-wider shadow-sm transition-colors flex items-center gap-2"
              title={
                canEditWithAi ? 'Change this app with AI' : 'Generate with AI'
              }
              {...tourTypeAttr('mini-app.draft-with-ai', 'miniApp')}
            >
              <Wand2 className="w-4 h-4" />
              {canEditWithAi ? 'Edit with AI' : 'Draft with AI'}
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
          title={editing ? 'Edit with AI' : 'Draft with AI'}
          description={
            editing
              ? 'Describe what to change. Everything else stays the same.'
              : 'Describe the mini-app you want to build.'
          }
          headerExtras={
            <button
              onClick={importFromNotes}
              className={AI_PANEL_LINK_CLASS}
              title="Import prompt from a Notes widget on your dashboard"
              {...tourTypeAttr('mini-app.import-from-notes', 'miniApp')}
            >
              <FileText className="w-3 h-3" /> Import from Notes
            </button>
          }
          generating={isGenerating}
          canGenerate={!!prompt.trim()}
          onGenerate={() => void handleGenerate()}
          generateLabel={editing ? 'Apply changes' : 'Draft app'}
          closeAnchor={tourTypeAttr('mini-app.ai-close', 'miniApp')}
          generateAnchor={tourTypeAttr('mini-app.ai-generate', 'miniApp')}
        >
          {canEditWithAi && (
            <SegmentedControl
              value={aiMode}
              onChange={setAiMode}
              ariaLabel="Change this app or start over"
              role="radiogroup"
              fullWidth
              anchor={tourTypeAttr('mini-app.ai-mode', 'miniApp')}
              options={[
                { value: 'edit', label: 'Change this app' },
                { value: 'draft', label: 'Start over' },
              ]}
            />
          )}
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={
              editing
                ? 'e.g. Make the buttons bigger and add a timer at the top.'
                : 'e.g. A team randomizer for 5 groups with a spinning wheel animation and confetti effect.'
            }
            className={AI_PROMPT_TEXTAREA_CLASS}
            autoFocus
            aria-label={
              editing ? 'Describe the change' : 'Describe your mini-app'
            }
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
            manifest={
              resultsOn && collectsResults ? draft.manifest : { questions: [] }
            }
            answerKey={
              resultsOn && collectsResults ? draft.key : { questions: {} }
            }
            onClose={() => setTrying(false)}
          />
        )}

        <div
          className={`flex-1 flex min-h-[250px] ${resultsOn ? 'flex-col lg:flex-row gap-5' : 'flex-col'}`}
        >
          {/* HTML Code textarea */}
          <div className="flex-1 flex flex-col min-h-[250px]">
            {editorOn ? (
              <div className="mb-2">
                <SegmentedControl
                  value={view}
                  onChange={setView}
                  ariaLabel="Show the app or its code"
                  anchor={tourTypeAttr('mini-app.view-toggle', 'miniApp')}
                  options={[
                    { value: 'preview', label: 'Preview', icon: Eye },
                    { value: 'code', label: 'Code', icon: Code2 },
                  ]}
                />
              </div>
            ) : (
              <SettingsLabel htmlFor={htmlFieldId}>HTML Code</SettingsLabel>
            )}
            {editorOn && view === 'preview' ? (
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
                onChange={(e) => {
                  setHtml(e.target.value);
                  setBeforeAi(null);
                }}
                className={
                  editorOn
                    ? 'flex-1 w-full p-4 bg-white border border-slate-200 text-slate-700 placeholder-slate-400 font-mono text-xs rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40 resize-none leading-relaxed custom-scrollbar'
                    : 'flex-1 w-full p-4 bg-slate-900 text-emerald-400 font-mono text-xs rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none leading-relaxed custom-scrollbar shadow-inner'
                }
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
