/**
 * ImportWizard — shared, adapter-driven three-step (Source → Preview → Confirm)
 * import flow for Quiz, Video Activity, Guided Learning, and MiniApp widgets.
 *
 * The wizard itself has no knowledge of column layouts, Google Sheets APIs,
 * Drive, or AI models — all widget-specific logic flows through `ImportAdapter`.
 *
 * Modal base: we use the plain `Modal` primitive (not `EditorModalShell`)
 * because this flow has per-step footers (Back / Next / Save) rather than a
 * single persistent Save button, and the discard-prompt guard in
 * `EditorModalShell` doesn't map cleanly onto a parse-preview-confirm flow.
 * The wizard is self-contained: parse/save errors surface inline here as
 * red banners, not toasts.
 */

import React, { useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Copy,
  ExternalLink,
  FileSpreadsheet,
  FileUp,
  Info,
  Loader2,
  Sparkles,
  X,
} from 'lucide-react';
import { Modal } from '../../Modal';
import type {
  ImportAdapter,
  ImportSourceKind,
  ImportSourcePayload,
  ImportWizardProps,
} from '../types';

type Step = 'source' | 'preview' | 'confirm';

const STEPS: ReadonlyArray<{ key: Step; label: string }> = [
  { key: 'source', label: 'Source' },
  { key: 'preview', label: 'Preview' },
  { key: 'confirm', label: 'Confirm' },
];

const GOOGLE_SHEET_URL_PATTERN = /docs\.google\.com\/spreadsheets/i;

function acceptExtensionsForSources(sources: ImportSourceKind[]): string {
  const exts = new Set<string>();
  if (sources.includes('csv')) exts.add('.csv');
  if (sources.includes('json')) exts.add('.json');
  if (sources.includes('html')) {
    exts.add('.html');
    exts.add('.htm');
  }
  if (sources.includes('file')) {
    exts.add('.csv');
    exts.add('.json');
    exts.add('.txt');
  }
  return Array.from(exts).join(',');
}

function inferKindFromFileName(
  fileName: string,
  supported: ImportSourceKind[]
): Exclude<ImportSourceKind, 'sheet'> {
  const lower = fileName.toLowerCase();
  if (
    (lower.endsWith('.html') || lower.endsWith('.htm')) &&
    supported.includes('html')
  )
    return 'html';
  if (lower.endsWith('.json') && supported.includes('json')) return 'json';
  if (lower.endsWith('.csv') && supported.includes('csv')) return 'csv';
  if (supported.includes('file')) return 'file';
  if (supported.includes('html')) return 'html';
  if (supported.includes('csv')) return 'csv';
  if (supported.includes('json')) return 'json';
  return 'file';
}

