// A modification group's supports: text, links and Drive files the student opens during the quiz.
import React, { useId, useState } from 'react';
import {
  ChevronDown,
  FileText,
  HardDrive,
  Link2,
  Loader2,
  Plus,
  X,
} from 'lucide-react';
import type { QuizSupport } from '@/types';
import { useGooglePicker } from '@/hooks/useGooglePicker';
import { useGoogleDrive } from '@/hooks/useGoogleDrive';
import { useAuth } from '@/context/useAuth';
import { tourAttr, tourFieldAttr } from '@/config/tourAnchors';
import { usePickMenu } from './usePickMenu';
import { MAX_SUPPORTS } from './modificationGroups';

const TITLE_MAX = 80;
const TEXT_MAX = 1000;

type DraftKind = 'text' | 'link';

const KIND_ICON = { text: FileText, link: Link2, drive: HardDrive } as const;

const detailOf = (s: QuizSupport): string => {
  if (s.kind === 'text') return s.text;
  if (s.kind === 'drive') return 'Drive file';
  try {
    return new URL(s.url).host;
  } catch {
    return s.url;
  }
};

const isHttpsUrl = (raw: string): boolean => {
  try {
    return new URL(raw.trim()).protocol === 'https:';
  } catch {
    return false;
  }
};

const inputCls =
  'w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-800 focus:border-brand-blue-primary focus:outline-hidden';

