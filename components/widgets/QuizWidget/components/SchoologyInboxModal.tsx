// "From Schoology" review: what the extension sent waits here until the teacher saves it to Drive (SCHOOLOGY_QUIZ_IMPORT Q8–Q10).

import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Folder,
  Image as ImageIcon,
  Library,
  Trash2,
  X,
} from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import { tourFieldAttr, tourTypeAttr } from '@/config/tourAnchors';
import type { LibraryFolder, QuizBehaviorSettings, QuizData } from '@/types';
import { extractedToQuizData } from '@/utils/quizDocumentImport/toQuizData';
import type {
  ExtractedImage,
  ExtractedQuestion,
} from '@/utils/quizDocumentImport/types';
import { displayFibAnswer } from '@/utils/quizFibBlanks';
import { ensureFolderPath, runPool } from '@/utils/cartridgeBankImport';
import {
  behaviorFromSettings,
  importSourceFor,
  isBankItem,
  keepQuestionTags,
  planInboxRows,
  settingsSummary,
  type InboxRow,
  type SchoologyInboxItem,
  type SourcedLibraryItem,
} from '@/utils/schoologyInbox';

const SAVE_CONCURRENCY = 2;

const TYPE_LABEL: Record<string, string> = {
  MC: 'Multiple choice',
  MA: 'Choose all',
  FIB: 'Fill in',
  Matching: 'Matching',
  Ordering: 'Ordering',
  'free-response': 'Written',
};

/** One library (quizzes or banks) the review saves into. */
export interface SchoologyLibraryTarget {
  existing: readonly SourcedLibraryItem[];
  folders: readonly LibraryFolder[];
  createFolder: (name: string, parentId: string | null) => Promise<string>;
  /** The earlier copy, read from Drive, that Update replaces. */
  load: (existing: SourcedLibraryItem) => Promise<QuizData>;
  /** Saves a new copy into `folderId`, or replaces `replaces` where it sits. */
  save: (
    data: QuizData,
    placement: {
      folderId: string | null;
      replaces: SourcedLibraryItem | null;
      behavior?: QuizBehaviorSettings;
    }
  ) => Promise<void>;
}

export interface SchoologyInboxSummary {
  saved: number;
  failed: number;
}

interface SchoologyInboxModalProps {
  items: readonly SchoologyInboxItem[];
  quizzes: SchoologyLibraryTarget;
  banks: SchoologyLibraryTarget;
  loadImages: (item: SchoologyInboxItem) => Promise<ExtractedImage[]>;
  removeItem: (itemId: string) => Promise<void>;
  /** Uploads pictures and points questions at them; no images strips the pointers. */
  attachPictures: (
    quiz: QuizData,
    images: readonly ExtractedImage[]
  ) => Promise<QuizData>;
  /** False when Drive isn't connected, so pictures can't be copied. */
  canUploadPictures: boolean;
  onClose: (summary: SchoologyInboxSummary | null) => void;
}

type SaveState =
  | { kind: 'idle' }
  | { kind: 'saving'; done: number; total: number }
  | { kind: 'finished'; saved: string[]; failed: InboxRow[] };

type Mode = 'update' | 'keep';

const plural = (n: number, one: string, many = `${one}s`): string =>
  `${n} ${n === 1 ? one : many}`;

