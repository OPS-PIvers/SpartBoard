import React, { useEffect, useId, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import {
  inputLight,
  primaryBtn,
  secondaryBtn,
} from '@/components/common/lightChrome';
import { logError } from '@/utils/logError';
import {
  loadFreshserviceStatus,
  saveFreshserviceSettings,
  type FreshserviceStatus,
} from './freshservice';

const errorText = (err: unknown, fallback: string) => {
  const code = (err as { code?: string } | null)?.code ?? '';
  const msg = (err as { message?: string } | null)?.message ?? '';
  return code.endsWith('invalid-argument') && msg ? msg : fallback;
};

/** The FreshService site and folder; the API key lives in Secret Manager, so this only says whether it is set. */
export const FreshserviceSettings: React.FC<{
  onClose: () => void;
  onSaved: () => void;
}> = ({ onClose, onSaved }) => {
  const [status, setStatus] = useState<FreshserviceStatus | null>(null);
  const [domain, setDomain] = useState('');
  const [folderId, setFolderId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ids = { domain: useId(), folder: useId() };

  useEffect(() => {
    let cancelled = false;
    loadFreshserviceStatus()
      .then((s) => {
        if (cancelled) return;
        setStatus(s);
        setDomain(s.domain);
        setFolderId(s.folderId);
      })
      .catch((err: unknown) => {
        logError('FreshserviceSettings load', err);
        if (!cancelled) {
          setStatus({ domain: '', folderId: '', hasKey: false });
          setError("The settings couldn't load.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await saveFreshserviceSettings(domain, folderId);
      onSaved();
    } catch (err) {
      logError('FreshserviceSettings save', err);
      setError(errorText(err, "The settings couldn't be saved."));
    } finally {
      setSaving(false);
    }
  };

  const label = 'text-sm font-semibold text-slate-900';
  const field = `${inputLight} min-h-10 w-full rounded-lg px-3 text-sm`;
  return (
    <Modal
      isOpen
      onClose={onClose}
      title="FreshService"
      maxWidth="max-w-md"
      footer={
        <div className="flex w-full items-center justify-center gap-2">
          {/* no-tour-anchor: inside the FreshService settings dialog */}
          <button type="button" className={secondaryBtn} onClick={onClose}>
            Cancel
          </button>
          {/* no-tour-anchor: inside the FreshService settings dialog */}
          <button
            type="button"
            className={`${primaryBtn} inline-flex items-center gap-1.5 disabled:opacity-60`}
            onClick={() => void save()}
            disabled={!status || saving || !domain.trim() || !folderId.trim()}
          >
            {saving && (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            )}
            Save
          </button>
        </div>
      }
    >
      {!status ? (
        <div className="flex justify-center py-8">
          <Loader2
            className="h-6 w-6 animate-spin text-slate-400"
            aria-label="Loading"
          />
        </div>
      ) : (
        <div className="flex flex-col gap-4 pb-4">
          <div className="flex flex-col gap-1">
            <label htmlFor={ids.domain} className={label}>
              Site address
            </label>
            {/* no-tour-anchor: inside the FreshService settings dialog */}
            <input
              id={ids.domain}
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="orono.freshservice.com"
              autoComplete="off"
              className={field}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={ids.folder} className={label}>
              Folder number
            </label>
            {/* no-tour-anchor: inside the FreshService settings dialog */}
            <input
              id={ids.folder}
              value={folderId}
              onChange={(e) => setFolderId(e.target.value)}
              inputMode="numeric"
              autoComplete="off"
              title="The number at the end of the folder's address in FreshService"
              className={field}
            />
          </div>
          <p data-testid="freshservice-key" className="text-sm text-slate-700">
            <span className="font-semibold text-slate-900">API key: </span>
            {status.hasKey ? 'Set' : 'Not set up yet'}
          </p>
          {error && (
            <p role="alert" className="text-sm font-medium text-red-700">
              {error}
            </p>
          )}
        </div>
      )}
    </Modal>
  );
};
