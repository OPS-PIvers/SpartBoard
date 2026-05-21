/**
 * PlcDocsBody — Google Docs embed surface for PLC shared notes.
 *
 * Layout:
 *   ┌──────────────┬──────────────────────────────────┐
 *   │  PlcDocPicker│  iframe (sandboxed Google Doc)    │
 *   │  (left list) │  OR empty-state CTA               │
 *   └──────────────┴──────────────────────────────────┘
 *
 * The picker manages the list of doc pointers (add / rename / remove).
 * The right pane embeds the selected doc via a sandboxed iframe using
 * convertToEmbedUrl(ensureProtocol(doc.url)) — the same transformation
 * EmbedWidget uses. Non-Google URLs are accepted (convertToEmbedUrl
 * returns the original) with a gentle hint shown in the sidebar.
 *
 * This is modal chrome, so normal Tailwind sizing is used (no cqmin).
 */

import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, ExternalLink, AlertCircle } from 'lucide-react';
import type { Plc } from '@/types';
import { usePlcDocs } from '@/hooks/usePlcDocs';
import { useDashboard } from '@/context/useDashboard';
import { convertToEmbedUrl, ensureProtocol } from '@/utils/urlHelpers';
import { PlcDocPicker, type PlcDocPickerHandle } from './PlcDocPicker';

interface PlcDocsBodyProps {
  plc: Plc;
}

/** Returns true if the URL is likely a Google Docs/Drive link. */
function isGoogleUrl(url: string): boolean {
  return url.includes('docs.google.com') || url.includes('drive.google.com');
}

