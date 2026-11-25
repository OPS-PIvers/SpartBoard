// Rubric library + criteria/levels builder in the rubric modal (M12 spec §6.1).

import { copyText } from '@/utils/copyText';
import React, { useContext, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  Copy,
  CopyPlus,
  Download,
  ExternalLink,
  Loader2,
  Share2,
  Upload,
  X,
} from 'lucide-react';
import type { Rubric, RubricCriterion, RubricLevel } from '@/types';
import {
  RUBRIC_TEMPLATE_CSV,
  RUBRIC_TEMPLATE_SHEET_URL,
} from '@/config/rubricTemplate';
import { useDialog } from '@/context/useDialog';
import { AuthContext } from '@/context/AuthContextValue';
import {
  suggestDuplicateTitle,
  useLibraryDuplicate,
} from '@/components/common/library';
import { useRubrics } from '@/hooks/useRubrics';
import { parseRubricCsv, rubricToCsv } from '@/utils/rubricCsv';
import {
  RUBRIC_MAX_LEVELS,
  RUBRIC_MIN_LEVELS,
  rubricMaxPoints,
} from '@/utils/rubricPoints';
import { useRubricLevelOrder } from '@/hooks/useRubricLevelOrder';
import { RubricTableModal } from './RubricTableModal';
import { isScoringGuide } from '@/utils/rubricGuide';
import { tourTypeAttr } from '@/config/tourAnchors';
import { librarySharePath, parseLibraryShareLink } from '@/utils/shareRoutes';

export interface RubricBuilderPanelProps {
  questionId: string;
  existingSnapshot?: Rubric;
  onAttach: (rubric: Rubric, rubricId?: string) => void;
  onDetach: () => void;
  onClose: () => void;
  teacherUid: string;
  attachLabel?: string;
  /** Attaching needs this total, so a modified rubric scores out of the same points. */
  requiredTotal?: number;
}

const labelClass =
  'block text-slate-600 font-bold uppercase tracking-wider mb-1 text-xs';
const inputClass =
  'w-full bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-brand-blue-primary/40 focus:border-brand-blue-primary px-3 py-2 text-sm';

const MIN_LEVELS = RUBRIC_MIN_LEVELS;
const MAX_LEVELS = RUBRIC_MAX_LEVELS;

// Order-stable projection of the meaningful fields, used to detect unsaved
// edits without false-positiving on key insertion order.
const rubricSignature = (r: Rubric): string =>
  JSON.stringify([
    r.title.trim(),
    r.description?.trim() ?? '',
    r.criteria.map((c) => [
      c.name.trim(),
      c.description?.trim() ?? '',
      c.levels.map((l) => [
        l.label.trim(),
        l.points,
        l.description?.trim() ?? '',
      ]),
      c.guide ? (c.guide.examples ?? []).map((e) => e.trim()) : null,
    ]),
  ]);

const newLevel = (points: number): RubricLevel => ({
  id: crypto.randomUUID(),
  label: '',
  points,
});

const newCriterion = (): RubricCriterion => ({
  id: crypto.randomUUID(),
  name: '',
  levels: [newLevel(0), newLevel(1)],
});

const blankRubric = (): Rubric => {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    title: '',
    criteria: [newCriterion()],
    createdAt: now,
    updatedAt: now,
  };
};

const validateRubric = (rubric: Rubric): string[] => {
  const errors: string[] = [];
  if (!rubric.title.trim()) errors.push('Rubric needs a title.');
  if (rubric.criteria.length === 0) errors.push('Add at least one criterion.');
  rubric.criteria.forEach((c, i) => {
    if (c.guide) {
      if (!c.name.trim()) errors.push(`Part ${i + 1} needs a label.`);
      return;
    }
    const name = c.name.trim() || `Criterion ${i + 1}`;
    if (!c.name.trim()) errors.push(`${name} needs a name.`);
    if (c.levels.length < MIN_LEVELS || c.levels.length > MAX_LEVELS) {
      errors.push(`${name} must have between 2 and 6 levels.`);
    }
    const seen = new Set<number>();
    c.levels.forEach((l, li) => {
      if (!l.label.trim())
        errors.push(`${name}: level ${li + 1} needs a label.`);
      if (!Number.isInteger(l.points) || l.points < 0) {
        errors.push(
          `${name}: level ${li + 1} points must be a whole number ≥ 0.`
        );
      } else if (seen.has(l.points)) {
        errors.push(`${name}: duplicate point value ${l.points}.`);
      } else {
        seen.add(l.points);
      }
    });
  });
  return errors;
};

