import React, { useEffect, useState } from 'react';
import { Save, X, Loader2, AlertTriangle, Pencil } from 'lucide-react';
import { WidgetLayout } from '@/components/widgets/WidgetLayout';
import { PageEditor } from './PageEditor';

interface PageEditorOverlayProps {
  /** Download URL of the page SVG to edit. */
  pageUrl: string;
  pageNumber: number; // 1-based
  totalPages: number;
  isSaving: boolean;
  onSave: (svg: string) => void | Promise<void>;
  onClose: () => void;
}

/**
 * Full-surface page editor shown when the SMART Notebook widget enters edit
 * mode. Fetches the page's SVG text (requires Storage CORS for GET), hosts the
 * PageEditor, and saves the edited SVG via the host's onSave.
 */
export const PageEditorOverlay: React.FC<PageEditorOverlayProps> = ({
  pageUrl,
  pageNumber,
  totalPages,
  isSaving,
  onSave,
  onClose,
}) => {
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editedSvg, setEditedSvg] = useState<string | null>(null);

  // Reset state when the page changes (adjust-state-while-rendering, so the
  // loading effect below stays free of synchronous setState).
  const [prevUrl, setPrevUrl] = useState(pageUrl);
  if (pageUrl !== prevUrl) {
    setPrevUrl(pageUrl);
    setSvg(null);
    setError(null);
    setEditedSvg(null);
  }

  // Load the page SVG text for editing.
  useEffect(() => {
    let cancelled = false;
    fetch(pageUrl)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then((text) => {
        if (!cancelled) setSvg(text);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          console.error('Failed to load page for editing', err);
          setError(
            'Could not load this page for editing. (Storage read access may not be configured.)'
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [pageUrl]);

  const dirty = editedSvg !== null;

  return (
    <WidgetLayout
      padding="p-0"
      header={
        <div
          className="flex items-center justify-between shrink-0 border-b border-slate-200 bg-white"
          style={{ padding: 'min(12px, 3cqmin)' }}
        >
          <div
            className="flex items-center"
            style={{ gap: 'min(8px, 2cqmin)' }}
          >
            <Pencil
              className="text-indigo-600"
              style={{
                width: 'min(16px, 4cqmin)',
                height: 'min(16px, 4cqmin)',
              }}
            />
            <span
              className="font-black text-slate-700 uppercase tracking-widest"
              style={{ fontSize: 'min(12px, 3cqmin)' }}
            >
              Editing · Page {pageNumber} of {totalPages}
            </span>
          </div>
          <div
            className="flex items-center"
            style={{ gap: 'min(8px, 2cqmin)' }}
          >
            <button
              onClick={() => void onSave(editedSvg ?? '')}
              disabled={!dirty || isSaving || !svg}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-xl shadow-sm flex items-center transition-all active:scale-95"
              style={{
                padding: 'min(8px, 2cqmin) min(12px, 2.5cqmin)',
                gap: 'min(6px, 1.5cqmin)',
              }}
            >
              {isSaving ? (
                <Loader2
                  className="animate-spin"
                  style={{
                    width: 'min(14px, 3.5cqmin)',
                    height: 'min(14px, 3.5cqmin)',
                  }}
                />
              ) : (
                <Save
                  style={{
                    width: 'min(14px, 3.5cqmin)',
                    height: 'min(14px, 3.5cqmin)',
                  }}
                />
              )}
              <span
                className="font-bold uppercase tracking-tight"
                style={{ fontSize: 'min(11px, 2.8cqmin)' }}
              >
                {isSaving ? 'Saving…' : 'Save'}
              </span>
            </button>
            <button
              onClick={onClose}
              disabled={isSaving}
              className="bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white rounded-xl shadow-sm transition-all active:scale-95"
              style={{ padding: 'min(8px, 2cqmin)' }}
              title="Close editor"
            >
              <X
                style={{
                  width: 'min(16px, 4cqmin)',
                  height: 'min(16px, 4cqmin)',
                }}
              />
            </button>
          </div>
        </div>
      }
      content={
        <div className="flex-1 h-full w-full bg-slate-100">
          {error ? (
            <div
              className="h-full w-full flex flex-col items-center justify-center text-center text-slate-600"
              style={{ gap: 'min(12px, 3cqmin)', padding: 'min(24px, 5cqmin)' }}
            >
              <AlertTriangle
                className="text-red-500"
                style={{
                  width: 'min(32px, 9cqmin)',
                  height: 'min(32px, 9cqmin)',
                }}
              />
              <p
                className="font-semibold max-w-xs"
                style={{ fontSize: 'min(14px, 5.5cqmin)' }}
              >
                {error}
              </p>
            </div>
          ) : !svg ? (
            <div className="h-full w-full flex items-center justify-center">
              <Loader2
                className="text-indigo-500 animate-spin"
                style={{
                  width: 'min(32px, 9cqmin)',
                  height: 'min(32px, 9cqmin)',
                }}
              />
            </div>
          ) : (
            <PageEditor svg={svg} onChange={setEditedSvg} />
          )}
        </div>
      }
      footer={
        <div
          className="flex items-center justify-center shrink-0 border-t border-slate-200 bg-white"
          style={{ padding: 'min(8px, 2cqmin)' }}
        >
          <span
            className="text-slate-400 font-semibold uppercase tracking-tight text-center"
            style={{ fontSize: 'min(10px, 2.5cqmin)' }}
          >
            Click to select · drag empty space or Shift-click to multi-select ·
            drag to move · drag corners to resize · double-click text to edit ·
            Ctrl/⌘+D to duplicate · Delete to remove
          </span>
        </div>
      }
    />
  );
};

export default PageEditorOverlay;
