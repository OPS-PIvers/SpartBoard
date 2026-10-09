// Checklist import of every question bank, or every quiz, in a Schoology export (.imscc).

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Folder,
  Image as ImageIcon,
  Loader2,
  X,
} from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import { tourFieldAttr, tourTypeAttr } from '@/config/tourAnchors';
import type { LibraryFolder, QuizData } from '@/types';
import {
  extractedToQuizData,
  readCartridgeBanks,
  type CartridgeBank,
  type CartridgeBankCollection,
  type ExtractedImage,
  type RemoteImageFetcher,
} from '@/utils/quizDocumentImport';
import { titleFromFileName } from '@/utils/quizDocumentImport/fileKind';
import { displayFibAnswer } from '@/utils/quizFibBlanks';
import {
  EMPTY_BANK_REASON,
  EMPTY_QUIZ_REASON,
  ensureFolderPath,
  initiallyChecked,
  planBankImport,
  runPool,
  type BankImportRow,
  type LibraryItemPlacement,
} from '@/utils/cartridgeBankImport';

const SAVE_CONCURRENCY = 3;

const TYPE_LABEL: Record<string, string> = {
  MC: 'Multiple choice',
  MA: 'Choose all',
  FIB: 'Fill in',
  Matching: 'Matching',
  Ordering: 'Ordering',
  'free-response': 'Written',
};

export interface CartridgeImportSummary {
  saved: number;
  failed: number;
}

interface CartridgeBankImportModalProps {
  file: File;
  /** Question banks by default; `quiz` brings in the export's quizzes and tests. */
  kind?: 'bank' | 'quiz';
  onClose: (summary: CartridgeImportSummary | null) => void;
  existing: readonly LibraryItemPlacement[];
  folders: readonly LibraryFolder[];
  createFolder: (name: string, parentId: string | null) => Promise<string>;
  /** Saves one read item, pictures attached, into `folderId`. */
  saveItem: (quiz: QuizData, folderId: string) => Promise<void>;
  /** Uploads a bank's pictures and points its questions at them; no images strips the pointers. */
  attachPictures: (
    quiz: QuizData,
    images: readonly ExtractedImage[]
  ) => Promise<QuizData>;
  /** False when Drive isn't connected, so pictures can't be copied. */
  canUploadPictures: boolean;
  fetchRemoteImage?: RemoteImageFetcher;
  multiAnswer: boolean;
}