export const SupportsEditor: React.FC<{
  supports: QuizSupport[];
  /** Takes an updater so a slow Drive share applies to the latest list. */
  onChange: (update: (prev: QuizSupport[]) => QuizSupport[]) => void;
  /** True while a Drive file is being copied and shared. */
  onSharingChange?: (sharing: boolean) => void;
}> = ({ supports, onChange, onSharingChange }) => {
  const { open, setOpen, rootRef, onKeyDown } = usePickMenu();
  const menuId = useId();
  const titleId = useId();
  const bodyId = useId();
  const { openPicker } = useGooglePicker();
  const { driveService } = useGoogleDrive();
  const { ensureGoogleScope } = useAuth();
  const [draft, setDraft] = useState<{
    kind: DraftKind;
    title: string;
    body: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const full = supports.length >= MAX_SUPPORTS;

  const start = (kind: DraftKind) => {
    setOpen(false);
    setError(null);
    setDraft({ kind, title: '', body: '' });
  };

  const pickDriveFile = async () => {
    setOpen(false);
    setError(null);
    let file;
    try {
      const token = await ensureGoogleScope('drive.file', {
        interactive: true,
      });
      if (!token) throw new Error('No Drive access');
      file = await openPicker({ mode: 'stimuli', token });
    } catch {
      setError('Couldn’t open Google Drive. Try again.');
      return;
    }
    if (!file || !driveService) return;
    const picked = file;
    setBusy(true);
    onSharingChange?.(true);
    let copyId: string | null = null;
    try {
      // Share a copy so the teacher's original keeps its own sharing.
      const copy = await driveService.copyFile(
        picked.id,
        picked.name,
        'Assets/QuizSupports'
      );
      copyId = copy.id;
      // Anyone with the link, like quiz stimuli, so every student can open it.
      await driveService.makePublic(copy.id, undefined);
      onChange((prev) =>
        prev.length >= MAX_SUPPORTS
          ? prev
          : [
              ...prev,
              {
                kind: 'drive',
                title: picked.name.slice(0, TITLE_MAX),
                fileId: copy.id,
              },
            ]
      );
    } catch {
      if (copyId) await driveService.deleteFile(copyId).catch(() => undefined);
      setError('Couldn’t share that file. Try again.');
    } finally {
      setBusy(false);
      onSharingChange?.(false);
    }
  };

  const draftValid =
    !!draft &&
    draft.title.trim().length > 0 &&
    (draft.kind === 'text'
      ? draft.body.trim().length > 0
      : isHttpsUrl(draft.body));

  const save = () => {
    if (!draft || !draftValid) return;
    const title = draft.title.trim();
    const added: QuizSupport =
      draft.kind === 'text'
        ? { kind: 'text', title, text: draft.body.trim() }
        : { kind: 'link', title, url: draft.body.trim() };
    onChange((prev) => [...prev, added]);
    setDraft(null);
  };

  return (
    <div className="py-1.5">
      <div className="flex min-h-11 items-center justify-between gap-3">
        <span className="text-sm font-medium text-slate-700">Supports</span>
        {!full && !draft && (
          <div ref={rootRef} className="relative" onKeyDown={onKeyDown}>
            <button
              type="button"
              disabled={busy}
              onClick={() => setOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={open}
              aria-controls={open ? menuId : undefined}
              {...tourAttr('assign-mods.supports-add')}
              className="touch-target-expand inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 text-sm text-slate-700 hover:border-slate-400 disabled:opacity-60"
            >
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <Plus className="h-3.5 w-3.5" aria-hidden />
              )}
              Add
              <ChevronDown className="h-3.5 w-3.5 text-slate-400" aria-hidden />
            </button>
            {open && (
              <div
                id={menuId}
                role="menu"
                className="absolute right-0 top-full z-10 mt-1 w-40 rounded-xl border border-slate-200 bg-white p-1 shadow-xl"
              >
                {(
                  [
                    ['text', 'Text', () => start('text')],
                    ['link', 'Link', () => start('link')],
                    ['drive', 'Drive file', () => void pickDriveFile()],
                  ] as const
                ).map(([kind, label, onPick]) => {
                  const Icon = KIND_ICON[kind];
                  return (
                    <button
                      key={kind}
                      type="button"
                      role="menuitem"
                      onClick={onPick}
                      {...tourFieldAttr(
                        'assign-mods.supports-kind',
                        'assign',
                        kind
                      )}
                      className="flex min-h-9 w-full items-center gap-2 rounded-lg px-2 text-left text-sm text-slate-800 hover:bg-slate-50"
                    >
                      <Icon className="h-4 w-4 text-slate-500" aria-hidden />
                      {label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
      {supports.length > 0 && (
        <ul className="divide-y divide-slate-100 border-y border-slate-100">
          {supports.map((s, i) => {
            const Icon = KIND_ICON[s.kind];
            return (
              <li
                key={`${s.kind}-${i}`}
                className="flex min-h-11 items-center gap-2 py-1"
              >
                <Icon className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-slate-800">
                    {s.title}
                  </span>
                  <span className="block truncate text-xs text-slate-500">
                    {detailOf(s)}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    onChange((prev) => prev.filter((p) => p !== s));
                    // The Drive file is our own shared copy, so it goes too.
                    if (s.kind === 'drive')
                      void driveService
                        ?.deleteFile(s.fileId)
                        .catch(() => undefined);
                  }}
                  aria-label={`Remove ${s.title}`}
                  {...tourFieldAttr(
                    'assign-mods.support-remove',
                    'assign',
                    `support-${i + 1}`
                  )}
                  className="touch-target-expand rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {draft && (
        <div className="space-y-2 pt-2">
          <label
            htmlFor={titleId}
            className="block text-xs font-medium text-slate-600"
          >
            Title
          </label>
          <input
            id={titleId}
            autoFocus
            value={draft.title}
            maxLength={TITLE_MAX}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            {...tourAttr('assign-mods.support-title')}
            className={inputCls}
          />
          <label
            htmlFor={bodyId}
            className="block text-xs font-medium text-slate-600"
          >
            {draft.kind === 'text' ? 'Text' : 'Link'}
          </label>
          {draft.kind === 'text' ? (
            <textarea
              id={bodyId}
              rows={4}
              value={draft.body}
              maxLength={TEXT_MAX}
              onChange={(e) => setDraft({ ...draft, body: e.target.value })}
              {...tourAttr('assign-mods.support-body')}
              className={inputCls}
            />
          ) : (
            <input
              id={bodyId}
              type="url"
              inputMode="url"
              value={draft.body}
              onChange={(e) => setDraft({ ...draft, body: e.target.value })}
              {...tourAttr('assign-mods.support-body')}
              className={inputCls}
            />
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setDraft(null)}
              {...tourAttr('assign-mods.support-cancel')}
              className="h-9 rounded-lg px-3 text-sm font-bold text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!draftValid}
              onClick={save}
              {...tourAttr('assign-mods.support-save')}
              className="h-9 rounded-lg bg-brand-blue-primary px-3 text-sm font-bold text-white hover:bg-brand-blue-dark disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              Add
            </button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="pt-1 text-xs text-brand-red-primary">
          {error}
        </p>
      )}
    </div>
  );
};
