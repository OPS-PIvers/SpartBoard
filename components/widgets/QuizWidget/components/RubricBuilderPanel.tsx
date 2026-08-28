// Rubric library + criteria/levels builder slide-over (M12 spec §6.1).

import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Check,
  Copy,
  Download,
  ExternalLink,
  Loader2,
  Plus,
  Share2,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { Rubric, RubricCriterion, RubricLevel } from '@/types';
import {
  RUBRIC_TEMPLATE_CSV,
  RUBRIC_TEMPLATE_SHEET_URL,
} from '@/config/rubricTemplate';
import { useDialog } from '@/context/useDialog';
import { useRubrics } from '@/hooks/useRubrics';
import { parseRubricCsv, rubricToCsv } from '@/utils/rubricCsv';
import { rubricMaxPoints } from '@/utils/rubricPoints';

export interface RubricBuilderPanelProps {
  questionId: string;
  existingSnapshot?: Rubric;
  onAttach: (rubric: Rubric, rubricId?: string) => void;
  onDetach: () => void;
  onClose: () => void;
  teacherUid: string;
}

const labelClass =
  'block text-slate-600 font-bold uppercase tracking-wider mb-1 text-xs';
const inputClass =
  'w-full bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40 focus:border-brand-blue-primary px-3 py-2 text-sm';

const MIN_LEVELS = 2;
const MAX_LEVELS = 6;
const MIN_CRITERIA = 1;

const PANEL_WIDTH_KEY = 'spartboard_rubric_builder_width';
const DEFAULT_PANEL_WIDTH = 640;
const MIN_PANEL_WIDTH = 400;
const MAX_PANEL_FRACTION = 0.85;

const readStoredPanelWidth = (): number => {
  try {
    const v = parseInt(localStorage.getItem(PANEL_WIDTH_KEY) ?? '', 10);
    if (Number.isFinite(v) && v >= MIN_PANEL_WIDTH) return v;
  } catch {
    // localStorage unavailable — fall through to the default.
  }
  return DEFAULT_PANEL_WIDTH;
};

const storePanelWidth = (w: number) => {
  try {
    localStorage.setItem(PANEL_WIDTH_KEY, String(w));
  } catch {
    // Best-effort persistence only.
  }
};

const autoGrow = (el: HTMLTextAreaElement | null) => {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
};

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