type ReadState =
  | { kind: 'reading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; collection: CartridgeBankCollection };

type SaveState =
  | { kind: 'idle' }
  | { kind: 'saving'; done: number; total: number }
  | { kind: 'finished'; saved: number; failed: string[] };

const plural = (n: number, one: string, many = `${one}s`): string =>
  `${n} ${n === 1 ? one : many}`;

export const CartridgeBankImportModal: React.FC<
  CartridgeBankImportModalProps
> = ({
  file,
  kind = 'bank',
  onClose,
  existing,
  folders,
  createFolder,
  saveItem,
  attachPictures,
  canUploadPictures,
  fetchRemoteImage,
  multiAnswer,
}) => {
  const [read, setRead] = useState<ReadState>({ kind: 'reading' });
  const [name, setName] = useState('');
  const [checked, setChecked] = useState<Set<string> | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [sharePictures, setSharePictures] = useState(true);
  const [save, setSave] = useState<SaveState>({ kind: 'idle' });
  const savedIds = useRef(new Set<string>());
  const madeFolders = useRef(new Map<string, string>());
  // A retry reuses the row's quiz, so its id and uploaded pictures stay the same.
  const built = useRef(new Map<string, QuizData>());
  const isQuiz = kind === 'quiz';
  const noun = (n: number): string =>
    isQuiz ? plural(n, 'quiz', 'quizzes') : plural(n, 'bank');

  // Reading the zip is async work outside React, so it runs in an effect.
  useEffect(() => {
    let cancelled = false;
    readCartridgeBanks(file, titleFromFileName(file.name), {
      multiAnswer,
      read: isQuiz ? 'tests' : 'banks',
      ...(fetchRemoteImage ? { fetchRemoteImage } : {}),
    })
      .then((collection) => {
        if (cancelled) return;
        setName(collection.title);
        setRead({ kind: 'ready', collection });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setRead({
          kind: 'error',
          message:
            err instanceof Error
              ? err.message
              : 'That export couldn’t be read.',
        });
      });
    return () => {
      cancelled = true;
    };
  }, [file, multiAnswer, fetchRemoteImage, isQuiz]);

  const rows = useMemo<BankImportRow[]>(
    () =>
      read.kind === 'ready'
        ? planBankImport(
            read.collection.banks,
            name.trim() || read.collection.title,
            existing,
            folders
          )
        : [],
    [read, name, existing, folders]
  );

  // The first plan decides the starting ticks; the teacher's changes win after that.
  const ticked = checked ?? initiallyChecked(rows);
  const importable = rows.filter((r) => !r.empty);
  const selected = importable.filter((r) => ticked.has(r.bank.id));
  const pictureCount = selected.reduce((n, r) => n + r.bank.images.length, 0);
  const busy = save.kind === 'saving';

  const toggle = (id: string): void => {
    const next = new Set(ticked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setChecked(next);
  };

  const setAll = (on: boolean): void =>
    setChecked(new Set(on ? importable.map((r) => r.bank.id) : []));

  const toggleExpanded = (id: string): void => {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpanded(next);
  };

  const saveOne = async (
    row: BankImportRow,
    folderId: string,
    withPictures: boolean
  ): Promise<void> => {
    const bank: CartridgeBank = row.bank;
    const cached = built.current.get(bank.id);
    if (cached) {
      await saveItem(cached, folderId);
      return;
    }
    const quiz = extractedToQuizData(
      {
        title: bank.title,
        questions: bank.questions,
        images: [],
        warnings: [],
      },
      { title: bank.title }
    );
    const pictured = await attachPictures(
      quiz,
      withPictures ? bank.images : []
    );
    built.current.set(bank.id, pictured);
    await saveItem(pictured, folderId);
  };

  const runImport = async (targets: BankImportRow[]): Promise<void> => {
    const withPictures = sharePictures && canUploadPictures;
    const failed: string[] = [];
    let done = 0;
    setSave({ kind: 'saving', done, total: targets.length });

    // Folders first and one at a time, so banks sharing a new folder find it.
    const folderFor = new Map<string, string>();
    for (const row of targets) {
      const key = row.path.join('\u0000');
      if (folderFor.has(key)) continue;
      try {
        const id = await ensureFolderPath(
          row.path,
          folders,
          createFolder,
          madeFolders.current
        );
        if (id) folderFor.set(key, id);
      } catch (err) {
        console.error('[CartridgeBankImport] folder create failed', err);
      }
    }

    await runPool(targets, SAVE_CONCURRENCY, async (row) => {
      const folderId = folderFor.get(row.path.join('\u0000'));
      try {
        if (!folderId) throw new Error('Folder could not be created.');
        await saveOne(row, folderId, withPictures);
        savedIds.current.add(row.bank.id);
      } catch (err) {
        console.error('[CartridgeBankImport] bank save failed', err);
        failed.push(row.bank.id);
      }
      done += 1;
      setSave({ kind: 'saving', done, total: targets.length });
    });

    setSave({
      kind: 'finished',
      saved: savedIds.current.size,
      failed,
    });
  };

  const failedRows =
    save.kind === 'finished'
      ? rows.filter((r) => save.failed.includes(r.bank.id))
      : [];

  const close = (): void => {
    if (busy) return;
    onClose(
      save.kind === 'finished'
        ? { saved: save.saved, failed: save.failed.length }
        : null
    );
  };

  const header = (
    <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-slate-200 shrink-0 bg-white rounded-t-2xl">
      <h3
        id="cartridge-bank-import-title"
        className="font-black text-lg text-slate-800 truncate"
      >
        {isQuiz
          ? 'Import quizzes from Schoology'
          : 'Import question banks from Schoology'}
      </h3>
      <button
        type="button"
        {...tourTypeAttr('quiz-import.cartridge-close', 'quiz')}
        onClick={close}
        disabled={busy}
        className="p-1.5 hover:bg-slate-100 rounded-full text-slate-400 transition-colors shrink-0 disabled:opacity-40"
        aria-label={isQuiz ? 'Close quiz import' : 'Close question bank import'}
      >
        <X size={20} />
      </button>
    </div>
  );

  let body: React.ReactNode;
  if (read.kind === 'reading') {
    body = (
      <div
        role="status"
        className="flex flex-col items-center gap-3 py-12 text-center"
      >
        <Loader2 className="w-8 h-8 text-brand-blue-primary animate-spin" />
        <p className="font-bold text-slate-700 text-sm">Reading {file.name}…</p>
        <p className="text-xs text-slate-500">
          Linked pictures are copied now, so a large export can take a minute.
        </p>
      </div>
    );
  } else if (read.kind === 'error') {
    body = (
      <div
        role="alert"
        className="flex items-start gap-2 p-3 bg-brand-red-lighter/40 border border-brand-red-primary/20 rounded-xl text-brand-red-dark font-medium text-sm"
      >
        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
        <span>{read.message}</span>
      </div>
    );
  } else if (save.kind === 'saving') {
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
        <div className="flex items-start gap-2 rounded-xl border border-emerald-300/60 bg-emerald-50 p-3 text-sm font-medium text-emerald-800">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            {noun(save.saved)} saved to the “{name.trim()}” folder.
          </span>
        </div>
        {failedRows.length > 0 && (
          <div
            role="alert"
            className="rounded-xl border border-brand-red-primary/20 bg-brand-red-lighter/40 p-3 text-sm text-brand-red-dark"
          >
            <p className="font-bold">
              {noun(failedRows.length)} couldn’t be saved:
            </p>
            <ul className="mt-1 list-disc pl-5">
              {failedRows.map((r) => (
                <li key={r.bank.id}>{[...r.path, r.bank.title].join(' › ')}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  } else {
    const { collection } = read;
    const skipped = isQuiz ? collection.skippedBanks : collection.skippedTests;
    const skippedLabel = isQuiz
      ? plural(skipped, 'question bank')
      : plural(skipped, 'quiz or test', 'quizzes and tests');
    let lastPath = '';
    body = (
      <div className="space-y-4">
        <div>
          <label
            htmlFor="cartridge-bank-folder-name"
            className="block text-xs font-black uppercase tracking-widest text-slate-500 mb-1.5"
          >
            Folder name
          </label>
          <input
            id="cartridge-bank-folder-name"
            {...tourTypeAttr('quiz-import.cartridge-folder-name', 'quiz')}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-4 py-2 bg-white border-2 border-slate-200 rounded-xl text-slate-800 font-medium focus:outline-none focus:border-brand-blue-primary transition-colors"
          />
          <p className="mt-1 text-xs text-slate-500">
            {isQuiz ? 'Quizzes' : 'Banks'} keep their Schoology folders inside
            this one.
            {skipped > 0 &&
              ` ${skippedLabel} in the export ${skipped === 1 ? 'was' : 'were'} skipped.`}
          </p>
        </div>

        <div className="flex items-center justify-between text-xs font-bold text-slate-600">
          <span>
            {selected.length} of {importable.length}{' '}
            {isQuiz ? 'quizzes' : 'banks'} selected ·{' '}
            {plural(
              selected.reduce((n, r) => n + r.questionCount, 0),
              'question'
            )}
          </span>
          <span className="flex gap-3">
            <button
              type="button"
              {...tourTypeAttr('quiz-import.cartridge-select-all', 'quiz')}
              onClick={() => setAll(true)}
              className="text-brand-blue-primary hover:underline"
            >
              Select all
            </button>
            <button
              type="button"
              {...tourTypeAttr('quiz-import.cartridge-select-none', 'quiz')}
              onClick={() => setAll(false)}
              className="text-brand-blue-primary hover:underline"
            >
              Select none
            </button>
          </span>
        </div>

        <ul
          aria-label={
            isQuiz ? 'Quizzes in the export' : 'Question banks in the export'
          }
          className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white"
        >
          {rows.map((row) => {
            const pathLabel = row.path.join(' › ');
            const showPath = pathLabel !== lastPath;
            lastPath = pathLabel;
            const id = row.bank.id;
            const open = expanded.has(id);
            return (
              <li key={id}>
                {showPath && (
                  <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 text-[11px] font-bold text-slate-500">
                    <Folder className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{pathLabel}</span>
                  </div>
                )}
                <div
                  className={`flex items-start gap-3 px-3 py-2 ${row.empty ? 'opacity-60' : ''}`}
                >
                  <input
                    type="checkbox"
                    {...tourFieldAttr(
                      'quiz-import.cartridge-row-check',
                      'quiz',
                      id
                    )}
                    className="mt-1 h-4 w-4 shrink-0 accent-brand-blue-primary"
                    checked={!row.empty && ticked.has(id)}
                    disabled={row.empty}
                    onChange={() => toggle(id)}
                    aria-label={`Import ${row.bank.title}`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-sm font-bold text-slate-800">
                        {row.bank.title}
                      </span>
                      {!row.empty && (
                        <span className="text-xs text-slate-500">
                          {plural(row.questionCount, 'question')}
                        </span>
                      )}
                      {row.duplicate && (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                          Already in your library
                        </span>
                      )}
                      {row.flaggedCount > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">
                          <AlertTriangle className="h-3 w-3" />
                          {row.flaggedCount} to check
                        </span>
                      )}
                      {row.bank.images.length > 0 && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500">
                          <ImageIcon className="h-3 w-3" />
                          {row.bank.images.length}
                        </span>
                      )}
                    </div>
                    {row.empty && (
                      <p className="text-xs text-slate-500">
                        {isQuiz ? EMPTY_QUIZ_REASON : EMPTY_BANK_REASON}
                      </p>
                    )}
                    {open && <QuestionList bank={row.bank} />}
                  </div>
                  {!row.empty && (
                    <button
                      type="button"
                      {...tourFieldAttr(
                        'quiz-import.cartridge-row-expand',
                        'quiz',
                        id
                      )}
                      onClick={() => toggleExpanded(id)}
                      aria-expanded={open}
                      aria-label={`${open ? 'Hide' : 'Show'} questions in ${row.bank.title}`}
                      className="shrink-0 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                    >
                      {open ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        {pictureCount > 0 && (
          <label className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-700">
            <input
              type="checkbox"
              {...tourTypeAttr('quiz-import.cartridge-share-pictures', 'quiz')}
              className="mt-0.5 h-4 w-4 shrink-0 accent-brand-blue-primary"
              checked={sharePictures && canUploadPictures}
              disabled={!canUploadPictures}
              onChange={(e) => setSharePictures(e.target.checked)}
            />
            <span>
              {canUploadPictures
                ? `Copy ${plural(pictureCount, 'picture')} to your Drive and share ${pictureCount === 1 ? 'it' : 'them'} as “anyone with the link can view,” so students can see ${pictureCount === 1 ? 'it' : 'them'}. Unticked, the ${isQuiz ? 'quizzes' : 'banks'} are saved without pictures.`
                : `Connect Google Drive to bring in ${plural(pictureCount, 'picture')}. The ${isQuiz ? 'quizzes' : 'banks'} will be saved without ${pictureCount === 1 ? 'it' : 'them'}.`}
            </span>
          </label>
        )}
      </div>
    );
  }

  const footerButton =
    'inline-flex items-center gap-1.5 px-5 py-2 bg-brand-blue-primary hover:bg-brand-blue-dark text-white text-sm font-bold rounded-xl transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed';

  const footer = (
    <div className="flex items-center justify-between gap-3 px-6 py-3 bg-white">
      <button
        type="button"
        {...tourTypeAttr('quiz-import.cartridge-cancel', 'quiz')}
        onClick={close}
        disabled={busy}
        className="px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100 rounded-xl transition-colors disabled:opacity-40"
      >
        {save.kind === 'finished' ? 'Done' : 'Cancel'}
      </button>
      {read.kind === 'ready' && save.kind === 'idle' && (
        <button
          type="button"
          {...tourTypeAttr('quiz-import.cartridge-import', 'quiz')}
          onClick={() => void runImport(selected)}
          disabled={selected.length === 0 || !name.trim()}
          className={footerButton}
        >
          <CheckCircle2 className="w-4 h-4" />
          Import {noun(selected.length)}
        </button>
      )}
      {save.kind === 'finished' && failedRows.length > 0 && (
        <button
          type="button"
          {...tourTypeAttr('quiz-import.cartridge-retry', 'quiz')}
          onClick={() => void runImport(failedRows)}
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
      ariaLabelledby="cartridge-bank-import-title"
      zIndex="z-dialog"
    >
      {body}
    </Modal>
  );
};

const QuestionList: React.FC<{ bank: CartridgeBank }> = ({ bank }) => (
  <ol className="mt-2 space-y-2 border-l-2 border-slate-100 pl-3">
    {bank.questions.map((q) => (
      <li key={q.number} className="text-xs text-slate-700">
        <p className="line-clamp-3 whitespace-pre-line">
          <span className="font-bold text-slate-500">{q.number}. </span>
          {q.text || 'No question text'}
        </p>
        <p className="text-[11px] text-slate-400">
          {TYPE_LABEL[q.type] ?? q.type}
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
