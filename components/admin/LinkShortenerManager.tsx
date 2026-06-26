import React, { useEffect, useMemo, useState } from 'react';
import {
  Link2,
  Plus,
  Copy,
  Check,
  Trash2,
  Pencil,
  ExternalLink,
  Save,
  X,
  Loader2,
  Search,
} from 'lucide-react';

import { useShortLinks } from '@/hooks/useShortLinks';
import { useDialog } from '@/context/useDialog';
import { Toast } from '@/components/common/Toast';
import { logError } from '@/utils/logError';
import {
  buildShortUrl,
  validateDestination,
} from '@/utils/shortLinkValidation';
import { ShortLink } from '@/types';

const formatDate = (epoch: number | null | undefined): string => {
  if (!epoch) return '—';
  return new Date(epoch).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const formatRelative = (epoch: number | null | undefined): string => {
  if (!epoch) return 'Never';
  const diff = Date.now() - epoch;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return 'Just now';
  if (diff < hour) return `${Math.floor(diff / minute)}m ago`;
  if (diff < day) return `${Math.floor(diff / hour)}h ago`;
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
  return formatDate(epoch);
};

interface CreateFormProps {
  onSuccess?: (link: ShortLink) => void;
  /** When true, hides the heading + uses tighter spacing (for Sidebar modal). */
  compact?: boolean;
}

/**
 * Standalone create form, exported so the Sidebar quick-action can reuse it
 * inside a lightweight modal without pulling in the full manager UI.
 */
export const ShortLinkCreateForm: React.FC<CreateFormProps> = ({
  onSuccess,
  compact = false,
}) => {
  const { createShortLink } = useShortLinks();
  const [destination, setDestination] = useState('');
  const [slug, setSlug] = useState('');
  const [label, setLabel] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<ShortLink | null>(null);
  const [copied, setCopied] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await createShortLink({
        destination,
        slug: slug || undefined,
        label: label || undefined,
      });
      if (!result.ok) {
        setError(result.reason);
        return;
      }
      setCreated(result.link);
      setDestination('');
      setSlug('');
      setLabel('');
      onSuccess?.(result.link);
    } finally {
      setSubmitting(false);
    }
  };

  // Reset the "Copied" pill 1.5s after a successful copy. Using an effect
  // (instead of `setTimeout` inside the handler) lets React clear the
  // timer if the form unmounts before it fires, so we never call
  // `setCopied` on an unmounted component.
  useEffect(() => {
    if (!copied) return;
    const timerId = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timerId);
  }, [copied]);

  const handleCopy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch (err) {
      console.warn('[ShortLinkCreateForm] clipboard failed:', err);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={
        compact
          ? 'flex flex-col gap-3'
          : 'flex flex-col gap-4 bg-white rounded-xl border border-slate-200 p-5 shadow-sm'
      }
    >
      {!compact && (
        <div className="flex items-center gap-2">
          <div className="bg-brand-blue-lighter text-brand-blue-primary p-2 rounded-lg">
            <Plus className="w-4 h-4" />
          </div>
          <h3 className="font-bold text-slate-800">Create short link</h3>
        </div>
      )}

      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
          Destination URL
        </label>
        <input
          type="url"
          value={destination}
          onChange={(event) => setDestination(event.target.value)}
          placeholder="https://docs.google.com/document/d/…"
          required
          className="px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue-primary"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
            Custom slug{' '}
            <span className="font-normal normal-case text-slate-400">
              (optional)
            </span>
          </label>
          <div className="flex items-stretch rounded-lg border border-slate-300 focus-within:ring-2 focus-within:ring-brand-blue-primary overflow-hidden">
            <span className="px-2 py-2 bg-slate-100 text-slate-500 text-sm font-mono whitespace-nowrap">
              /r/
            </span>
            <input
              type="text"
              value={slug}
              onChange={(event) => setSlug(event.target.value)}
              placeholder="auto-generated"
              className="flex-1 px-2 py-2 text-sm focus:outline-none"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
            Label{' '}
            <span className="font-normal normal-case text-slate-400">
              (optional)
            </span>
          </label>
          <input
            type="text"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Lesson 1 video"
            className="px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue-primary"
          />
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="self-start inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-blue-primary text-white text-sm font-semibold hover:bg-brand-blue-dark disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
      >
        {submitting ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Plus className="w-4 h-4" />
        )}
        Create short link
      </button>

      {created && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-3 flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-600 shrink-0" />
          <code className="flex-1 text-sm font-mono text-emerald-800 truncate">
            {buildShortUrl(created.code)}
          </code>
          <button
            type="button"
            onClick={() => handleCopy(buildShortUrl(created.code))}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white border border-emerald-200 text-emerald-700 text-xs font-semibold hover:bg-emerald-100 transition-colors"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      )}
    </form>
  );
};

