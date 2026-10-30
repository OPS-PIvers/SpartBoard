// Admin card for `admin_settings/import_send_block_list` (plan D16) and the reader problem log (D18).
import React, { useState } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { Loader2, Plus, RotateCcw, ShieldBan, X } from 'lucide-react';
import { db } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import { tourAttr, tourFieldAttr } from '@/config/tourAnchors';
import {
  DEFAULT_SEND_BLOCK_PATTERNS,
  isUrlBlocked,
  normalizeBlockPattern,
} from '@/utils/import/sendBlockList';
import {
  IMPORT_MAX_BLOCK_PATTERNS,
  IMPORT_SEND_BLOCK_LIST_DOC,
} from '@/utils/import/contract';
import { useImportBlockList, useReaderFailures } from './useImportBlockList';

const inputClass =
  'rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40';

const formatWhen = (ms: number | null): string =>
  ms === null
    ? ''
    : new Date(ms).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });

const PLATFORM_NAMES: Record<string, string> = {
  schoology: 'Schoology',
  'google-forms': 'Google Forms',
  quizlet: 'Quizlet',
  edpuzzle: 'Edpuzzle',
  youtube: 'YouTube',
  canvas: 'Canvas',
  generic: 'Any page',
};

const platformName = (id: string): string =>
  PLATFORM_NAMES[id] ??
  (id ? id.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase()) : '');

