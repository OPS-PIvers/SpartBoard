// A modification group's supports: text, links and files the student opens during the quiz.
import React, { useCallback, useId, useRef, useState } from 'react';
import {
  ChevronDown,
  FileText,
  HardDrive,
  Link2,
  Loader2,
  Paperclip,
  Plus,
  Upload,
  X,
} from 'lucide-react';
import type { QuizSupport } from '@/types';
import { useGooglePicker } from '@/hooks/useGooglePicker';
import { useGoogleDrive } from '@/hooks/useGoogleDrive';
import { useAuth } from '@/context/useAuth';
import { tourAttr, tourFieldAttr } from '@/config/tourAnchors';
import { useFilesDrop } from '@/hooks/useFileDrop';
import { extractGoogleFileId } from '@/utils/urlHelpers';
import {
  FileSourceButtons,
  UrlAddRow,
} from '@/components/common/fileAdd/FileAddSources';
import { usePasteFiles } from '@/components/common/fileAdd/usePasteFiles';
import { usePickMenu } from './usePickMenu';
import { MAX_SUPPORTS } from './modificationGroups';

const TITLE_MAX = 80;
const TEXT_MAX = 1000;

type DraftKind = 'text' | 'link' | 'file';

const KIND_ICON = { text: FileText, link: Link2, drive: HardDrive } as const;

const FILE_ACCEPT = 'image/*,audio/*,video/*,application/pdf,.pdf';
const MAX_FILE_BYTES = 200 * 1024 * 1024;

const isSupportedFile = (f: File): boolean =>
  /^(image|audio|video)\//.test(f.type) ||
  f.type === 'application/pdf' ||
  /\.pdf$/i.test(f.name);

