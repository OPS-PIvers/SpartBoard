// Workspace dialogs: the Google Docs embed, adding a working doc, and a check-in note.

import React, { useId, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import { Button } from '@/components/common/Button';
import { INPUT } from '@/components/plc/redesignMockup/ui';
import { convertToEmbedUrl, ensureProtocol } from '@/utils/urlHelpers';
import { httpsUrl } from '@/utils/mentoring';
import { tourAttr } from '@/config/tourAnchors';

const LABEL = 'mb-1 block text-xs font-semibold text-slate-600';

/** The existing Google Docs embed, as on Notes & Docs. */
export const DocEmbedModal: React.FC<{
  title: string;
  url: string;
  onClose: () => void;
}> = ({ title, url, onClose }) => {
  const href = httpsUrl(ensureProtocol(url));
  if (!href) return null;
  return (
    <Modal
      isOpen
      onClose={onClose}
      title={title}
      maxWidth="max-w-5xl"
      contentClassName="px-0 pb-0"
      customHeader={
        <div className="flex items-center gap-3 border-b border-slate-200 px-6 py-3">
          <h2 className="min-w-0 flex-1 truncate text-base font-bold text-slate-800">
            {title}
          </h2>
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            {...tourAttr('teams.doc-embed.open-docs')}
            className="inline-flex items-center gap-1 rounded text-xs font-semibold text-brand-blue-primary hover:text-brand-blue-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40"
          >
            Open in Docs
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            {...tourAttr('teams.doc-embed.close')}
          >
            Close
          </Button>
        </div>
      }
    >
      <iframe
        src={convertToEmbedUrl(href)}
        title={title}
        className="h-[70vh] w-full border-0"
        sandbox="allow-scripts allow-forms allow-popups allow-same-origin"
        allow="clipboard-write"
      />
    </Modal>
  );
};

export const AddDocModal: React.FC<{
  onClose: () => void;
  onSave: (input: { title: string; url: string }) => Promise<void>;
}> = ({ onClose, onSave }) => {
  const id = useId();
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const ok = !!title.trim() && /^https:\/\//.test(url.trim());
  const save = async () => {
    if (!ok || busy) return;
    setBusy(true);
    setFailed(false);
    try {
      await onSave({ title: title.trim(), url: url.trim() });
      onClose();
    } catch {
      setFailed(true);
      setBusy(false);
    }
  };
  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Add a doc"
      maxWidth="max-w-md"
      closeTourId="teams.add-doc.close"
      footer={
        <div className="flex items-center justify-end gap-2">
          {failed && (
            <span className="mr-auto text-xs text-brand-red-primary">
              Couldn&apos;t save that change. Try again.
            </span>
          )}
          <Button
            variant="secondary"
            onClick={onClose}
            {...tourAttr('teams.add-doc.cancel')}
          >
            Cancel
          </Button>
          <Button
            onClick={() => void save()}
            disabled={!ok || busy}
            {...tourAttr('teams.add-doc.save')}
          >
            Save
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label htmlFor={`${id}-title`} className={LABEL}>
            Title
          </label>
          <input
            id={`${id}-title`}
            className={`${INPUT} w-full`}
            value={title}
            maxLength={200}
            onChange={(e) => setTitle(e.target.value)}
            {...tourAttr('teams.add-doc.title')}
          />
        </div>
        <div>
          <label htmlFor={`${id}-url`} className={LABEL}>
            Link
          </label>
          <input
            id={`${id}-url`}
            type="url"
            inputMode="url"
            placeholder="https://docs.google.com/document/d/…"
            className={`${INPUT} w-full`}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            {...tourAttr('teams.add-doc.link')}
          />
        </div>
      </div>
    </Modal>
  );
};

/** A check-in note; the pair edits it, facilitators read it. */
export const CheckInModal: React.FC<{
  title: string;
  body: string;
  canEdit: boolean;
  onClose: () => void;
  onSave: (input: { title: string; body: string }) => Promise<void>;
}> = ({ title: initialTitle, body: initialBody, canEdit, onClose, onSave }) => {
  const id = useId();
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState(initialBody);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const save = async () => {
    if (busy || !title.trim()) return;
    setBusy(true);
    setFailed(false);
    try {
      await onSave({ title: title.trim(), body });
      onClose();
    } catch {
      setFailed(true);
      setBusy(false);
    }
  };
  return (
    <Modal
      isOpen
      onClose={onClose}
      title={initialTitle}
      maxWidth="max-w-2xl"
      closeTourId="teams.check-in.close"
      footer={
        canEdit ? (
          <div className="flex items-center justify-end gap-2">
            {failed && (
              <span className="mr-auto text-xs text-brand-red-primary">
                Couldn&apos;t save that change. Try again.
              </span>
            )}
            <Button
              variant="secondary"
              onClick={onClose}
              {...tourAttr('teams.check-in.cancel')}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void save()}
              disabled={busy}
              {...tourAttr('teams.check-in.save')}
            >
              Save
            </Button>
          </div>
        ) : undefined
      }
    >
      <div className="space-y-4">
        {canEdit && (
          <div>
            <label htmlFor={`${id}-title`} className={LABEL}>
              Title
            </label>
            <input
              id={`${id}-title`}
              className={`${INPUT} w-full`}
              value={title}
              maxLength={200}
              onChange={(e) => setTitle(e.target.value)}
              {...tourAttr('teams.check-in.title')}
            />
          </div>
        )}
        <textarea
          aria-label={initialTitle}
          className={`${INPUT} w-full font-mono text-xs leading-relaxed`}
          rows={16}
          maxLength={50000}
          readOnly={!canEdit}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          {...tourAttr('teams.check-in.body')}
        />
      </div>
    </Modal>
  );
};