const ReaderProblems: React.FC = () => {
  const { failures, loading, error } = useReaderFailures();
  return (
    <section className="mt-10">
      <h3 className="text-base font-bold text-slate-900">Reader problems</h3>
      <p className="mt-1 text-sm text-slate-600">
        Pages where a site reader couldn&apos;t find what it expected.
        SpartBoard used the general page read instead.
      </p>
      {loading ? (
        <div className="mt-3 flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
          Loading…
        </div>
      ) : error ? (
        <p role="alert" className="mt-3 text-sm text-red-600">
          Couldn&apos;t load reader problems.
        </p>
      ) : failures.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">
          No reader problems in the last 30 days.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-200 border-y border-slate-200">
          {failures.map((f) => (
            <li key={f.id} className="py-2.5 text-sm">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                <span className="font-semibold text-slate-900">
                  {platformName(f.platform) || 'Unknown site'}
                </span>
                <span className="text-slate-700">{f.reason}</span>
                <span className="ml-auto text-xs text-slate-500 tabular-nums">
                  {formatWhen(f.createdAtMs)}
                </span>
              </div>
              <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-slate-500 min-w-0">
                {/^https?:\/\//i.test(f.url) ? (
                  <a
                    href={f.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="truncate max-w-full text-brand-blue-primary hover:underline"
                    // no-tour-anchor: a per-entry log link, nothing a tour walks to
                  >
                    {f.url}
                  </a>
                ) : (
                  <span className="truncate max-w-full">{f.url}</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export const ImportBlockListPanel: React.FC = () => {
  const { user } = useAuth();
  const { patterns, usingDefaults, loading } = useImportBlockList();
  const [newPattern, setNewPattern] = useState('');
  const [testUrl, setTestUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const persist = async (next: readonly string[]) => {
    setSaving(true);
    setError(null);
    try {
      await setDoc(doc(db, 'admin_settings', IMPORT_SEND_BLOCK_LIST_DOC), {
        patterns: [...next],
        // eslint-disable-next-line react-hooks/purity -- runs in an async save handler, not render
        updatedAt: Date.now(),
        updatedBy: user?.email ?? '',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const typed = newPattern.trim();
  const normalized = typed ? normalizeBlockPattern(typed) : null;
  const invalid = typed !== '' && normalized === null;
  const duplicate = normalized !== null && patterns.includes(normalized);
  const full = patterns.length >= IMPORT_MAX_BLOCK_PATTERNS;

  const add = async () => {
    if (!normalized || duplicate || full) return;
    setNewPattern('');
    await persist([...patterns, normalized]);
  };

  const testTarget = testUrl.trim();
  const testHref = /^[a-z]+:\/\//i.test(testTarget)
    ? testTarget
    : `https://${testTarget}`;
  const testResult =
    testTarget === '' ? null : isUrlBlocked(testHref, patterns);

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-lg bg-brand-blue-lighter/40 text-brand-blue-primary flex items-center justify-center">
          <ShieldBan className="w-5 h-5" />
        </div>
        <h2 className="text-lg font-bold text-slate-900">Import block list</h2>
      </div>
      <p className="mb-6 text-sm text-slate-600">
        SpartBoard won&apos;t import from pages that match these addresses, and
        the Send button stays hidden on them.
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
          Loading…
        </div>
      ) : (
        <>
          {patterns.length === 0 ? (
            <p className="text-sm text-slate-500">
              Nothing is blocked. Teachers can import from any page.
            </p>
          ) : (
            <ul className="divide-y divide-slate-200 border-y border-slate-200">
              {patterns.map((pattern) => (
                <li key={pattern} className="flex items-center gap-3 py-2">
                  <span className="flex-1 min-w-0 truncate font-mono text-sm text-slate-900">
                    {pattern}
                  </span>
                  <button
                    {...tourFieldAttr(
                      'admin.import-block-list.remove',
                      'admin',
                      pattern
                    )}
                    type="button"
                    onClick={() =>
                      void persist(patterns.filter((p) => p !== pattern))
                    }
                    disabled={saving}
                    aria-label={`Remove ${pattern}`}
                    className="p-1.5 rounded text-slate-500 hover:bg-slate-100 disabled:opacity-40"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <form
            className="mt-4 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void add();
            }}
          >
            <input
              {...tourAttr('admin.import-block-list.new-pattern')}
              aria-label="New blocked address"
              aria-invalid={invalid || duplicate}
              placeholder="Add an address, like *.example.com/grades*"
              value={newPattern}
              onChange={(e) => setNewPattern(e.target.value)}
              className={`${inputClass} flex-1 font-mono`}
            />
            <button
              {...tourAttr('admin.import-block-list.add')}
              type="submit"
              disabled={saving || !normalized || duplicate || full}
              className="inline-flex items-center gap-1.5 rounded-md bg-brand-blue-primary px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-blue-dark disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              Add
            </button>
          </form>
          <p className="mt-1.5 text-xs text-slate-500">
            A * matches anything. Anything after a ? is ignored.
          </p>
          {invalid && (
            <p className="mt-1.5 text-sm text-red-600">
              Enter a site address, like example.com or example.com/grades*.
            </p>
          )}
          {duplicate && (
            <p className="mt-1.5 text-sm text-slate-600">
              That address is already on the list.
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <input
              {...tourAttr('admin.import-block-list.test-url')}
              aria-label="Test an address"
              placeholder="Test an address"
              value={testUrl}
              onChange={(e) => setTestUrl(e.target.value)}
              className={`${inputClass} flex-1 min-w-48`}
            />
            {testResult !== null && (
              <span
                role="status"
                className={`text-sm font-semibold ${testResult ? 'text-red-700' : 'text-slate-700'}`}
              >
                {testResult ? 'Blocked' : 'Not blocked'}
              </span>
            )}
          </div>

          {!usingDefaults && (
            <button
              {...tourAttr('admin.import-block-list.restore-defaults')}
              type="button"
              onClick={() => void persist(DEFAULT_SEND_BLOCK_PATTERNS)}
              disabled={saving}
              className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-blue-primary hover:underline disabled:opacity-50"
            >
              <RotateCcw className="w-4 h-4" />
              Restore defaults
            </button>
          )}

          {error && (
            <p role="alert" className="mt-3 text-sm text-red-600">
              {error}
            </p>
          )}
        </>
      )}

      <ReaderProblems />
    </div>
  );
};