export const PlcDocsBody: React.FC<PlcDocsBodyProps> = ({ plc }) => {
  const { t } = useTranslation();
  const { addToast } = useDashboard();
  const { docs, loading, error, createDoc, updateDoc, deleteDoc } = usePlcDocs(
    plc.id
  );

  // Imperative handle into the picker so the empty-state CTA can focus its
  // add-title input directly (no document-wide querySelector).
  const pickerRef = useRef<PlcDocPickerHandle>(null);

  // Track which doc is selected; auto-select the first when the list loads.
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Adjust-state-during-render pattern: keep selectedId consistent with
  // the live docs list without effects.
  const docIds = docs.map((d) => d.id);
  const selectedStillExists =
    selectedId !== null && docIds.includes(selectedId);

  if (!selectedStillExists && docIds.length > 0 && selectedId !== docIds[0]) {
    setSelectedId(docIds[0]);
  } else if (docIds.length === 0 && selectedId !== null) {
    setSelectedId(null);
  }

  const selectedDoc = docs.find((d) => d.id === selectedId) ?? null;

  const handleCreateDoc = async (input: {
    title: string;
    url: string;
  }): Promise<string> => {
    const newId = await createDoc(input);
    setSelectedId(newId);
    return newId;
  };

  const handleDeleteDoc = async (id: string): Promise<void> => {
    try {
      await deleteDoc(id);
    } catch (err) {
      addToast(
        err instanceof Error
          ? err.message
          : t('plcDashboard.docs.deleteFailed', {
              defaultValue: "Couldn't remove that doc. Please try again.",
            }),
        'error'
      );
      return;
    }
    // If we deleted the selected doc, fall back to the first remaining one.
    if (id === selectedId) {
      const remaining = docs.filter((d) => d.id !== id);
      setSelectedId(remaining.length > 0 ? remaining[0].id : null);
    }
  };

  const handleAddError = (err: unknown): void => {
    addToast(
      err instanceof Error
        ? err.message
        : t('plcDashboard.docs.addFailed', {
            defaultValue: "Couldn't add that doc. Please try again.",
          }),
      'error'
    );
  };

  const handleUpdateError = (err: unknown): void => {
    addToast(
      err instanceof Error
        ? err.message
        : t('plcDashboard.docs.renameFailed', {
            defaultValue: "Couldn't rename that doc. Please try again.",
          }),
      'error'
    );
  };

  // Build the embed URL for the selected doc.
  const embedUrl = selectedDoc
    ? convertToEmbedUrl(ensureProtocol(selectedDoc.url))
    : null;

  const showNonGoogleHint =
    selectedDoc !== null && !isGoogleUrl(selectedDoc.url);

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Left rail: picker ─────────────────────────────────────── */}
      <div className="w-56 shrink-0 border-r border-slate-200 p-3 flex flex-col overflow-hidden bg-slate-50/50">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 px-1">
          {t('plcDashboard.docs.sectionTitle', { defaultValue: 'Shared Docs' })}
        </h3>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <span className="text-sm text-slate-400">
              {t('plcDashboard.docs.loading', { defaultValue: 'Loading…' })}
            </span>
          </div>
        ) : error ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 px-2 text-center">
            <AlertCircle className="w-5 h-5 text-red-400" />
            <span className="text-xs text-red-500">
              {t('plcDashboard.docs.error', {
                defaultValue: 'Failed to load docs.',
              })}
            </span>
          </div>
        ) : (
          <PlcDocPicker
            ref={pickerRef}
            docs={docs}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onCreateDoc={handleCreateDoc}
            onUpdateDoc={updateDoc}
            onDeleteDoc={handleDeleteDoc}
            onAddError={handleAddError}
            onUpdateError={handleUpdateError}
          />
        )}
      </div>

      {/* ── Right pane: iframe, error, or empty state ─────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden bg-white relative">
        {error ? (
          /* Load error — don't show the "Add a Google Doc" CTA, which would
             mask a read failure as an empty list. */
          <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center">
            <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center">
              <AlertCircle className="w-7 h-7 text-red-400" />
            </div>
            <div>
              <p className="font-semibold text-slate-700 text-base mb-1">
                {t('plcDashboard.docs.errorTitle', {
                  defaultValue: "Couldn't load docs",
                })}
              </p>
              <p className="text-sm text-slate-500 max-w-xs">
                {t('plcDashboard.docs.errorSubtitle', {
                  defaultValue:
                    'Check your connection and try again in a moment.',
                })}
              </p>
            </div>
          </div>
        ) : selectedDoc === null && !loading ? (
          /* Empty state */
          <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center">
            <div className="w-14 h-14 rounded-2xl bg-brand-blue-primary/10 flex items-center justify-center">
              <FileText className="w-7 h-7 text-brand-blue-primary" />
            </div>
            <div>
              <p className="font-semibold text-slate-700 text-base mb-1">
                {t('plcDashboard.docs.emptyTitle', {
                  defaultValue: 'No docs yet',
                })}
              </p>
              <p className="text-sm text-slate-500 max-w-xs">
                {t('plcDashboard.docs.emptySubtitle', {
                  defaultValue:
                    'Paste a Google Doc link to embed it here for the whole PLC.',
                })}
              </p>
            </div>
            {/* Inline CTA that focuses the add-title input in the left-rail
                picker via its imperative ref handle (scoped to this picker,
                not a document-wide querySelector). */}
            <button
              className="flex items-center gap-2 bg-brand-blue-primary text-white rounded-xl px-5 py-2.5 text-sm font-semibold hover:bg-brand-blue-dark transition-colors shadow-sm"
              onClick={() => {
                pickerRef.current?.focusAddInput();
              }}
              aria-label={t('plcDashboard.docs.addCta', {
                defaultValue: 'Add a Google Doc',
              })}
            >
              {t('plcDashboard.docs.addCta', {
                defaultValue: 'Add a Google Doc',
              })}
            </button>
          </div>
        ) : selectedDoc !== null && embedUrl ? (
          <>
            {/* Non-Google hint */}
            {showNonGoogleHint && (
              <div className="shrink-0 flex items-center gap-2 px-4 py-2 bg-amber-50 border-b border-amber-100 text-xs text-amber-700">
                <AlertCircle className="w-4 h-4 shrink-0 text-amber-500" />
                <span>
                  {t('plcDashboard.docs.nonGoogleHint', {
                    defaultValue:
                      "This doesn't look like a Google Doc URL — it may not embed correctly.",
                  })}
                </span>
                <a
                  href={ensureProtocol(selectedDoc.url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-auto shrink-0 flex items-center gap-1 underline hover:text-amber-900 transition-colors"
                >
                  {t('plcDashboard.docs.openExternal', {
                    defaultValue: 'Open',
                  })}
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}

            {/* The embed iframe */}
            <div className="flex-1 overflow-hidden">
              <iframe
                key={selectedDoc.id}
                src={embedUrl}
                title={selectedDoc.title}
                className="w-full h-full border-0"
                sandbox="allow-scripts allow-forms allow-popups allow-same-origin"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
};
