import React, { useEffect, useId, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { GuidedLearningSet } from '@/types';
import { Modal } from '@/components/common/Modal';
import {
  inputLight,
  primaryBtn,
  secondaryBtn,
} from '@/components/common/lightChrome';
import {
  stepsFromWebTour,
  type StepsLabels,
} from '@/components/tours/steps/stepsModel';
import { logError } from '@/utils/logError';
import {
  createFreshserviceCategory,
  createFreshserviceFolder,
  loadFreshserviceCatalog,
  sendTourToFreshservice,
  termsOf,
  type FreshserviceCatalog,
  type FreshserviceCategory,
  type FreshserviceVisibility,
} from './freshservice';
import { articleIssues, issueLines } from './stepsHtmlExport';
import { webTourSequenceOf } from './tourSequence';

const NEW = 'new';

const VISIBILITY: Record<number, string> = {
  1: 'Everyone',
  2: 'Signed-in users',
  3: 'Agents only',
  4: 'Some departments',
  5: 'Some agent groups',
  6: 'Some requester groups',
};

export interface SendNotice {
  tone: 'success' | 'error';
  text: string;
}

const errorText = (err: unknown, fallback: string) => {
  const code = (err as { code?: string } | null)?.code ?? '';
  const msg = (err as { message?: string } | null)?.message ?? '';
  return /invalid-argument|permission-denied|unavailable/.test(code) && msg
    ? msg
    : fallback;
};

const categoryOfFolder = (
  categories: readonly FreshserviceCategory[],
  folderId: string
) => categories.find((c) => c.folders.some((f) => f.id === folderId));

/** Where a tour's FreshService article goes and how it is labelled, with a check of the steps before it is sent. */
export const FreshserviceSendDialog: React.FC<{
  set: GuidedLearningSet;
  labels: StepsLabels;
  onClose: () => void;
  onDone: (notice: SendNotice) => void;
}> = ({ set, labels, onClose, onDone }) => {
  const [catalog, setCatalog] = useState<FreshserviceCatalog | null>(null);
  const [categoryId, setCategoryId] = useState('');
  const [folderId, setFolderId] = useState('');
  const [categoryName, setCategoryName] = useState('');
  const [folderName, setFolderName] = useState('');
  const [visibility, setVisibility] = useState<FreshserviceVisibility>(2);
  const [tags, setTags] = useState('');
  const [keywords, setKeywords] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ids = {
    category: useId(),
    categoryName: useId(),
    folder: useId(),
    folderName: useId(),
    visibility: useId(),
    tags: useId(),
    keywords: useId(),
  };
  const setId = set.id;

  useEffect(() => {
    let cancelled = false;
    loadFreshserviceCatalog(setId)
      .then((c) => {
        if (cancelled) return;
        const start = c.saved?.folderId ?? c.defaultFolderId;
        const category =
          categoryOfFolder(c.categories, start) ?? c.categories[0];
        const folder =
          category?.folders.find((f) => f.id === start) ?? category?.folders[0];
        setCatalog(c);
        setCategoryId(category?.id ?? NEW);
        setFolderId(folder?.id ?? NEW);
        setTags((c.saved?.tags ?? []).join(', '));
        setKeywords((c.saved?.keywords ?? []).join(', '));
      })
      .catch((err: unknown) => {
        logError('FreshserviceSendDialog load', err, { setId });
        if (cancelled) return;
        setCatalog({
          ready: true,
          categories: [],
          defaultFolderId: '',
          saved: null,
        });
        setError(errorText(err, "The folders couldn't load."));
      });
    return () => {
      cancelled = true;
    };
  }, [setId]);

  const lines = useMemo(
    () => issueLines(articleIssues(stepsFromWebTour(webTourSequenceOf(set)))),
    [set]
  );

  const category = catalog?.categories.find((c) => c.id === categoryId);
  const newCategory = categoryId === NEW;
  const newFolder = newCategory || folderId === NEW;
  const folder = category?.folders.find((f) => f.id === folderId);
  const loadFailed = !!catalog && !catalog.categories.length && !!error;
  const canSend =
    !!catalog &&
    catalog.ready &&
    !loadFailed &&
    !sending &&
    (newCategory ? !!categoryName.trim() : !!category) &&
    (newFolder ? !!folderName.trim() : !!folder);

  const pickCategory = (id: string) => {
    setCategoryId(id);
    const first = catalog?.categories.find((c) => c.id === id)?.folders[0];
    setFolderId(first?.id ?? NEW);
  };

  const send = async () => {
    if (!catalog) return;
    setSending(true);
    setError(null);
    try {
      let catId = categoryId;
      let categories = catalog.categories;
      if (newCategory) {
        const name = categoryName.trim();
        const made = await createFreshserviceCategory(name);
        if (!made.id) throw new Error('FreshService is not set up');
        catId = made.id;
        // Kept in the form, so a retry after a later failure doesn't make it twice.
        categories = [...categories, { id: catId, name, folders: [] }];
        setCatalog({ ...catalog, categories });
        setCategoryId(catId);
        setFolderId(NEW);
        setCategoryName('');
      }
      let target = folderId;
      if (newFolder) {
        const name = folderName.trim();
        const made = await createFreshserviceFolder(catId, name, visibility);
        if (!made.id) throw new Error('FreshService is not set up');
        target = made.id;
        const added = { id: target, name, visibility };
        categories = categories.map((c) =>
          c.id === catId ? { ...c, folders: [...c.folders, added] } : c
        );
        setCatalog({ ...catalog, categories });
        setFolderId(target);
        setFolderName('');
      }
      const res = await sendTourToFreshservice(setId, labels, set, {
        folderId: target,
        tags: termsOf(tags),
        keywords: termsOf(keywords),
      });
      if (res.kind === 'not-set-up') {
        onDone({ tone: 'error', text: 'Set up FreshService first.' });
        return;
      }
      onDone(
        res.missing > 0
          ? {
              tone: 'error',
              text: `Sent to FreshService. ${res.missing} picture${res.missing === 1 ? '' : 's'} couldn't load.`,
            }
          : { tone: 'success', text: 'Sent to FreshService as a draft.' }
      );
    } catch (err) {
      logError('FreshserviceSendDialog send', err, { setId });
      setError(errorText(err, "The steps couldn't be sent to FreshService."));
    } finally {
      setSending(false);
    }
  };

  const label = 'text-sm font-semibold text-slate-900';
  const field = `${inputLight} min-h-10 w-full rounded-lg px-3 text-sm`;
  const row = 'flex flex-col gap-1';
  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Send to FreshService"
      maxWidth="max-w-md"
      footer={
        <div className="flex w-full items-center justify-center gap-2">
          {/* no-tour-anchor: inside the FreshService send dialog */}
          <button type="button" className={secondaryBtn} onClick={onClose}>
            Cancel
          </button>
          {/* no-tour-anchor: inside the FreshService send dialog */}
          <button
            type="button"
            className={`${primaryBtn} inline-flex items-center gap-1.5 disabled:opacity-60`}
            onClick={() => void send()}
            disabled={!canSend}
          >
            {sending && (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            )}
            Send draft
          </button>
        </div>
      }
    >
      {!catalog ? (
        <div className="flex justify-center py-8">
          <Loader2
            className="h-6 w-6 animate-spin text-slate-400"
            aria-label="Loading"
          />
        </div>
      ) : !catalog.ready ? (
        <p className="pb-4 text-sm text-slate-700">
          Set up FreshService first.
        </p>
      ) : (
        <div className="flex flex-col gap-4 pb-4">
          {!loadFailed && (
            <>
              <div className={row}>
                <label htmlFor={ids.category} className={label}>
                  Category
                </label>
                {/* no-tour-anchor: inside the FreshService send dialog */}
                <select
                  id={ids.category}
                  value={categoryId}
                  onChange={(e) => pickCategory(e.target.value)}
                  className={field}
                >
                  {catalog.categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                  <option value={NEW}>New category</option>
                </select>
              </div>
              {newCategory && (
                <div className={row}>
                  <label htmlFor={ids.categoryName} className={label}>
                    Category name
                  </label>
                  {/* no-tour-anchor: inside the FreshService send dialog */}
                  <input
                    id={ids.categoryName}
                    value={categoryName}
                    onChange={(e) => setCategoryName(e.target.value)}
                    maxLength={100}
                    autoComplete="off"
                    className={field}
                  />
                </div>
              )}
              {!newCategory && (
                <div className={row}>
                  <label htmlFor={ids.folder} className={label}>
                    Folder
                  </label>
                  {/* no-tour-anchor: inside the FreshService send dialog */}
                  <select
                    id={ids.folder}
                    value={folderId}
                    onChange={(e) => setFolderId(e.target.value)}
                    className={field}
                  >
                    {(category?.folders ?? []).map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                    <option value={NEW}>New folder</option>
                  </select>
                  {folder && (
                    <p
                      data-testid="freshservice-folder-visibility"
                      className="text-xs text-slate-600"
                    >
                      Seen by: {VISIBILITY[folder.visibility] ?? 'Not known'}
                    </p>
                  )}
                </div>
              )}
              {newFolder && (
                <>
                  <div className={row}>
                    <label htmlFor={ids.folderName} className={label}>
                      Folder name
                    </label>
                    {/* no-tour-anchor: inside the FreshService send dialog */}
                    <input
                      id={ids.folderName}
                      value={folderName}
                      onChange={(e) => setFolderName(e.target.value)}
                      maxLength={100}
                      autoComplete="off"
                      className={field}
                    />
                  </div>
                  <div className={row}>
                    <label htmlFor={ids.visibility} className={label}>
                      Who can see the folder
                    </label>
                    {/* no-tour-anchor: inside the FreshService send dialog */}
                    <select
                      id={ids.visibility}
                      value={visibility}
                      onChange={(e) =>
                        setVisibility(
                          Number(e.target.value) as FreshserviceVisibility
                        )
                      }
                      className={field}
                    >
                      <option value={1}>{VISIBILITY[1]}</option>
                      <option value={2}>{VISIBILITY[2]}</option>
                      <option value={3}>{VISIBILITY[3]}</option>
                    </select>
                  </div>
                </>
              )}
              <div className={row}>
                <label htmlFor={ids.tags} className={label}>
                  Tags
                </label>
                {/* no-tour-anchor: inside the FreshService send dialog */}
                <input
                  id={ids.tags}
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  placeholder="Schoology, video"
                  title="Separate tags with commas"
                  autoComplete="off"
                  className={field}
                />
              </div>
              <div className={row}>
                <label htmlFor={ids.keywords} className={label}>
                  Keywords
                </label>
                {/* no-tour-anchor: inside the FreshService send dialog */}
                <input
                  id={ids.keywords}
                  value={keywords}
                  onChange={(e) => setKeywords(e.target.value)}
                  placeholder="embed youtube, add a video"
                  title="Search words that find this article. Separate them with commas"
                  autoComplete="off"
                  className={field}
                />
              </div>
            </>
          )}
          {lines.length > 0 && (
            <div
              data-testid="freshservice-check"
              className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900"
            >
              <p className="font-semibold">Check before sending</p>
              <ul className="mt-1 list-disc pl-5">
                {lines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          )}
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