// Accepts a bare share id or a pasted rubric share link.
const extractShareId = (input: string): string => {
  const trimmed = input.trim();
  const link = parseLibraryShareLink(trimmed);
  if (link) return link.shareId;
  const segments = trimmed.split(/[?#]/)[0].split('/').filter(Boolean);
  return segments[segments.length - 1] ?? '';
};

export const RubricBuilderPanel: React.FC<RubricBuilderPanelProps> = ({
  existingSnapshot,
  onAttach,
  onDetach,
  onClose,
  teacherUid,
  attachLabel = 'Attach to question',
  requiredTotal,
}) => {
  const { rubrics, saveRubric, shareRubric, importSharedRubric } =
    useRubrics(teacherUid);
  const { showConfirm } = useDialog();
  const auth = useContext(AuthContext);
  const duplicateOn =
    auth?.canAccessFeature('library-duplicate-more') ?? false;
  const [duplicateStatus, setDuplicateStatus] = useState<{
    message: string;
    tone: 'success' | 'error';
  } | null>(null);
  const rubricDuplicate = useLibraryDuplicate<Rubric>({
    duplicate: async (rubric) => {
      const now = Date.now();
      const copy: Rubric = {
        ...rubric,
        id: crypto.randomUUID(),
        title: suggestDuplicateTitle(rubric.title || 'Untitled rubric'),
        createdAt: now,
        updatedAt: now,
      };
      await saveRubric(copy);
      return copy;
    },
    addToast: (message, tone) =>
      setDuplicateStatus({
        message,
        tone: tone === 'success' ? 'success' : 'error',
      }),
    errorMessage: 'That rubric could not be duplicated.',
  });
  const [draft, setDraft] = useState<Rubric>(
    () => existingSnapshot ?? blankRubric()
  );
  // Signature of the last rubric loaded into the draft (open, library pick, or
  // save), so destructive loads can tell edited drafts from untouched ones.
  const loadedSignatureRef = useRef<string | null>(null);
  loadedSignatureRef.current ??= rubricSignature(draft);
  const [csvErrors, setCsvErrors] = useState<
    Array<{ line: number; reason: string }>
  >([]);
  const [csvWarnings, setCsvWarnings] = useState<
    Array<{ line: number; reason: string }>
  >([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [importCode, setImportCode] = useState('');
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [showCsvHelp, setShowCsvHelp] = useState(false);
  const [csvDragOver, setCsvDragOver] = useState(false);
  // Remounts the rubric modal when a library pick or CSV replaces the draft.
  const [loadCount, setLoadCount] = useState(0);
  const [levelOrder, switchLevelOrder] = useRubricLevelOrder();

  const handleDownloadTemplate = () => {
    const blob = new Blob([RUBRIC_TEMPLATE_CSV], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'rubric-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const errors = useMemo(() => validateRubric(draft), [draft]);
  const guide = isScoringGuide(draft);

  const maxSum = rubricMaxPoints(draft);
  const totalMismatch = requiredTotal !== undefined && maxSum !== requiredTotal;

  // Risk 2: attached snapshot older than the library copy it came from.
  const libraryCopy = rubrics.find((r) => r.id === existingSnapshot?.id);
  const isStale =
    !!existingSnapshot &&
    !!libraryCopy &&
    libraryCopy.updatedAt > existingSnapshot.updatedAt;

  const handleImportFile = async (file: File) => {
    const text = await file.text();
    const result = parseRubricCsv(text);
    setCsvErrors(result.errors);
    setCsvWarnings(result.warnings);
    if (result.rubric) {
      const now = Date.now();
      // The parser only ever supplies criteria, plus a generic placeholder
      // title and no description — so keep whatever the teacher already typed.
      const importedTitle = result.rubric.title?.trim();
      setDraft((prev) => ({
        ...prev,
        title: prev.title.trim() ? prev.title : (importedTitle ?? prev.title),
        description: result.rubric?.description ?? prev.description,
        criteria: result.rubric?.criteria ?? [],
        updatedAt: now,
      }));
      setLoadCount((n) => n + 1);
    }
  };

  const handleExport = () => {
    const csv = rubricToCsv(draft);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${draft.title.trim() || 'rubric'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSaveToLibrary = async () => {
    setSaveError(null);
    try {
      await saveRubric({ ...draft, updatedAt: Date.now() });
      loadedSignatureRef.current = rubricSignature(draft);
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : 'Failed to save rubric.'
      );
    }
  };

  const savedInLibrary = rubrics.find((r) => r.id === draft.id);

  const handleAttach = () => {
    if (errors.length > 0 || totalMismatch) return;
    // A new rubric joins the library so other widgets can reuse it; saving first keeps the snapshot from reading as stale.
    if (!savedInLibrary) {
      saveRubric({ ...draft, updatedAt: Date.now() }).catch((err: unknown) =>
        console.error('[RubricBuilderPanel] library save failed:', err)
      );
    }
    const attached: Rubric = { ...draft, updatedAt: Date.now() };
    onAttach(attached, attached.id);
  };
  // Sharing copies the saved library doc, so a draft that has diverged from it
  // would silently share the stale version.
  const draftDivergedFromLibrary =
    !!savedInLibrary &&
    rubricSignature(draft) !== rubricSignature(savedInLibrary);
  const canShare = !!savedInLibrary && !draftDivergedFromLibrary;
  const shareBlockedReason = canShare
    ? null
    : duplicateOn
      ? 'Save to library before sharing or duplicating.'
      : 'Save to library before sharing.';

  const handleShare = async () => {
    if (!savedInLibrary || draftDivergedFromLibrary) return;
    setSharing(true);
    setShareError(null);
    setShareUrl(null);
    setCopied(false);
    try {
      const shareId = await shareRubric(savedInLibrary.id);
      const url = `${window.location.origin}${librarySharePath('rubric', shareId)}`;
      setShareUrl(url);
      // A refused copy still leaves the link shown below for manual copy.
      if (await copyText(url)) setCopied(true);
    } catch (err) {
      setShareError(err instanceof Error ? err.message : 'Share failed.');
    } finally {
      setSharing(false);
    }
  };

  const handleCopyShareUrl = async () => {
    if (!shareUrl) return;
    if (await copyText(shareUrl)) setCopied(true);
    else setShareError('Could not copy — select and copy the link manually.');
  };

  const handleImport = async () => {
    const shareId = extractShareId(importCode);
    if (!shareId) {
      setImportError('Enter a share code or link.');
      return;
    }
    setImporting(true);
    setImportError(null);
    setImportSuccess(null);
    try {
      await importSharedRubric(shareId);
      setImportSuccess('Rubric imported into your library.');
      setImportCode('');
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Import failed.');
    } finally {
      setImporting(false);
    }
  };

  const libraryField = (
    <>
      <div>
        <label className={labelClass} htmlFor="rubric-library-select">
          Library
        </label>
        <select
          id="rubric-library-select"
          {...tourTypeAttr('quiz-rubric.builder-library', 'quiz')}
          className={`${inputClass} appearance-none`}
          value=""
          onChange={async (e) => {
            const pickedId = e.target.value;
            if (rubricSignature(draft) !== loadedSignatureRef.current) {
              const ok = await showConfirm(
                'Loading another rubric replaces the criteria and levels you have edited here. Save to library first if you want to keep them.',
                {
                  title: 'Discard unsaved rubric edits?',
                  variant: 'warning',
                  confirmLabel: 'Discard and Load',
                }
              );
              if (!ok) return;
            }
            const picked = rubrics.find((r) => r.id === pickedId);
            const next = picked ? { ...picked } : blankRubric();
            loadedSignatureRef.current = rubricSignature(next);
            setDraft(next);
            setLoadCount((n) => n + 1);
            setCsvErrors([]);
            setCsvWarnings([]);
            setShareUrl(null);
            setShareError(null);
            setCopied(false);
          }}
        >
          <option value="">New rubric…</option>
          {rubrics.map((r) => (
            <option key={r.id} value={r.id}>
              {r.title || 'Untitled rubric'}
            </option>
          ))}
        </select>
      </div>
    </>
  );
  const importBox = (
    <>
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <p className={labelClass}>Import from code or link</p>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={importCode}
            onChange={(e) => setImportCode(e.target.value)}
            placeholder="Paste a share code or link"
            aria-label="Rubric share code or link"
            {...tourTypeAttr('quiz-rubric.builder-import-code', 'quiz')}
            className={`${inputClass} flex-1`}
          />
          <button
            onClick={() => void handleImport()}
            disabled={importing || !importCode.trim()}
            aria-label="Import shared rubric"
            {...tourTypeAttr('quiz-rubric.builder-import', 'quiz')}
            className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg text-xs font-bold text-slate-700 transition-colors disabled:opacity-40"
          >
            {importing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              'Import'
            )}
          </button>
        </div>
        {importError && (
          <p className="text-xs text-rose-700" role="alert">
            {importError}
          </p>
        )}
        {importSuccess && (
          <p className="text-xs text-emerald-700" role="status">
            {importSuccess}
          </p>
        )}
      </div>
    </>
  );
  const actions = (
    <>
      <div className="flex gap-2">
        {!guide && (
          <button
            onClick={() => setShowCsvHelp(true)}
            {...tourTypeAttr('quiz-rubric.csv-import', 'quiz')}
            className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg text-xs font-bold text-slate-700 transition-colors"
          >
            <Upload className="w-3.5 h-3.5" />
            Import CSV
          </button>
        )}
        {/* no-tour-anchor: hidden file input opened by the Import CSV button */}
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          aria-label="Import rubric CSV"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleImportFile(file);
            e.target.value = '';
          }}
        />
        {!guide && (
          <button
            onClick={handleExport}
            {...tourTypeAttr('quiz-rubric.csv-export', 'quiz')}
            className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg text-xs font-bold text-slate-700 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
        )}
        <button
          onClick={() => void handleShare()}
          disabled={!canShare || sharing}
          {...tourTypeAttr('quiz-rubric.share', 'quiz')}
          className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg text-xs font-bold text-slate-700 transition-colors disabled:opacity-40"
        >
          {sharing ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Share2 className="w-3.5 h-3.5" />
          )}
          Share
        </button>
        {duplicateOn && (
          <button
            onClick={() => {
              if (!savedInLibrary) return;
              setDuplicateStatus(null);
              void rubricDuplicate.duplicate(savedInLibrary);
            }}
            disabled={
              !canShare ||
              (!!savedInLibrary &&
                rubricDuplicate.isDuplicating(savedInLibrary.id))
            }
            {...tourTypeAttr('quiz-rubric.duplicate', 'quiz')}
            className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg text-xs font-bold text-slate-700 transition-colors disabled:opacity-40"
          >
            <CopyPlus className="w-3.5 h-3.5" />
            Duplicate
          </button>
        )}
      </div>
    </>
  );
  const messages = (
    <>
      {shareBlockedReason && (
        <p className="text-xs text-slate-600">{shareBlockedReason}</p>
      )}
      {duplicateStatus && (
        <p
          className={`text-xs ${duplicateStatus.tone === 'success' ? 'text-emerald-700' : 'text-rose-700'}`}
          role={duplicateStatus.tone === 'success' ? 'status' : 'alert'}
        >
          {duplicateStatus.message}
        </p>
      )}
      {shareError && (
        <p className="text-xs text-rose-700" role="alert">
          {shareError}
        </p>
      )}
      {shareUrl && (
        <div className="flex items-center gap-2 p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
          <input
            type="text"
            readOnly
            value={shareUrl}
            aria-label="Rubric share link"
            {...tourTypeAttr('quiz-rubric.share-link', 'quiz')}
            className="flex-1 bg-transparent text-xs text-slate-700 focus:outline-hidden"
            onFocus={(e) => e.target.select()}
          />
          <button
            onClick={() => void handleCopyShareUrl()}
            aria-label="Copy rubric share link"
            {...tourTypeAttr('quiz-rubric.share-copy', 'quiz')}
            className="p-1 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-sm transition-colors focus:outline-hidden focus:ring-2 focus:ring-brand-blue-primary/40"
          >
            {copied ? (
              <Check className="w-4 h-4 text-emerald-600" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
          </button>
        </div>
      )}

      {csvErrors.length > 0 && (
        <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs space-y-1">
          {csvErrors.map((e, i) => (
            <p key={i}>
              Line {e.line}: {e.reason}
            </p>
          ))}
        </div>
      )}
      {csvWarnings.length > 0 && (
        <div className="p-2.5 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg text-xs space-y-1">
          {csvWarnings.map((w, i) => (
            <p key={i}>
              Line {w.line}: {w.reason}
            </p>
          ))}
        </div>
      )}

      {errors.length > 0 && (
        <div
          role="alert"
          className="p-2.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs space-y-1"
        >
          {errors.map((e, i) => (
            <p key={i}>{e}</p>
          ))}
        </div>
      )}
      {saveError && (
        <p className="text-xs text-rose-700" role="alert">
          {saveError}
        </p>
      )}
    </>
  );
  const csvHelp = (
    <>
      {showCsvHelp && (
        <div
          className="fixed z-modal-deep-content inset-0 bg-slate-900/40 flex items-center justify-center p-4"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              setShowCsvHelp(false);
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="CSV import format"
            className="w-full max-w-md bg-white rounded-xl shadow-2xl border border-slate-200 flex flex-col max-h-full"
          >
            <header className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
              <h4 className="font-bold text-slate-900 text-sm">
                Import rubric from CSV
              </h4>
              <button
                autoFocus
                onClick={() => setShowCsvHelp(false)}
                aria-label="Close CSV import help"
                {...tourTypeAttr('quiz-rubric.csv-help-close', 'quiz')}
                className="p-1 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-sm transition-colors focus:outline-hidden focus:ring-2 focus:ring-brand-blue-primary/40"
              >
                <X className="w-4 h-4" />
              </button>
            </header>
            <div className="p-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {RUBRIC_TEMPLATE_SHEET_URL && (
                  <a
                    href={RUBRIC_TEMPLATE_SHEET_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg text-xs font-bold text-slate-700 transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Open template in Sheets
                  </a>
                )}
                <button
                  onClick={handleDownloadTemplate}
                  {...tourTypeAttr('quiz-rubric.csv-template', 'quiz')}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg text-xs font-bold text-slate-700 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download template CSV
                </button>
              </div>
              <button
                onClick={() => {
                  setShowCsvHelp(false);
                  fileRef.current?.click();
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setCsvDragOver(true);
                }}
                onDragLeave={() => setCsvDragOver(false)}
                {...tourTypeAttr('quiz-rubric.csv-drop', 'quiz')}
                onDrop={(e) => {
                  e.preventDefault();
                  setCsvDragOver(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) {
                    setShowCsvHelp(false);
                    void handleImportFile(file);
                  }
                }}
                className={`w-full flex flex-col items-center justify-center gap-1.5 py-8 border-2 border-dashed rounded-xl text-xs font-bold transition-colors ${
                  csvDragOver
                    ? 'border-brand-blue-primary bg-brand-blue-primary/5 text-brand-blue-primary'
                    : 'border-slate-300 hover:border-brand-blue-primary/50 hover:bg-slate-50 text-slate-600'
                }`}
              >
                <Upload className="w-5 h-5" />
                Drop a CSV here, or click to choose a file
              </button>
              <p className="text-[11px] text-slate-600 text-center">
                One row per criterion, 2 to 6 levels.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );

  return (
    // Keeps Escape in the rubric modal from also closing the host editor.
    <div onKeyDown={(e) => e.stopPropagation()}>
      <RubricTableModal
        key={loadCount}
        rubric={draft}
        order={levelOrder}
        onOrderChange={switchLevelOrder}
        scores={new Map()}
        onClose={onClose}
        editStructure
        controlled={{
          draft,
          setDraft,
          toolbar: (
            <div className="mb-4 space-y-3">
              {isStale && (
                <p className="flex items-center gap-2 text-sm font-semibold text-amber-800">
                  <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
                  Library copy changed. Re-attach to update.
                </p>
              )}
              <div className="grid gap-3 md:grid-cols-2">
                {libraryField}
                {importBox}
              </div>
            </div>
          ),
          belowTable: (
            <div className="mt-4 space-y-2">
              {actions}
              {messages}
            </div>
          ),
          footer: (
            <div className="flex flex-col items-center gap-2">
              {totalMismatch && (
                <p className="text-sm font-bold text-rose-700" role="alert">
                  {`Total must be ${requiredTotal} points to match the main rubric.`}
                </p>
              )}
              <div className="flex flex-wrap justify-center gap-3">
                {existingSnapshot && (
                  <button
                    type="button"
                    onClick={onDetach}
                    {...tourTypeAttr('quiz-rubric.detach', 'quiz')}
                    className="rounded-lg px-4 py-2.5 text-sm font-bold text-rose-700 transition-colors hover:bg-rose-50"
                  >
                    Detach rubric
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void handleSaveToLibrary()}
                  disabled={errors.length > 0}
                  {...tourTypeAttr('quiz-rubric.save-library', 'quiz')}
                  className="rounded-lg border border-slate-300 bg-white px-6 py-2.5 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
                >
                  Save to library
                </button>
                <button
                  type="button"
                  onClick={handleAttach}
                  disabled={errors.length > 0 || totalMismatch}
                  {...tourTypeAttr('quiz-rubric.attach', 'quiz')}
                  className="rounded-lg bg-brand-blue-primary px-8 py-2.5 text-sm font-bold text-white transition-colors hover:bg-brand-blue-dark disabled:opacity-50"
                >
                  {attachLabel}
                </button>
              </div>
            </div>
          ),
        }}
      />
      {csvHelp}
    </div>
  );
};