export function ImportWizard<TData>({
  isOpen,
  onClose,
  adapter,
  defaultTitle,
  onSaved,
}: ImportWizardProps<TData>): React.ReactElement | null {
  const [step, setStep] = useState<Step>('source');
  const [sheetUrl, setSheetUrl] = useState('');
  const [parsed, setParsed] = useState<TData | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [title, setTitle] = useState(defaultTitle ?? '');
  const [parseError, setParseError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // AI-assist overlay state.
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiGenerating, setAiGenerating] = useState(false);

  // Template helper UI state.
  const [showFormat, setShowFormat] = useState(false);
  const [creatingTemplate, setCreatingTemplate] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset ephemeral state whenever the wizard opens.
  // Using adjust-state-while-rendering so we don't need useEffect.
  const [prevOpen, setPrevOpen] = useState(isOpen);
  if (prevOpen !== isOpen) {
    setPrevOpen(isOpen);
    if (isOpen) {
      setStep('source');
      setSheetUrl('');
      setParsed(null);
      setWarnings([]);
      setTitle(defaultTitle ?? '');
      setParseError(null);
      setValidationErrors([]);
      setSaveError(null);
      setLoading(false);
      setSaving(false);
      setAiOpen(false);
      setAiPrompt('');
      setAiGenerating(false);
      setShowFormat(false);
      setCreatingTemplate(false);
    }
  }

  const supportsSheet = adapter.supportedSources.includes('sheet');
  const supportsCsv = adapter.supportedSources.includes('csv');
  const supportsJson = adapter.supportedSources.includes('json');
  const supportsHtml = adapter.supportedSources.includes('html');
  const supportsFile = adapter.supportedSources.includes('file');
  const supportsAnyUpload =
    supportsCsv || supportsJson || supportsHtml || supportsFile;

  const runParse = async (payload: ImportSourcePayload): Promise<void> => {
    setLoading(true);
    setParseError(null);
    try {
      const result = await adapter.parse(payload);
      setParsed(result.data);
      setWarnings(result.warnings);
      // If the adapter can extract a title from the parsed data (e.g. an
      // HTML `<title>` tag) and the user hasn't typed one, prefill it so
      // the derived title isn't wasted. We only overwrite empty input —
      // any title the user has already supplied wins.
      if (adapter.suggestTitle && !title.trim()) {
        const suggestion = adapter.suggestTitle(result.data);
        if (suggestion && suggestion.trim()) {
          setTitle(suggestion.trim());
        }
      }
      setStep('preview');
    } catch (err) {
      setParseError(
        err instanceof Error ? err.message : 'Failed to parse import source.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSheetSubmit = (): void => {
    if (!sheetUrl.trim()) {
      setParseError('Please enter a Google Sheet URL.');
      return;
    }
    void runParse({ kind: 'sheet', url: sheetUrl.trim() });
  };

  const handleFilePicked = async (
    e: React.ChangeEvent<HTMLInputElement>
  ): Promise<void> => {
    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (!file) return;

    const kind = inferKindFromFileName(file.name, adapter.supportedSources);
    if (kind === 'file') {
      await runParse({ kind: 'file', file });
      return;
    }
    try {
      const text = await file.text();
      await runParse({ kind, text, fileName: file.name });
    } catch (err) {
      setParseError(
        err instanceof Error ? err.message : 'Failed to read the selected file.'
      );
    }
  };

  const handleCreateTemplate = async (): Promise<void> => {
    if (!adapter.templateHelper) return;
    setCreatingTemplate(true);
    setParseError(null);
    // Open blank tab synchronously to preserve the user gesture
    // (avoids popup blockers).
    const newTab = window.open('about:blank', '_blank', 'noopener,noreferrer');
    try {
      const { url } = await adapter.templateHelper.createTemplate();
      if (newTab && !newTab.closed) {
        newTab.location.href = url;
      } else {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    } catch (err) {
      if (newTab && !newTab.closed) newTab.close();
      setParseError(
        err instanceof Error ? err.message : 'Failed to create template.'
      );
    } finally {
      setCreatingTemplate(false);
    }
  };

  const handleCopyTemplateUrl = async (): Promise<void> => {
    if (!adapter.templateHelper) return;
    setParseError(null);
    try {
      const { url } = await adapter.templateHelper.createTemplate();
      await navigator.clipboard.writeText(url);
    } catch (err) {
      setParseError(
        err instanceof Error ? err.message : 'Failed to copy template URL.'
      );
    }
  };

  const handleAiGenerate = async (): Promise<void> => {
    if (!adapter.aiAssist) return;
    if (!aiPrompt.trim()) return;
    setAiGenerating(true);
    setParseError(null);
    try {
      const data = await adapter.aiAssist.generate({ prompt: aiPrompt.trim() });
      setParsed(data);
      setWarnings([]);
      setAiOpen(false);
      setAiPrompt('');
      setStep('preview');
    } catch (err) {
      setParseError(
        err instanceof Error
          ? err.message
          : 'Failed to generate from AI. Please try again.'
      );
    } finally {
      setAiGenerating(false);
    }
  };

  const handleConfirmSave = async (): Promise<void> => {
    if (!parsed) return;
    const trimmed = title.trim();
    if (!trimmed) {
      setValidationErrors(['Please enter a title before saving.']);
      return;
    }
    const v = adapter.validate(parsed);
    if (!v.ok || v.errors.length > 0) {
      setValidationErrors(v.errors.length > 0 ? v.errors : ['Invalid import.']);
      return;
    }
    setValidationErrors([]);
    setSaveError(null);
    setSaving(true);
    try {
      await adapter.save(parsed, trimmed);
      onSaved?.(trimmed);
      onClose();
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : 'Failed to save import.'
      );
    } finally {
      setSaving(false);
    }
  };

  const stepIndicator = (
    <ol
      aria-label="Import progress"
      className="flex items-center gap-2"
      data-testid="import-wizard-steps"
    >
      {STEPS.map((s, idx) => {
        const activeIdx = STEPS.findIndex((x) => x.key === step);
        const state: 'active' | 'done' | 'upcoming' =
          idx < activeIdx ? 'done' : idx === activeIdx ? 'active' : 'upcoming';
        const tone =
          state === 'active'
            ? 'bg-brand-blue-primary text-white'
            : state === 'done'
              ? 'bg-emerald-500 text-white'
              : 'bg-slate-200 text-slate-500';
        return (
          <li key={s.key} className="flex items-center gap-2">
            <span
              aria-current={state === 'active' ? 'step' : undefined}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-black uppercase tracking-widest ${tone}`}
            >
              <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-white/25 text-[10px]">
                {idx + 1}
              </span>
              {s.label}
            </span>
            {idx < STEPS.length - 1 && (
              <span
                aria-hidden="true"
                className="w-4 h-px bg-slate-300 shrink-0"
              />
            )}
          </li>
        );
      })}
    </ol>
  );

  const customHeader = (
    <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-slate-200 shrink-0 bg-white rounded-t-2xl">
      <div className="flex flex-col min-w-0">
        <h3
          id="import-wizard-title"
          className="font-black text-lg text-slate-800 truncate"
        >
          Import {adapter.widgetLabel}
        </h3>
        <div className="mt-2">{stepIndicator}</div>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="p-1.5 hover:bg-slate-100 rounded-full text-slate-400 transition-colors shrink-0"
        aria-label="Close import wizard"
      >
        <X size={20} />
      </button>
    </div>
  );

  /* ─── Source step ───────────────────────────────────────────────────── */

  const sourceStep = (
    <div className="space-y-4">
      {adapter.templateHelper && (
        <div className="rounded-2xl border border-brand-blue-primary/20 bg-brand-blue-lighter/20 p-3">
          <button
            type="button"
            onClick={() => setShowFormat((v) => !v)}
            className="w-full flex items-center gap-2 text-brand-blue-primary text-xs font-bold"
          >
            <Info className="w-3.5 h-3.5 shrink-0" />
            <span>Template &amp; format help</span>
            <span className="ml-auto opacity-50">{showFormat ? '▲' : '▼'}</span>
          </button>
          {showFormat && (
            <div className="mt-3 space-y-3 text-xs">
              <div className="text-slate-700 leading-relaxed">
                {adapter.templateHelper.instructions}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void handleCreateTemplate()}
                  disabled={creatingTemplate}
                  className="flex-1 min-w-[160px] inline-flex items-center justify-center gap-1.5 py-2 bg-white border-2 border-brand-blue-primary/20 hover:border-brand-blue-primary/40 rounded-xl text-brand-blue-primary font-black transition-all shadow-sm active:scale-95 disabled:opacity-50 text-xs uppercase tracking-widest"
                >
                  {creatingTemplate ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                  )}
                  Create template
                  <ExternalLink className="w-3 h-3 opacity-40" />
                </button>
                <button
                  type="button"
                  onClick={() => void handleCopyTemplateUrl()}
                  className="flex-1 min-w-[160px] inline-flex items-center justify-center gap-1.5 py-2 bg-white border-2 border-brand-blue-primary/20 hover:border-brand-blue-primary/40 rounded-xl text-brand-blue-primary font-black transition-all shadow-sm active:scale-95 text-xs uppercase tracking-widest"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Copy template URL
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {adapter.aiAssist && (
        <button
          type="button"
          onClick={() => setAiOpen(true)}
          className="w-full py-4 bg-gradient-to-br from-indigo-500/10 to-purple-500/10 hover:from-indigo-500/20 hover:to-purple-500/20 border-2 border-dashed border-indigo-500/30 rounded-2xl flex flex-col items-center justify-center gap-1 transition-all group active:scale-95"
          aria-label={`AI-assist import for ${adapter.widgetLabel}`}
        >
          <Sparkles className="w-6 h-6 text-indigo-500 group-hover:scale-110 transition-transform" />
          <span className="font-black text-indigo-600 text-xs uppercase tracking-widest">
            AI-assist
          </span>
          <p className="text-[11px] text-indigo-400 font-bold">
            Describe it and we&apos;ll draft it.
          </p>
        </button>
      )}

      {supportsSheet && (
        <div className="space-y-2">
          <label
            htmlFor="import-wizard-sheet-url"
            className="block text-xs font-black uppercase tracking-widest text-slate-500"
          >
            Google Sheet URL
          </label>
          <div className="flex gap-2">
            <input
              id="import-wizard-sheet-url"
              type="url"
              value={sheetUrl}
              onChange={(e) => setSheetUrl(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/…"
              className="flex-1 px-4 py-2 bg-white border-2 border-slate-200 rounded-xl text-slate-800 font-medium placeholder-slate-400 focus:outline-none focus:border-brand-blue-primary transition-colors"
            />
            <button
              type="button"
              onClick={handleSheetSubmit}
              disabled={loading || !sheetUrl.trim()}
              className="px-4 py-2 bg-brand-blue-primary hover:bg-brand-blue-dark disabled:bg-slate-300 text-white font-bold rounded-xl transition-colors shadow-sm active:scale-95 flex items-center justify-center"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FileSpreadsheet className="w-4 h-4" />
              )}
            </button>
          </div>
          {sheetUrl.trim() !== '' &&
            !GOOGLE_SHEET_URL_PATTERN.test(sheetUrl) && (
              <p className="text-[11px] text-amber-600 font-bold">
                Hint: this doesn&apos;t look like a Google Sheets URL. Make sure
                it&apos;s shared for viewing.
              </p>
            )}
        </div>
      )}

      {supportsAnyUpload && (
        <div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={loading}
            className="w-full py-4 bg-brand-blue-lighter/30 hover:bg-brand-blue-lighter/60 disabled:opacity-40 border-2 border-dashed border-brand-blue-primary/30 rounded-2xl flex flex-col items-center justify-center gap-1 transition-all group active:scale-95"
          >
            <FileUp className="w-6 h-6 text-brand-blue-primary group-hover:scale-110 transition-transform" />
            <span className="font-bold text-brand-blue-primary text-sm">
              {supportsHtml && !supportsCsv && !supportsJson && !supportsFile
                ? 'Upload HTML file'
                : 'Upload file'}
            </span>
            <p className="text-[11px] text-brand-blue-primary/60 font-bold">
              {supportsHtml && !supportsCsv && !supportsJson && !supportsFile
                ? '.html or .htm'
                : supportsCsv && supportsJson
                  ? 'CSV or JSON'
                  : supportsCsv
                    ? 'CSV'
                    : supportsJson
                      ? 'JSON'
                      : 'File'}
            </p>
          </button>
          <input
            type="file"
            ref={fileInputRef}
            accept={acceptExtensionsForSources(adapter.supportedSources)}
            onChange={(e) => void handleFilePicked(e)}
            className="hidden"
            aria-label="Upload import file"
          />
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center gap-2 py-2 text-brand-blue-primary font-bold text-sm">
          <Loader2 className="w-4 h-4 animate-spin" />
          Parsing…
        </div>
      )}

      {parseError && (
        <div
          role="alert"
          className="flex items-start gap-2 p-3 bg-brand-red-lighter/40 border border-brand-red-primary/20 rounded-xl text-brand-red-dark font-medium text-sm"
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{parseError}</span>
        </div>
      )}
    </div>
  );

  /* ─── Preview step ──────────────────────────────────────────────────── */

  const previewStep = (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        {parsed != null ? (
          adapter.renderPreview(parsed)
        ) : (
          <p className="text-sm text-slate-500">No preview available.</p>
        )}
      </div>
      {warnings.length > 0 && (
        <ul
          role="alert"
          aria-label="Import warnings"
          className="space-y-1.5 rounded-xl border border-amber-300/60 bg-amber-50 p-3"
        >
          {warnings.map((w, i) => (
            <li
              key={i}
              className="flex items-start gap-2 text-amber-800 text-xs font-medium"
            >
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{w}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  /* ─── Confirm step ──────────────────────────────────────────────────── */

  const confirmStep = (
    <div className="space-y-4">
      <div>
        <label
          htmlFor="import-wizard-title-input"
          className="block text-xs font-black uppercase tracking-widest text-slate-500 mb-1.5"
        >
          Title
        </label>
        <input
          id="import-wizard-title-input"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={`Untitled ${adapter.widgetLabel}`}
          className="w-full px-4 py-2 bg-white border-2 border-slate-200 rounded-xl text-slate-800 font-medium placeholder-slate-400 focus:outline-none focus:border-brand-blue-primary transition-colors"
        />
      </div>
      {validationErrors.length > 0 && (
        <ul
          role="alert"
          aria-label="Validation errors"
          className="space-y-1.5 rounded-xl border border-brand-red-primary/30 bg-brand-red-lighter/40 p-3"
        >
          {validationErrors.map((e, i) => (
            <li
              key={i}
              className="flex items-start gap-2 text-brand-red-dark text-sm font-medium"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{e}</span>
            </li>
          ))}
        </ul>
      )}
      {saveError && (
        <div
          role="alert"
          className="flex items-start gap-2 p-3 bg-brand-red-lighter/40 border border-brand-red-primary/20 rounded-xl text-brand-red-dark font-medium text-sm"
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{saveError}</span>
        </div>
      )}
    </div>
  );

  /* ─── Footer ────────────────────────────────────────────────────────── */

  const footer = (
    <div className="flex items-center justify-between gap-3 px-6 py-3 bg-white">
      {step === 'source' ? (
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
        >
          Cancel
        </button>
      ) : (
        <button
          type="button"
          onClick={() => {
            setSaveError(null);
            setValidationErrors([]);
            setStep(step === 'confirm' ? 'preview' : 'source');
          }}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
      )}

      <div className="flex items-center gap-2">
        {step === 'preview' && (
          <button
            type="button"
            onClick={() => setStep('confirm')}
            disabled={parsed == null}
            className="inline-flex items-center gap-1.5 px-5 py-2 bg-brand-blue-primary hover:bg-brand-blue-dark text-white text-sm font-bold rounded-xl transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Continue
          </button>
        )}
        {step === 'confirm' && (
          <button
            type="button"
            onClick={() => void handleConfirmSave()}
            disabled={saving || parsed == null}
            className="inline-flex items-center gap-1.5 px-5 py-2 bg-brand-blue-primary hover:bg-brand-blue-dark text-white text-sm font-bold rounded-xl transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                Save to library
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );

  const body =
    step === 'source'
      ? sourceStep
      : step === 'preview'
        ? previewStep
        : confirmStep;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      customHeader={customHeader}
      footer={footer}
      footerClassName="shrink-0 border-t border-slate-200 rounded-b-2xl"
      maxWidth="max-w-2xl"
      className="font-sans"
      contentClassName="px-6 py-5 bg-slate-50"
      ariaLabelledby="import-wizard-title"
    >
      <div className="relative">
        {body}

        {aiOpen && adapter.aiAssist && (
          <AiAssistOverlay
            widgetLabel={adapter.widgetLabel}
            placeholder={adapter.aiAssist.promptPlaceholder}
            prompt={aiPrompt}
            onPromptChange={setAiPrompt}
            isGenerating={aiGenerating}
            onCancel={() => {
              setAiOpen(false);
              setAiPrompt('');
            }}
            onGenerate={() => void handleAiGenerate()}
          />
        )}
      </div>
    </Modal>
  );
}

/* ─── AI-assist overlay ──────────────────────────────────────────────── */

interface AiAssistOverlayProps {
  widgetLabel: string;
  placeholder: string;
  prompt: string;
  onPromptChange: (next: string) => void;
  isGenerating: boolean;
  onCancel: () => void;
  onGenerate: () => void;
}

const AiAssistOverlay: React.FC<AiAssistOverlayProps> = ({
  widgetLabel,
  placeholder,
  prompt,
  onPromptChange,
  isGenerating,
  onCancel,
  onGenerate,
}) => (
  <div
    role="dialog"
    aria-label={`AI-assist for ${widgetLabel}`}
    className="absolute inset-0 z-10 bg-white/95 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200 -mx-6 -my-5"
    onKeyDown={(e) => {
      if (e.key === 'Escape') onCancel();
    }}
  >
    <div className="w-full max-w-md space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-black text-indigo-600 flex items-center gap-2 uppercase tracking-tight">
          <Sparkles className="w-5 h-5" /> AI-assist
        </h4>
        <button
          type="button"
          onClick={onCancel}
          className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600"
          aria-label="Close AI-assist"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
      <p className="text-xs text-slate-500 font-bold uppercase tracking-widest opacity-70">
        Describe the {widgetLabel.toLowerCase()} you want to create.
      </p>
      <textarea
        value={prompt}
        onChange={(e) => onPromptChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-32 p-4 bg-white border-2 border-indigo-100 rounded-2xl text-sm text-indigo-900 placeholder-indigo-300 focus:outline-none focus:border-indigo-500 resize-none shadow-inner"
        aria-label={`AI-assist prompt for ${widgetLabel}`}
      />
      <button
        type="button"
        onClick={onGenerate}
        disabled={isGenerating || !prompt.trim()}
        className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-indigo-200 transition-all flex items-center justify-center gap-2"
      >
        {isGenerating ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" /> Generating…
          </>
        ) : (
          <>
            <Sparkles className="w-4 h-4" /> Generate
          </>
        )}
      </button>
    </div>
  </div>
);

// Re-export the adapter/type contract at the import point for consumer
// convenience — this keeps Wave 2 migration imports tidy.
export type { ImportAdapter, ImportWizardProps };
