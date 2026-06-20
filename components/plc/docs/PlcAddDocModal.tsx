/**
 * PlcAddDocModal — a focused modal for adding a shared Google Doc to a PLC.
 *
 * The Docs section adds docs via an inline form inside `PlcDocPicker`; this
 * modal is the same write path (`usePlcDocs().createDoc`) packaged as a
 * standalone dialog so the Home QuickCreateBar can create a doc in one step
 * without navigating into the Docs section first (PRD §6.3, Decision 4.2).
 *
 * On success it fires `onCreated(docId)` and closes; the caller surfaces any
 * follow-up (toast / navigation). Modal chrome — normal Tailwind sizing.
 */

import React, { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, X } from 'lucide-react';
import type { Plc } from '@/types';
import { usePlcDocs } from '@/hooks/usePlcDocs';
import { useDashboard } from '@/context/useDashboard';
import { logError } from '@/utils/logError';

interface PlcAddDocModalProps {
  plc: Plc;
  onClose: () => void;
  /** Fired with the new doc id after the create commits. */
  onCreated?: (docId: string) => void;
}

export const PlcAddDocModal: React.FC<PlcAddDocModalProps> = ({
  plc,
  onClose,
  onCreated,
}) => {
  const { t } = useTranslation();
  const { addToast } = useDashboard();
  const { createDoc } = usePlcDocs(plc.id);

  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // Synchronous guard so a double-click can't fire two creates before the
  // submitting state commits.
  const submittingRef = useRef(false);

  const fieldIdBase = useId();
  const titleId = `${fieldIdBase}-title`;
  const urlId = `${fieldIdBase}-url`;
  const modalTitle = t('plcDashboard.home.quickCreate.docModal.title', {
    defaultValue: 'Add a shared doc',
  });

  const canSubmit = title.trim().length > 0 && url.trim().length > 0;

  const handleSubmit = async () => {
    if (submittingRef.current) return;
    const trimmedTitle = title.trim();
    const trimmedUrl = url.trim();
    if (!trimmedTitle || !trimmedUrl) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const docId = await createDoc({ title: trimmedTitle, url: trimmedUrl });
      addToast(
        t('plcDashboard.home.quickCreate.docModal.created', {
          title: trimmedTitle,
          defaultValue: '"{{title}}" added to this PLC.',
        }),
        'success'
      );
      onCreated?.(docId);
      onClose();
    } catch (err) {
      logError('PlcAddDocModal.createDoc', err, { plcId: plc.id });
      addToast(
        err instanceof Error
          ? err.message
          : t('plcDashboard.home.quickCreate.docModal.failed', {
              defaultValue: "Couldn't add that doc. Please try again.",
            }),
        'error'
      );
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label={modalTitle}
    >
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-blue-primary/10">
              <FileText
                className="w-4 h-4 text-brand-blue-primary"
                aria-hidden="true"
              />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                {modalTitle}
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                {t('plcDashboard.home.quickCreate.docModal.subtitle', {
                  name: plc.name,
                  defaultValue: 'Shared with {{name}}',
                })}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            aria-label={t('common.close', { defaultValue: 'Close' })}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 px-6 py-5">
          <div>
            <label
              htmlFor={titleId}
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              {t('plcDashboard.home.quickCreate.docModal.titleLabel', {
                defaultValue: 'Title',
              })}
            </label>
            <input
              id={titleId}
              type="text"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleSubmit();
              }}
              disabled={submitting}
              placeholder={t('plcDashboard.docs.titlePlaceholder', {
                defaultValue: 'Doc title',
              })}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-brand-blue-primary/50 focus:outline-none focus:ring-1 focus:ring-brand-blue-primary/50"
            />
          </div>
          <div>
            <label
              htmlFor={urlId}
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              {t('plcDashboard.home.quickCreate.docModal.urlLabel', {
                defaultValue: 'Google Doc URL',
              })}
            </label>
            <input
              id={urlId}
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleSubmit();
              }}
              disabled={submitting}
              placeholder={t('plcDashboard.docs.urlPlaceholder', {
                defaultValue: 'Paste Google Doc URL',
              })}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-brand-blue-primary/50 focus:outline-none focus:ring-1 focus:ring-brand-blue-primary/50"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-slate-100 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100"
          >
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={submitting || !canSubmit}
            className="rounded-lg bg-brand-blue-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-blue-dark disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting
              ? t('plcDashboard.home.quickCreate.docModal.adding', {
                  defaultValue: 'Adding…',
                })
              : t('plcDashboard.home.quickCreate.docModal.add', {
                  defaultValue: 'Add doc',
                })}
          </button>
        </div>
      </div>
    </div>
  );
};