export const SchoologyInboxModal: React.FC<SchoologyInboxModalProps> = ({
  items,
  quizzes,
  banks,
  loadImages,
  removeItem,
  attachPictures,
  canUploadPictures,
  onClose,
}) => {
  // Unticked rather than ticked, so an item that arrives while this is open starts ticked.
  const [unticked, setUnticked] = useState<Set<string>>(new Set());
  const [modes, setModes] = useState<Record<string, Mode>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [sharePictures, setSharePictures] = useState(true);
  const [save, setSave] = useState<SaveState>({ kind: 'idle' });
  const [discardError, setDiscardError] = useState<string | null>(null);
  const madeFolders = useRef({
    quiz: new Map<string, string>(),
    bank: new Map<string, string>(),
  });
  // A retry reuses the built copy, so its pictures aren't uploaded twice.
  const built = useRef(new Map<string, QuizData>());

  const rows = useMemo(
    () => planInboxRows(items, quizzes.existing, banks.existing),
    [items, quizzes.existing, banks.existing]
  );
  const selected = rows.filter(
    (r) => r.questionCount > 0 && !unticked.has(r.item.id)
  );
  const modeOf = (row: InboxRow): Mode =>
    row.existing ? (modes[row.item.id] ?? 'update') : 'keep';
  const pictureCount = selected.reduce((n, r) => n + r.item.images.length, 0);
  const busy = save.kind === 'saving';

  const toggleIn = (set: Set<string>, id: string): Set<string> => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };

  const discard = async (row: InboxRow): Promise<void> => {
    setDiscardError(null);
    try {
      await removeItem(row.item.id);
    } catch (err) {
      console.error('[SchoologyInbox] discard failed', err);
      setDiscardError(`“${row.item.quiz.title}” couldn’t be discarded.`);
    }
  };

  const buildCopy = async (
    row: InboxRow,
    withPictures: boolean,
    target: SchoologyLibraryTarget
  ): Promise<QuizData> => {
    const cached = built.current.get(row.item.id);
    if (cached) return cached;
    const { item } = row;
    const fresh = extractedToQuizData(item.quiz, { title: item.quiz.title });
    const images =
      withPictures && item.images.length ? await loadImages(item) : [];
    const pictured = await attachPictures(fresh, images);
    const source = importSourceFor(item);
    let copy: QuizData = { ...pictured, source };
    if (modeOf(row) === 'update' && row.existing) {
      const previous = await target.load(row.existing);
      // The old order and sections belong to questions this replaces.
      const { order: _order, sections: _sections, ...kept } = previous;
      // Pictures the teacher put on random bank slots stay; the old questions' pictures go.
      const slotPictures = new Set(
        (previous.bankSlots ?? []).flatMap((slot) => slot.stimulusIds ?? [])
      );
      const stimuli = [
        ...(previous.stimuli ?? []).filter((st) => slotPictures.has(st.id)),
        ...(pictured.stimuli ?? []),
      ];
      copy = {
        ...kept,
        title: pictured.title,
        questions: keepQuestionTags(previous.questions, pictured.questions),
        stimuli,
        source,
        updatedAt: source.importedAt,
      };
      if (stimuli.length === 0) delete copy.stimuli;
    }
    built.current.set(item.id, copy);
    return copy;
  };

  const runSave = async (targets: InboxRow[]): Promise<void> => {
    const withPictures = sharePictures && canUploadPictures;
    const saved: string[] = save.kind === 'finished' ? [...save.saved] : [];
    const failed: InboxRow[] = [];
    let done = 0;
    setSave({ kind: 'saving', done, total: targets.length });

    // New copies' folders first, one at a time, so items sharing a new folder find it.
    const folderFor = new Map<string, string | null>();
    const folderKey = (row: InboxRow) =>
      `${isBankItem(row.item) ? 'bank' : 'quiz'}\u0000${row.path.join('\u0000')}`;
    for (const row of targets) {
      const key = folderKey(row);
      if (modeOf(row) === 'update' || folderFor.has(key)) continue;
      const bank = isBankItem(row.item);
      try {
        folderFor.set(
          key,
          await ensureFolderPath(
            row.path,
            (bank ? banks : quizzes).folders,
            (bank ? banks : quizzes).createFolder,
            madeFolders.current[bank ? 'bank' : 'quiz']
          )
        );
      } catch (err) {
        console.error('[SchoologyInbox] folder create failed', err);
      }
    }

    await runPool(targets, SAVE_CONCURRENCY, async (row) => {
      const target = isBankItem(row.item) ? banks : quizzes;
      const update = modeOf(row) === 'update' && row.existing;
      try {
        const folderId = update ? null : folderFor.get(folderKey(row));
        if (folderId === undefined)
          throw new Error('Folder could not be created.');
        const copy = await buildCopy(row, withPictures, target);
        const behavior = isBankItem(row.item)
          ? undefined
          : behaviorFromSettings(row.item.settings);
        await target.save(copy, {
          folderId,
          replaces: update ? row.existing : null,
          ...(behavior && !update ? { behavior } : {}),
        });
        built.current.delete(row.item.id);
        saved.push(row.item.quiz.title);
        // Saved is what counts; a stale inbox entry only means it shows again.
        await removeItem(row.item.id).catch((err: unknown) =>
          console.error('[SchoologyInbox] inbox cleanup failed', err)
        );
      } catch (err) {
        console.error('[SchoologyInbox] save failed', err);
        failed.push(row);
      }
      done += 1;
      setSave({ kind: 'saving', done, total: targets.length });
    });

    setSave({ kind: 'finished', saved, failed });
  };

  const close = (): void => {
    if (busy) return;
    onClose(
      save.kind === 'finished'
        ? { saved: save.saved.length, failed: save.failed.length }
        : null
    );
  };

  const header = (
    <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-slate-200 shrink-0 bg-white rounded-t-2xl">
      <h3
        id="schoology-inbox-title"
        className="font-black text-lg text-slate-800 truncate"
      >
        From Schoology
      </h3>
      <button
        type="button"
        {...tourTypeAttr('quiz-import.schoology-close', 'quiz')}
        onClick={close}
        disabled={busy}
        className="p-1.5 hover:bg-slate-100 rounded-full text-slate-400 transition-colors shrink-0 disabled:opacity-40"
        aria-label="Close From Schoology"
      >
        <X size={20} />
      </button>
    </div>
  );

  let body: React.ReactNode;
  if (save.kind === 'saving') {
    const pct = save.total ? Math.round((save.done / save.total) * 100) : 0;
    body = (
      <div role="status" aria-live="polite" className="space-y-3 py-10">
        <p className="text-center font-bold text-slate-700 text-sm">
          Saving {Math.min(save.done + 1, save.total)} of {save.total}…
        </p>
        <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
          <div
            className="h-full bg-brand-blue-primary transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-center text-xs text-slate-500">
          Keep this window open until it finishes.
        </p>
      </div>
    );
  } else if (save.kind === 'finished') {
    body = (
      <div className="space-y-3 py-4">
        {save.saved.length > 0 && (
          <div className="flex items-start gap-2 rounded-xl border border-emerald-300/60 bg-emerald-50 p-3 text-sm font-medium text-emerald-800">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              {plural(save.saved.length, 'item')} saved to your library.
            </span>
          </div>
        )}
        {save.failed.length > 0 && (
          <div
            role="alert"
            className="rounded-xl border border-brand-red-primary/20 bg-brand-red-lighter/40 p-3 text-sm text-brand-red-dark"
          >
            <p className="font-bold">
              {plural(save.failed.length, 'item')} couldn’t be saved:
            </p>
            <ul className="mt-1 list-disc pl-5">
              {save.failed.map((r) => (
                <li key={r.item.id}>{r.item.quiz.title}</li>
              ))}
            </ul>
            <p className="mt-1 text-xs">
              They stay here for 7 days after you sent them.
            </p>
          </div>
        )}
      </div>
    );
  } else if (rows.length === 0) {
    body = (
      <p className="py-12 text-center text-sm text-slate-500">
        Nothing waiting. Use Send to SpartBoard on a Schoology quiz or question
        bank and it shows up here.
      </p>
    );
  } else {
    let lastPath = '';
    body = (
      <div className="space-y-4">
        <p className="text-xs text-slate-500">
          Items you don’t save are removed 7 days after you sent them.
        </p>
        <div className="flex items-center justify-between text-xs font-bold text-slate-600">
          <span>
            {selected.length} of {rows.length} selected ·{' '}
            {plural(
              selected.reduce((n, r) => n + r.questionCount, 0),
              'question'
            )}
          </span>
          <span className="flex gap-3">
            <button
              type="button"
              {...tourTypeAttr('quiz-import.schoology-select-all', 'quiz')}
              onClick={() => setUnticked(new Set())}
              className="text-brand-blue-primary hover:underline"
            >
              Select all
            </button>
            <button
              type="button"
              {...tourTypeAttr('quiz-import.schoology-select-none', 'quiz')}
              onClick={() => setUnticked(new Set(rows.map((r) => r.item.id)))}
              className="text-brand-blue-primary hover:underline"
            >
              Select none
            </button>
          </span>
        </div>

        {discardError && (
          <p role="alert" className="text-xs font-medium text-brand-red-dark">
            {discardError}
          </p>
        )}

        <ul
          aria-label="Items sent from Schoology"
          className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white"
        >
          {rows.map((row) => {
            const { item } = row;
            const id = item.id;
            const bank = isBankItem(item);
            const pathLabel = row.path.join(' › ');
            const showPath = pathLabel !== lastPath;
            // eslint-disable-next-line react-hooks/immutability -- reassigned synchronously within this map
            lastPath = pathLabel;
            const open = expanded.has(id);
            const empty = row.questionCount === 0;
            const settings = bank ? [] : settingsSummary(item.settings);
            return (
              <li key={id}>
                {showPath && (
                  <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 text-[11px] font-bold text-slate-500">
                    <Folder className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{pathLabel}</span>
                  </div>
                )}
                <div
                  className={`flex items-start gap-3 px-3 py-2 ${empty ? 'opacity-60' : ''}`}
                >
                  <input
                    type="checkbox"
                    {...tourFieldAttr(
                      'quiz-import.schoology-row-check',
                      'quiz',
                      id
                    )}
                    className="mt-1 h-4 w-4 shrink-0 accent-brand-blue-primary"
                    checked={!empty && !unticked.has(id)}
                    disabled={empty}
                    onChange={() => setUnticked(toggleIn(unticked, id))}
                    aria-label={`Save ${item.quiz.title}`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-sm font-bold text-slate-800">
                        {item.quiz.title}
                      </span>
                      {bank && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                          <Library className="h-3 w-3" />
                          Question bank
                        </span>
                      )}
                      <span className="text-xs text-slate-500">
                        {empty
                          ? 'No questions came across'
                          : plural(row.questionCount, 'question')}
                      </span>
                      {row.flaggedCount > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">
                          <AlertTriangle className="h-3 w-3" />
                          {row.flaggedCount} to check
                        </span>
                      )}
                      {row.needsKeyCount > 0 && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">
                          {plural(row.needsKeyCount, 'answer')} missing
                        </span>
                      )}
                      {item.images.length > 0 && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500">
                          <ImageIcon className="h-3 w-3" />
                          {item.images.length}
                        </span>
                      )}
                    </div>
                    {settings.length > 0 && (
                      <p className="text-[11px] text-slate-500">
                        Settings: {settings.join(' · ')}
                      </p>
                    )}
                    {row.existing && !empty && (
                      <label className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-700">
                        <span>
                          You brought this in before as “{row.existing.title}”.
                        </span>
                        <select
                          {...tourFieldAttr(
                            'quiz-import.schoology-row-mode',
                            'quiz',
                            id
                          )}
                          value={modeOf(row)}
                          onChange={(e) =>
                            setModes({
                              ...modes,
                              [id]: e.target.value as Mode,
                            })
                          }
                          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-700"
                          aria-label={`What to do with ${item.quiz.title}`}
                        >
                          <option value="update">Update that copy</option>
                          <option value="keep">Keep both</option>
                        </select>
                      </label>
                    )}
                    {item.quiz.warnings.map((w) => (
                      <p
                        key={w}
                        className="flex items-start gap-1 text-[11px] font-medium text-amber-700"
                      >
                        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                        {w}
                      </p>
                    ))}
                    {open && <QuestionList questions={item.quiz.questions} />}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {!empty && (
                      <button
                        type="button"
                        {...tourFieldAttr(
                          'quiz-import.schoology-row-expand',
                          'quiz',
                          id
                        )}
                        onClick={() => setExpanded(toggleIn(expanded, id))}
                        aria-expanded={open}
                        aria-label={`${open ? 'Hide' : 'Show'} questions in ${item.quiz.title}`}
                        className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                      >
                        {open ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </button>
                    )}
                    <button
                      type="button"
                      {...tourFieldAttr(
                        'quiz-import.schoology-row-discard',
                        'quiz',
                        id
                      )}
                      onClick={() => void discard(row)}
                      aria-label={`Discard ${item.quiz.title}`}
                      title="Discard"
                      className="rounded-lg p-1 text-slate-400 hover:bg-brand-red-lighter/40 hover:text-brand-red-dark"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        {pictureCount > 0 && (
          <label className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-700">
            <input
              type="checkbox"
              {...tourTypeAttr('quiz-import.schoology-share-pictures', 'quiz')}
              className="mt-0.5 h-4 w-4 shrink-0 accent-brand-blue-primary"
              checked={sharePictures && canUploadPictures}
              disabled={!canUploadPictures}
              onChange={(e) => setSharePictures(e.target.checked)}
            />
            <span>
              {canUploadPictures
                ? `Copy ${plural(pictureCount, 'picture')} to your Drive and share ${pictureCount === 1 ? 'it' : 'them'} as “anyone with the link can view,” so students can see ${pictureCount === 1 ? 'it' : 'them'}. Unticked, items are saved without pictures.`
                : `Connect Google Drive to bring in ${plural(pictureCount, 'picture')}. Items will be saved without ${pictureCount === 1 ? 'it' : 'them'}.`}
            </span>
          </label>
        )}
      </div>
    );
  }

  const footerButton =
    'inline-flex items-center gap-1.5 px-5 py-2 bg-brand-blue-primary hover:bg-brand-blue-dark text-white text-sm font-bold rounded-xl transition-colors shadow-xs disabled:opacity-50 disabled:cursor-not-allowed';

  const footer = (
    <div className="flex items-center justify-between gap-3 px-6 py-3 bg-white">
      <button
        type="button"
        {...tourTypeAttr('quiz-import.schoology-cancel', 'quiz')}
        onClick={close}
        disabled={busy}
        className="px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100 rounded-xl transition-colors disabled:opacity-40"
      >
        {save.kind === 'finished' ? 'Done' : 'Close'}
      </button>
      {save.kind === 'idle' && rows.length > 0 && (
        <button
          type="button"
          {...tourTypeAttr('quiz-import.schoology-save', 'quiz')}
          onClick={() => void runSave(selected)}
          disabled={selected.length === 0}
          className={footerButton}
        >
          <CheckCircle2 className="w-4 h-4" />
          Save {plural(selected.length, 'item')}
        </button>
      )}
      {save.kind === 'finished' && save.failed.length > 0 && (
        <button
          type="button"
          {...tourTypeAttr('quiz-import.schoology-retry', 'quiz')}
          onClick={() => void runSave(save.failed)}
          className={footerButton}
        >
          Retry failed
        </button>
      )}
    </div>
  );

  return (
    <Modal
      isOpen
      onClose={close}
      customHeader={header}
      footer={footer}
      footerClassName="shrink-0 border-t border-slate-200 rounded-b-2xl"
      maxWidth="max-w-2xl"
      className="font-sans"
      contentClassName="px-6 py-5 bg-slate-50"
      ariaLabelledby="schoology-inbox-title"
      zIndex="z-dialog"
    >
      {body}
    </Modal>
  );
};

const QuestionList: React.FC<{ questions: readonly ExtractedQuestion[] }> = ({
  questions,
}) => (
  <ol className="mt-2 space-y-2 border-l-2 border-slate-100 pl-3">
    {questions.map((q) => (
      <li key={q.number} className="text-xs text-slate-700">
        <p className="line-clamp-3 whitespace-pre-line">
          <span className="font-bold text-slate-500">{q.number}. </span>
          {q.text || 'No question text'}
        </p>
        <p className="text-[11px] text-slate-400">
          {TYPE_LABEL[q.type] ?? q.type}
          {q.points !== undefined ? ` · ${plural(q.points, 'point')}` : ''}
          {q.correctAnswer && q.type !== 'free-response'
            ? ` · Answer: ${displayFibAnswer(q.correctAnswer)}`
            : ''}
        </p>
        {q.warnings.map((w) => (
          <p
            key={w}
            className="flex items-start gap-1 text-[11px] font-medium text-amber-700"
          >
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
            {w}
          </p>
        ))}
      </li>
    ))}
  </ol>
);