// Accepts a bare share id or a pasted share URL (`/share/rubric/{id}`) and
// returns the id, mirroring how quiz share links resolve to a doc id.
const extractShareId = (input: string): string => {
  const trimmed = input.trim();
  if (!trimmed) return '';
  try {
    const url = new URL(trimmed);
    const segments = url.pathname.split('/').filter(Boolean);
    return segments[segments.length - 1] ?? '';
  } catch {
    // Scheme-less pastes (`spartboard.web.app/share/rubric/abc`) fail URL
    // parsing — fall back to the last path segment; bare codes pass through.
    if (trimmed.includes('/')) {
      const segments = trimmed.split(/[?#]/)[0].split('/').filter(Boolean);
      return segments[segments.length - 1] ?? '';
    }
    return trimmed;
  }
};

const move = <T,>(list: T[], from: number, to: number): T[] => {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
};

export const RubricBuilderPanel: React.FC<RubricBuilderPanelProps> = ({
  existingSnapshot,
  onAttach,
  onDetach,
  onClose,
  teacherUid,
}) => {
  const { rubrics, saveRubric, shareRubric, importSharedRubric } =
    useRubrics(teacherUid);
  const { showConfirm } = useDialog();
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
  const didAutoFocus = useRef(false);
  const asideRef = useRef<HTMLElement>(null);
  const [panelWidth, setPanelWidth] = useState<number>(readStoredPanelWidth);
  const [showCsvHelp, setShowCsvHelp] = useState(false);
  const [csvDragOver, setCsvDragOver] = useState(false);

  // Clamp against the containing block (the editor modal body), not the DOM
  // parent — the panel may stretch across both editor panes.
  const clampPanelWidth = useCallback((w: number): number => {
    const boundsWidth =
      asideRef.current?.offsetParent?.getBoundingClientRect().width ?? 0;
    const max = boundsWidth
      ? Math.max(MIN_PANEL_WIDTH, Math.round(boundsWidth * MAX_PANEL_FRACTION))
      : Number.MAX_SAFE_INTEGER;
    return Math.min(max, Math.max(MIN_PANEL_WIDTH, Math.round(w)));
  }, []);

  const handleResizeStart = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      const bounds = asideRef.current?.offsetParent;
      if (!bounds) return;
      const rect = bounds.getBoundingClientRect();
      let latest = panelWidth;
      const onMove = (ev: PointerEvent) => {
        latest = clampPanelWidth(rect.right - ev.clientX);
        setPanelWidth(latest);
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        storePanelWidth(latest);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [clampPanelWidth, panelWidth]
  );

  const nudgePanelWidth = useCallback(
    (delta: number) => {
      setPanelWidth((prev) => {
        const next = clampPanelWidth(prev + delta);
        storePanelWidth(next);
        return next;
      });
    },
    [clampPanelWidth]
  );

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

  // Move focus into the panel once on open.
  const focusCloseButton = useCallback((el: HTMLButtonElement | null) => {
    if (el && !didAutoFocus.current) {
      didAutoFocus.current = true;
      el.focus();
    }
  }, []);

  const errors = useMemo(() => validateRubric(draft), [draft]);
  const maxSum = rubricMaxPoints(draft);

  // Risk 2: attached snapshot older than the library copy it came from.
  const libraryCopy = rubrics.find((r) => r.id === existingSnapshot?.id);
  const isStale =
    !!existingSnapshot &&
    !!libraryCopy &&
    libraryCopy.updatedAt > existingSnapshot.updatedAt;

  const patchCriterion = useCallback(
    (criterionId: string, patch: Partial<RubricCriterion>) => {
      setDraft((prev) => ({
        ...prev,
        criteria: prev.criteria.map((c) =>
          c.id === criterionId ? { ...c, ...patch } : c
        ),
      }));
    },
    []
  );

  const patchLevel = useCallback(
    (criterionId: string, levelId: string, patch: Partial<RubricLevel>) => {
      setDraft((prev) => ({
        ...prev,
        criteria: prev.criteria.map((c) =>
          c.id === criterionId
            ? {
                ...c,
                levels: c.levels.map((l) =>
                  l.id === levelId ? { ...l, ...patch } : l
                ),
              }
            : c
        ),
      }));
    },
    []
  );

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

  const handleAttach = () => {
    if (errors.length > 0) return;
    const attached: Rubric = { ...draft, updatedAt: Date.now() };
    onAttach(attached, attached.id);
  };

  const savedInLibrary = rubrics.find((r) => r.id === draft.id);
  // Sharing copies the saved library doc, so a draft that has diverged from it
  // would silently share the stale version.
  const draftDivergedFromLibrary =
    !!savedInLibrary &&
    rubricSignature(draft) !== rubricSignature(savedInLibrary);
  const canShare = !!savedInLibrary && !draftDivergedFromLibrary;
  const shareBlockedReason = canShare
    ? null
    : 'Save to library before sharing.';

  const handleShare = async () => {
    if (!savedInLibrary || draftDivergedFromLibrary) return;
    setSharing(true);
    setShareError(null);
    setShareUrl(null);
    setCopied(false);
    try {
      const shareId = await shareRubric(savedInLibrary.id);
      const url = `${window.location.origin}/share/rubric/${shareId}`;
      setShareUrl(url);
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
        } catch {
          // Clipboard write can fail (permissions/insecure context) — the
          // link is still shown below for manual copy.
        }
      }
    } catch (err) {
      setShareError(err instanceof Error ? err.message : 'Share failed.');
    } finally {
      setSharing(false);
    }
  };

  const handleCopyShareUrl = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
    } catch {
      setShareError('Could not copy — select and copy the link manually.');
    }
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

  return (
    <aside
      ref={asideRef}
      className="absolute inset-y-0 right-0 max-w-full bg-white border-l border-slate-200 shadow-xl z-20 flex flex-col"
      style={{ width: panelWidth }}
      aria-label="Rubric builder"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize rubric builder"
        tabIndex={0}
        onPointerDown={handleResizeStart}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') {
            e.preventDefault();
            nudgePanelWidth(32);
          } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            nudgePanelWidth(-32);
          }
        }}
        className="absolute inset-y-0 left-0 w-1.5 cursor-col-resize hover:bg-brand-blue-primary/30 focus:outline-none focus:bg-brand-blue-primary/40 z-30 touch-none"
      />
      <header className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
        <h3 className="font-bold text-slate-900 text-sm">Rubric</h3>
        <button
          ref={focusCloseButton}
          onClick={onClose}
          aria-label="Close rubric builder"
          className="p-1 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40"
        >
          <X className="w-4 h-4" />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {isStale && (
          <div className="flex gap-2 p-2.5 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg text-xs">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <p>Library copy has changed — re-attach to update.</p>
          </div>
        )}

        <div>
          <label className={labelClass} htmlFor="rubric-library-select">
            Library
          </label>
          <select
            id="rubric-library-select"
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

        <div className="border border-slate-200 rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-bold text-slate-700">
              Import from code or link
            </p>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={importCode}
              onChange={(e) => setImportCode(e.target.value)}
              placeholder="Paste a share code or link"
              aria-label="Rubric share code or link"
              className={`${inputClass} flex-1`}
            />
            <button
              onClick={() => void handleImport()}
              disabled={importing || !importCode.trim()}
              aria-label="Import shared rubric"
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

        <div>
          <label className={labelClass} htmlFor="rubric-title">
            Title
          </label>
          <input
            id="rubric-title"
            type="text"
            value={draft.title}
            onChange={(e) =>
              setDraft((prev) => ({ ...prev, title: e.target.value }))
            }
            placeholder="e.g. Argumentative Paragraph"
            className={inputClass}
          />
        </div>

        {draft.criteria.map((c, ci) => (
          <div
            key={c.id}
            className="border border-slate-200 rounded-lg p-3 space-y-2"
          >
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={c.name}
                onChange={(e) => patchCriterion(c.id, { name: e.target.value })}
                placeholder={`Criterion ${ci + 1}`}
                aria-label={`Criterion ${ci + 1} name`}
                className={inputClass}
              />
              <button
                onClick={() =>
                  setDraft((prev) => ({
                    ...prev,
                    criteria: move(prev.criteria, ci, ci - 1),
                  }))
                }
                disabled={ci === 0}
                aria-label={`Move criterion ${ci + 1} up`}
                className="p-1 rounded text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors disabled:opacity-30 focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40"
              >
                <ArrowUp className="w-4 h-4" />
              </button>
              <button
                onClick={() =>
                  setDraft((prev) => ({
                    ...prev,
                    criteria: move(prev.criteria, ci, ci + 1),
                  }))
                }
                disabled={ci === draft.criteria.length - 1}
                aria-label={`Move criterion ${ci + 1} down`}
                className="p-1 rounded text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors disabled:opacity-30 focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40"
              >
                <ArrowDown className="w-4 h-4" />
              </button>
              <button
                onClick={() =>
                  setDraft((prev) => ({
                    ...prev,
                    criteria: prev.criteria.filter((x) => x.id !== c.id),
                  }))
                }
                disabled={draft.criteria.length <= MIN_CRITERIA}
                aria-label={`Remove criterion ${ci + 1}`}
                className="p-1 rounded-lg text-slate-500 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-30 focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            {c.levels.map((l, li) => (
              <div key={l.id} className="flex items-start gap-2">
                <textarea
                  rows={1}
                  ref={autoGrow}
                  value={l.label}
                  onChange={(e) => {
                    patchLevel(c.id, l.id, { label: e.target.value });
                    autoGrow(e.target);
                  }}
                  placeholder="Level label"
                  aria-label={`Criterion ${ci + 1} level ${li + 1} label`}
                  className={`${inputClass} resize-y overflow-hidden min-h-[38px]`}
                />
                <input
                  type="number"
                  min={0}
                  value={l.points}
                  onChange={(e) =>
                    patchLevel(c.id, l.id, {
                      points: parseInt(e.target.value, 10) || 0,
                    })
                  }
                  aria-label={`Criterion ${ci + 1} level ${li + 1} points`}
                  className={`${inputClass} w-20`}
                />
                <textarea
                  rows={1}
                  ref={autoGrow}
                  value={l.description ?? ''}
                  onChange={(e) => {
                    patchLevel(c.id, l.id, {
                      description: e.target.value || undefined,
                    });
                    autoGrow(e.target);
                  }}
                  placeholder="Description"
                  aria-label={`Criterion ${ci + 1} level ${li + 1} description`}
                  className={`${inputClass} resize-y overflow-hidden min-h-[38px]`}
                />
                <button
                  onClick={() =>
                    patchCriterion(c.id, {
                      levels: c.levels.filter((x) => x.id !== l.id),
                    })
                  }
                  disabled={c.levels.length <= MIN_LEVELS}
                  aria-label={`Remove criterion ${ci + 1} level ${li + 1}`}
                  className="p-1 rounded-lg text-slate-500 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-30 focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}

            {c.levels.length < MAX_LEVELS && (
              <button
                onClick={() =>
                  patchCriterion(c.id, {
                    levels: [
                      ...c.levels,
                      newLevel(
                        c.levels.reduce((m, l) => Math.max(m, l.points), -1) + 1
                      ),
                    ],
                  })
                }
                className="flex items-center gap-1.5 text-xs font-bold text-brand-blue-primary hover:text-brand-blue-dark transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Level
              </button>
            )}
          </div>
        ))}

        <button
          onClick={() =>
            setDraft((prev) => ({
              ...prev,
              criteria: [...prev.criteria, newCriterion()],
            }))
          }
          className="flex items-center justify-center gap-1.5 w-full py-2 border-2 border-dashed border-slate-300 hover:border-brand-blue-primary/40 hover:bg-slate-100 hover:text-brand-blue-primary rounded-lg text-slate-600 font-bold text-xs transition-all"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Criterion
        </button>

        <div className="flex gap-2">
          <button
            onClick={() => setShowCsvHelp(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg text-xs font-bold text-slate-700 transition-colors"
          >
            <Upload className="w-3.5 h-3.5" />
            Import CSV
          </button>
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
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg text-xs font-bold text-slate-700 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
          <button
            onClick={() => void handleShare()}
            disabled={!canShare || sharing}
            className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg text-xs font-bold text-slate-700 transition-colors disabled:opacity-40"
          >
            {sharing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Share2 className="w-3.5 h-3.5" />
            )}
            Share
          </button>
        </div>

        {shareBlockedReason && (
          <p className="text-xs text-slate-600">{shareBlockedReason}</p>
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
              className="flex-1 bg-transparent text-xs text-slate-700 focus:outline-none"
              onFocus={(e) => e.target.select()}
            />
            <button
              onClick={() => void handleCopyShareUrl()}
              aria-label="Copy rubric share link"
              className="p-1 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40"
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
      </div>

      <footer className="border-t border-slate-200 p-4 space-y-2">
        <p className="text-xs text-slate-600 font-bold">
          Total points: {maxSum}
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => void handleSaveToLibrary()}
            disabled={errors.length > 0}
            className="flex-1 px-3 py-2 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg text-xs font-bold text-slate-700 transition-colors disabled:opacity-40"
          >
            Save to library
          </button>
          <button
            onClick={handleAttach}
            disabled={errors.length > 0}
            className="flex-1 px-3 py-2 bg-brand-blue-primary hover:bg-brand-blue-dark text-white rounded-lg text-xs font-bold transition-colors disabled:opacity-40"
          >
            Attach to question
          </button>
        </div>
        {existingSnapshot && (
          <button
            onClick={onDetach}
            className="w-full px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50 rounded-lg transition-colors"
          >
            Detach rubric
          </button>
        )}
      </footer>

      {showCsvHelp && (
        <div
          className="absolute inset-0 z-40 bg-slate-900/40 flex items-center justify-center p-4"
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
                className="p-1 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40"
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
                One row per criterion, 2–6 levels — the template shows the
                format.
              </p>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};