const safeName = (name: string): string => name.replace(/[^\w.-]+/g, '_');

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
  /** Files that belong to someone else's list (class presets): removing one keeps the file. */
  keepFileIds?: ReadonlySet<string>;
}> = ({ supports, onChange, onSharingChange, keepFileIds }) => {
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

  // Adds a Drive file as a support unless the list filled up meanwhile.
  const addDriveSupport = (fileId: string, title: string) =>
    onChange((prev) =>
      prev.length >= MAX_SUPPORTS
        ? prev
        : [...prev, { kind: 'drive', title: title.slice(0, TITLE_MAX), fileId }]
    );

  // Runs one Drive step with the busy state, and closes the file form when it worked.
  const runBusy = async (work: () => Promise<boolean>) => {
    setBusy(true);
    onSharingChange?.(true);
    try {
      if (await work()) setDraft(null);
    } finally {
      setBusy(false);
      onSharingChange?.(false);
    }
  };

  // Shares a copy so the teacher's original keeps its own sharing.
  const shareCopy = async (fileId: string, name: string): Promise<boolean> => {
    if (!driveService) return false;
    let copyId: string | null = null;
    try {
      const copy = await driveService.copyFile(
        fileId,
        name,
        'Assets/QuizSupports'
      );
      copyId = copy.id;
      // Anyone with the link, like quiz stimuli, so every student can open it.
      await driveService.makePublic(copy.id, undefined);
      addDriveSupport(copy.id, name);
      return true;
    } catch {
      if (copyId) await driveService.deleteFile(copyId).catch(() => undefined);
      setError('Couldn’t share that file. Try again.');
      return false;
    }
  };

  const pickDriveFile = async () => {
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
    await runBusy(() => shareCopy(picked.id, picked.name));
  };

  const uploadFiles = async (files: File[], pasted = false) => {
    setError(null);
    if (!driveService) {
      setError('Connect Google Drive to add files.');
      return;
    }
    const usable = files.filter(isSupportedFile);
    if (usable.length === 0) {
      setError('Use an image, PDF, audio or video file.');
      return;
    }
    const room = MAX_SUPPORTS - supports.length;
    await runBusy(async () => {
      let added = 0;
      for (const f of usable.slice(0, room)) {
        if (f.size > MAX_FILE_BYTES) {
          setError(`"${f.name}" is too large (max 200 MB).`);
          continue;
        }
        let id: string | null = null;
        try {
          const up = await driveService.uploadFile(
            f,
            `support-${Date.now()}-${safeName(f.name)}`,
            'Assets/QuizSupports'
          );
          id = up.id;
          await driveService.makePublic(up.id, undefined);
          addDriveSupport(
            up.id,
            pasted && f.type.startsWith('image/') ? 'Pasted image' : f.name
          );
          added += 1;
        } catch {
          if (id) await driveService.deleteFile(id).catch(() => undefined);
          setError('Couldn’t upload that file. Try again.');
        }
      }
      return added > 0;
    });
  };

  const addFromUrl = async (raw: string) => {
    setError(null);
    const url = raw.trim();
    if (!isHttpsUrl(url)) {
      setError('Paste a link that starts with https://');
      return;
    }
    const isGoogle = /^https:\/\/(drive|docs)\.google\.com\//.test(url);
    const fileId = isGoogle ? extractGoogleFileId(url) : null;
    if (!fileId) {
      // Any other web page goes in as a plain link support.
      const title = new URL(url).host.slice(0, TITLE_MAX);
      onChange((prev) =>
        prev.length >= MAX_SUPPORTS
          ? prev
          : [...prev, { kind: 'link', title, url }]
      );
      setDraft(null);
      return;
    }
    if (!driveService) {
      setError('Connect Google Drive to add files.');
      return;
    }
    await runBusy(async () => {
      const name = await driveService
        .getFileMetadata(fileId)
        .then((m) => m.name)
        .catch(() => 'Drive file');
      return shareCopy(fileId, name);
    });
  };

  const fileOpen = draft?.kind === 'file';
  const fileZoneRef = useRef<HTMLDivElement | null>(null);
  // Focus lands on the zone so Ctrl+V works right after picking File.
  const setFileZone = useCallback((el: HTMLDivElement | null) => {
    el?.focus();
    fileZoneRef.current = el;
  }, []);
  usePasteFiles(
    (files) => void uploadFiles(files, true),
    !fileOpen || busy,
    fileZoneRef
  );
  const drop = useFilesDrop(
    (files) => void uploadFiles(files),
    busy || !fileOpen
  );

  const draftValid =
    !!draft &&
    draft.kind !== 'file' &&
    draft.title.trim().length > 0 &&
    (draft.kind === 'text'
      ? draft.body.trim().length > 0
      : isHttpsUrl(draft.body));

  const save = () => {
    if (!draft || !draftValid || draft.kind === 'file') return;
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
                    ['drive', 'File', () => start('file')],
                  ] as const
                ).map(([kind, label, onPick]) => {
                  const Icon = kind === 'drive' ? Paperclip : KIND_ICON[kind];
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
                    if (s.kind === 'drive' && !keepFileIds?.has(s.fileId))
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
      {fileOpen && (
        <div className="space-y-2 pt-2">
          <div
            ref={setFileZone}
            tabIndex={-1}
            {...drop.dropProps}
            data-testid="support-file-drop-zone"
            className={`flex flex-col items-center gap-2.5 rounded-lg border-2 border-dashed px-4 py-4 transition-colors focus:outline-hidden ${
              drop.dragging
                ? 'border-brand-blue-primary bg-brand-blue-lighter'
                : 'border-slate-300 bg-white'
            }`}
          >
            <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-600">
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Upload className="h-4 w-4" aria-hidden />
              )}
              {drop.dragging ? 'Drop it here' : 'Drag a file or paste an image'}
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <FileSourceButtons
                onFiles={(files) => void uploadFiles(files)}
                onDrive={() => void pickDriveFile()}
                busy={busy}
                accept={FILE_ACCEPT}
                inputTestId="support-file-input"
                anchors={{
                  file: tourAttr('assign-mods.support-file-choose'),
                  drive: tourAttr('assign-mods.support-file-drive'),
                }}
              />
            </div>
          </div>
          <UrlAddRow
            onAdd={addFromUrl}
            busy={busy}
            anchors={{
              input: tourAttr('assign-mods.support-file-url'),
              add: tourAttr('assign-mods.support-file-url-add'),
            }}
          />
          <div className="flex justify-end">
            <button
              type="button"
              disabled={busy}
              onClick={() => setDraft(null)}
              {...tourAttr('assign-mods.support-cancel')}
              className="h-9 rounded-lg px-3 text-sm font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {draft && draft.kind !== 'file' && (
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