interface EditModalProps {
  link: ShortLink;
  onClose: () => void;
  onSaved: (text: string) => void;
}

const EditModal: React.FC<EditModalProps> = ({ link, onClose, onSaved }) => {
  const { updateShortLink } = useShortLinks();
  const [destination, setDestination] = useState(link.destination);
  const [label, setLabel] = useState(link.label ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const result = await updateShortLink(link.code, { destination, label });
      if (!result.ok) {
        setError(result.reason);
        return;
      }
      onSaved('Short link updated');
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-modal-nested bg-black/50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-short-link-title"
    >
      <form
        onSubmit={handleSave}
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 flex flex-col gap-4"
      >
        <div className="flex items-start justify-between">
          <div>
            <h3
              id="edit-short-link-title"
              className="text-lg font-bold text-slate-800"
            >
              Edit short link
            </h3>
            <p className="text-sm text-slate-500 font-mono mt-1">
              {buildShortUrl(link.code)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
            Destination URL
          </label>
          <input
            type="url"
            value={destination}
            onChange={(event) => setDestination(event.target.value)}
            required
            className="px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue-primary"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
            Label
          </label>
          <input
            type="text"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Optional"
            className="px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue-primary"
          />
        </div>

        <p className="text-xs text-slate-500">
          The slug <code className="font-mono">{link.code}</code> can&apos;t be
          changed — editing it would break any URL already shared.
        </p>

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-brand-blue-primary text-white text-sm font-semibold hover:bg-brand-blue-dark disabled:opacity-60"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Save
          </button>
        </div>
      </form>
    </div>
  );
};

export const LinkShortenerManager: React.FC = () => {
  const { links, loading, error, deleteShortLink } = useShortLinks();
  const { showConfirm } = useDialog();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<ShortLink | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return links;
    return links.filter((link) => {
      return (
        link.code.toLowerCase().includes(query) ||
        link.destination.toLowerCase().includes(query) ||
        (link.label?.toLowerCase().includes(query) ?? false) ||
        link.createdByEmail.toLowerCase().includes(query)
      );
    });
  }, [links, search]);

  // Toast and "copied" pills auto-dismiss after a delay. Both timers are
  // owned by effects so React clears them on unmount, avoiding state
  // updates on an unmounted component if the admin closes the panel
  // mid-animation.
  useEffect(() => {
    if (!toast) return;
    const timerId = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(timerId);
  }, [toast]);

  useEffect(() => {
    if (!copiedCode) return;
    const timerId = window.setTimeout(() => setCopiedCode(null), 1500);
    return () => window.clearTimeout(timerId);
  }, [copiedCode]);

  const showToast = (type: 'success' | 'error', text: string) => {
    setToast({ type, text });
  };

  const handleCopy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(buildShortUrl(code));
      setCopiedCode(code);
    } catch (err) {
      console.warn('[LinkShortenerManager] clipboard failed:', err);
      showToast('error', 'Could not copy to clipboard');
    }
  };

  const handleDelete = async (link: ShortLink) => {
    const confirmed = await showConfirm(
      `Delete /r/${link.code}? Anyone visiting this short link will see a "Link not found" page.`,
      {
        title: 'Delete short link',
        variant: 'danger',
        confirmLabel: 'Delete',
      }
    );
    if (!confirmed) return;
    try {
      await deleteShortLink(link.code);
      showToast('success', 'Short link deleted');
    } catch (err) {
      logError('LinkShortenerManager.delete', err, { code: link.code });
      showToast('error', 'Failed to delete short link');
    }
  };

  return (
    <div className="flex flex-col gap-6 max-w-5xl">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <div className="bg-brand-blue-lighter text-brand-blue-primary p-2 rounded-lg">
            <Link2 className="w-4 h-4" />
          </div>
          <h2 className="text-lg font-bold text-slate-800">Link Shortener</h2>
        </div>
        <p className="text-sm text-slate-600">
          Paste a long URL to get a short, copyable link on this domain. Edit
          the destination later without changing the short URL.
        </p>
      </div>

      <ShortLinkCreateForm
        onSuccess={() => showToast('success', 'Short link created')}
      />

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
          <div>
            <h3 className="font-bold text-slate-800">All short links</h3>
            <p className="text-xs text-slate-500">
              {links.length} {links.length === 1 ? 'link' : 'links'} total
            </p>
          </div>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search…"
              className="pl-9 pr-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue-primary w-64"
            />
          </div>
        </div>

        {loading ? (
          <div className="px-5 py-10 flex items-center justify-center text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading short
            links…
          </div>
        ) : error ? (
          <div className="px-5 py-6 text-sm text-red-600">{error}</div>
        ) : filtered.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-slate-500">
            {links.length === 0
              ? 'No short links yet. Create your first one above.'
              : 'No links match your search.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="text-left px-4 py-2 font-semibold">
                    Short URL
                  </th>
                  <th className="text-left px-4 py-2 font-semibold">
                    Destination
                  </th>
                  <th className="text-left px-4 py-2 font-semibold">Clicks</th>
                  <th className="text-left px-4 py-2 font-semibold">Created</th>
                  <th className="text-right px-4 py-2 font-semibold">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((link) => (
                  <tr
                    key={link.code}
                    className="border-t border-slate-100 hover:bg-slate-50/50"
                  >
                    <td className="px-4 py-3 align-top">
                      <div className="flex items-center gap-2">
                        <code className="font-mono text-slate-800 text-sm">
                          /r/{link.code}
                        </code>
                        <button
                          type="button"
                          onClick={() => handleCopy(link.code)}
                          aria-label="Copy short URL"
                          className="p-1 rounded hover:bg-slate-200 text-slate-500"
                        >
                          {copiedCode === link.code ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                      {link.label && (
                        <div className="text-xs text-slate-500 mt-0.5">
                          {link.label}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top max-w-md">
                      <a
                        href={
                          validateDestination(link.destination).ok
                            ? link.destination
                            : undefined
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-slate-700 hover:text-brand-blue-primary truncate max-w-full"
                        title={link.destination}
                      >
                        <span className="truncate">{link.destination}</span>
                        <ExternalLink className="w-3 h-3 shrink-0" />
                      </a>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="font-semibold text-slate-800">
                        {link.clicks}
                      </div>
                      <div className="text-xs text-slate-500">
                        {formatRelative(link.lastClickedAt)}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="text-slate-700">
                        {formatDate(link.createdAt)}
                      </div>
                      <div className="text-xs text-slate-500 truncate max-w-[12rem]">
                        {link.createdByEmail}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setEditing(link)}
                          aria-label="Edit link"
                          className="p-1.5 rounded-md hover:bg-slate-200 text-slate-600"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(link)}
                          aria-label="Delete link"
                          className="p-1.5 rounded-md hover:bg-red-100 text-red-600"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <EditModal
          link={editing}
          onClose={() => setEditing(null)}
          onSaved={(message) => showToast('success', message)}
        />
      )}

      {toast && (
        <div className="fixed bottom-4 right-4 z-toast">
          <Toast
            message={toast.text}
            type={toast.type}
            onClose={() => setToast(null)}
          />
        </div>
      )}
    </div>
  );
};
