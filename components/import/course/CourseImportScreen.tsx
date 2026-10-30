// Whole-course import from a Schoology export: a checklist that mirrors the course's folders (IMPORT.md D19–D24).

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  FileQuestion,
  FileText,
  Folder,
  Library,
  Link2,
  Loader2,
  MessagesSquare,
  Paperclip,
  X,
} from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import { ImportWizard } from '@/components/common/library/importer';
import type { ImportParseResult } from '@/components/common/library/types';
import { tourAttr } from '@/config/tourAnchors';
import { AI_CONVERSION_LIMIT_NOTE } from '@/utils/import/aiConversion';
import { MAX_AI_CONVERSIONS_PER_IMPORT } from '@/utils/import/contract';
import {
  isAiTarget,
  nextAiBatch,
  planCourseImport,
  splitCourseRows,
  targetOf,
  type CourseRow,
  type CourseRowKind,
  type CourseRowTarget,
} from '@/utils/import/coursePlan';
import { runPool } from '@/utils/cartridgeBankImport';
import { titleFromFileName } from '@/utils/quizDocumentImport/fileKind';
import type { CourseImportApi, ReadCourse } from './courseImportApi';
import { readCourseExport } from './readCourse';

const SAVE_CONCURRENCY = 3;

const KIND_ICON: Record<CourseRowKind, React.ReactNode> = {
  quiz: <FileQuestion className="h-4 w-4" />,
  bank: <Library className="h-4 w-4" />,
  page: <FileText className="h-4 w-4" />,
  file: <Paperclip className="h-4 w-4" />,
  link: <Link2 className="h-4 w-4" />,
  discussion: <MessagesSquare className="h-4 w-4" />,
};

function targetLabel(kind: CourseRowKind, target: CourseRowTarget): string {
  switch (target) {
    case 'quiz':
      return 'Quiz';
    case 'questionBank':
      return 'Question bank';
    case 'flashcards':
      return 'Flashcards with AI';
    case 'activityWall':
      return isAiTarget(kind, target)
        ? 'Activity Wall with AI'
        : 'Activity Wall';
    case 'pdf':
      return 'PDF library';
    case 'links':
      return 'Link';
    case 'skip':
      return 'Skip';
  }
}

const plural = (n: number, one: string, many = `${one}s`): string =>
  `${n} ${n === 1 ? one : many}`;

const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};

function rowDetail(row: CourseRow): string {
  switch (row.kind) {
    case 'quiz':
    case 'bank':
      return row.questionCount
        ? plural(row.questionCount, 'question')
        : 'No questions in the export';
    case 'file':
      return row.material?.fileName ?? 'File';
    case 'link':
      return hostOf(row.material?.url ?? '');
    case 'page':
      return 'Page';
    case 'discussion':
      return 'Discussion';
  }
}

type ReadState =
  | { kind: 'reading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; course: ReadCourse };

type Phase =
  | { kind: 'checklist' }
  | { kind: 'saving'; done: number; total: number }
  | { kind: 'finished' }
  | { kind: 'reviewing'; batch: CourseRow[]; index: number };

type AiParse =
  | { kind: 'reading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; result: ImportParseResult<unknown> };

interface CourseImportScreenProps {
  file: File;
  api: CourseImportApi;
  onClose: () => void;
}

export const CourseImportScreen: React.FC<CourseImportScreenProps> = ({
  file,
  api,
  onClose,
}) => {
  const [read, setRead] = useState<ReadState>({ kind: 'reading' });
  const [name, setName] = useState('');
  const [picks, setPicks] = useState<Map<string, CourseRowTarget>>(new Map());
  const [sharePictures, setSharePictures] = useState(true);
  const [phase, setPhase] = useState<Phase>({ kind: 'checklist' });
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [failed, setFailed] = useState<CourseRow[]>([]);
  const [aiQueue, setAiQueue] = useState<CourseRow[]>([]);
  const [aiSaved, setAiSaved] = useState(0);
  const [links, setLinks] = useState<CourseRow[]>([]);
  const [linksBoard, setLinksBoard] = useState<'idle' | 'making' | 'made'>(
    'idle'
  );
  const [aiParse, setAiParse] = useState<AiParse>({ kind: 'reading' });
  const savedNow = useRef(new Set<string>());
  // The row under review; late AI results and a second close for another row are ignored.
  const reviewing = useRef<string | null>(null);

  // Reading the zip is async work outside React, so it runs in an effect.
  useEffect(() => {
    let cancelled = false;
    readCourseExport(file)
      .then((course) => {
        if (cancelled) return;
        setName(course.title || titleFromFileName(file.name));
        setRead({ kind: 'ready', course });
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
  }, [file]);

  const courseName = name.trim();
  // The host's access rules decide each row's choices; duplicates start on Skip.
  const planned = useMemo<CourseRow[]>(
    () =>
      read.kind === 'ready'
        ? planCourseImport(
            courseName || read.course.title,
            read.course.tests,
            read.course.banks,
            read.course.materials,
            api.access
          ).map((row) =>
            api.isDuplicate(row, row.guess, courseName) && row.guess !== 'skip'
              ? { ...row, guess: 'skip' as const, duplicate: true }
              : row
          )
        : [],
    [read, courseName, api]
  );
  const { parser, ai } = splitCourseRows(planned, picks);
  const pictureCount = parser.reduce(
    (n, r) => n + (r.bank?.images.length ?? 0),
    0
  );

  const pick = (row: CourseRow, target: CourseRowTarget): void => {
    const next = new Map(picks);
    next.set(row.id, target);
    setPicks(next);
  };

  const runSave = async (targets: CourseRow[]): Promise<void> => {
    const withPictures = sharePictures && api.canUploadPictures;
    const failures: CourseRow[] = [];
    let done = 0;
    setPhase({ kind: 'saving', done, total: targets.length });
    await runPool(targets, SAVE_CONCURRENCY, async (row) => {
      const target = targetOf(row, picks);
      try {
        if (target !== 'links' && target !== 'skip')
          await api.save(row, target, courseName, withPictures);
        savedNow.current.add(row.id);
      } catch (err) {
        console.error('[CourseImport] save failed', err);
        failures.push(row);
      }
      done += 1;
      setPhase({ kind: 'saving', done, total: targets.length });
    });
    setSaved(new Set(savedNow.current));
    setFailed(targets.filter((r) => failures.includes(r)));
    setPhase({ kind: 'finished' });
  };

  const start = async (): Promise<void> => {
    if (!(await api.confirm('Import course'))) return;
    setAiQueue(ai);
    setLinks(parser.filter((r) => targetOf(r, picks) === 'links'));
    void runSave(parser);
  };

  // AI rows convert one at a time, each landing in its own review.
  const convert = async (row: CourseRow): Promise<void> => {
    reviewing.current = row.id;
    setAiParse({ kind: 'reading' });
    try {
      const target = targetOf(row, picks) as 'flashcards' | 'activityWall';
      const adapter = api.reviewAdapter(row, target, courseName);
      const result = await adapter.parse({
        kind: 'conversion',
        input: { title: row.title, url: '', text: row.material?.text ?? '' },
      });
      if (reviewing.current !== row.id) return;
      setAiParse({ kind: 'ready', result });
    } catch (err) {
      if (reviewing.current !== row.id) return;
      setAiParse({
        kind: 'error',
        message:
          err instanceof Error ? err.message : 'That page couldn’t be read.',
      });
    }
  };

  const startReviews = async (): Promise<void> => {
    if (!(await api.confirm('Import with AI'))) return;
    const batch = nextAiBatch(aiQueue);
    setPhase({ kind: 'reviewing', batch, index: 0 });
    void convert(batch[0]);
  };

  // Closing a review pauses the batch; the pages after it stay queued for the next Review pages.
  const nextReview = (
    rowId: string,
    outcome: 'saved' | 'skipped' | 'closed'
  ): void => {
    if (phase.kind !== 'reviewing' || reviewing.current !== rowId) return;
    reviewing.current = null;
    if (outcome === 'saved') setAiSaved((n) => n + 1);
    const index = phase.index + 1;
    if (outcome === 'closed' || index >= phase.batch.length) {
      const done = phase.batch.slice(0, index);
      setAiQueue(aiQueue.filter((r) => !done.includes(r)));
      setPhase({ kind: 'finished' });
      return;
    }
    setPhase({ ...phase, index });
    void convert(phase.batch[index]);
  };

  const makeLinksBoard = async (): Promise<void> => {
    if (!(await api.confirm('Create a board'))) return;
    setLinksBoard('making');
    const ok = await api.createLinksBoard(
      courseName,
      links.map((r) => ({ url: r.material?.url ?? '', title: r.title }))
    );
    setLinksBoard(ok ? 'made' : 'idle');
  };

  const busy = phase.kind === 'saving' || linksBoard === 'making';
  const close = (): void => {
    if (!busy) onClose();
  };

  if (phase.kind === 'reviewing') {
    const row = phase.batch[phase.index];
    const target = targetOf(row, picks) as 'flashcards' | 'activityWall';
    if (aiParse.kind === 'ready') {
      return (
        <ImportWizard
          key={row.id}
          isOpen
          adapter={api.reviewAdapter(row, target, courseName)}
          initialParse={aiParse.result}
          onClose={() => nextReview(row.id, 'closed')}
          onSaved={() => nextReview(row.id, 'saved')}
        />
      );
    }
    return (
      <Modal
        isOpen
        onClose={() => nextReview(row.id, 'closed')}
        title={`Page ${phase.index + 1} of ${phase.batch.length}`}
        maxWidth="max-w-md"
        zIndex="z-dialog"
      >
        {aiParse.kind === 'reading' ? (
          <div
            role="status"
            className="flex flex-col items-center gap-3 py-10 text-center"
          >
            <Loader2 className="h-8 w-8 animate-spin text-brand-blue-primary" />
            <p className="text-sm font-bold text-slate-700">
              Reading “{row.title}” with AI…
            </p>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div
              role="alert"
              className="flex items-start gap-2 rounded-xl border border-brand-red-primary/20 bg-brand-red-lighter/40 p-3 text-sm font-medium text-brand-red-dark"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{aiParse.message}</span>
            </div>
            <div className="flex justify-center gap-2">
              <button
                type="button"
                onClick={() => nextReview(row.id, 'skipped')}
                {...tourAttr('import-course.review-skip')}
                className="rounded-xl px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100"
              >
                Skip
              </button>
              <button
                type="button"
                onClick={() => void convert(row)}
                {...tourAttr('import-course.review-retry')}
                className="rounded-xl bg-brand-blue-primary px-5 py-2 text-sm font-bold text-white hover:bg-brand-blue-dark"
              >
                Try again
              </button>
            </div>
          </div>
        )}
      </Modal>
    );
  }

  const header = (
    <div className="flex items-center justify-between gap-4 px-6 py-4 shrink-0 bg-brand-blue-primary rounded-t-2xl">
      <h3 id="course-import-title" className="font-black text-lg text-white">
        Import a Schoology course
      </h3>
      <button
        type="button"
        onClick={close}
        disabled={busy}
        aria-label="Close"
        {...tourAttr('import-course.close')}
        className="relative touch-target-expand p-1.5 hover:bg-white/15 rounded-full text-white/80 hover:text-white transition-colors disabled:opacity-40"
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
        <Loader2 className="h-8 w-8 animate-spin text-brand-blue-primary" />
        <p className="text-sm font-bold text-slate-700">Reading {file.name}…</p>
      </div>
    );
  } else if (read.kind === 'error') {
    body = (
      <div
        role="alert"
        className="flex items-start gap-2 rounded-xl border border-brand-red-primary/20 bg-brand-red-lighter/40 p-3 text-sm font-medium text-brand-red-dark"
      >
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{read.message}</span>
      </div>
    );
  } else if (phase.kind === 'saving') {
    const pct = phase.total ? Math.round((phase.done / phase.total) * 100) : 0;
    body = (
      <div role="status" aria-live="polite" className="space-y-3 py-10">
        <p className="text-center text-sm font-bold text-slate-700">
          Saving {Math.min(phase.done + 1, phase.total)} of {phase.total}…
        </p>
        <div className="h-2 overflow-hidden rounded-full bg-slate-200">
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
  } else if (phase.kind === 'finished') {
    const savedCount =
      [...saved].filter((id) => !links.some((l) => l.id === id)).length +
      aiSaved;
    body = (
      <FinishScreen
        courseName={courseName}
        savedCount={savedCount}
        failed={failed}
        aiLeft={aiQueue.length}
        links={links}
        linksBoard={linksBoard}
        onReview={() => void startReviews()}
        onLinksBoard={() => void makeLinksBoard()}
      />
    );
  } else {
    body = (
      <Checklist
        rows={planned}
        picks={picks}
        onPick={pick}
        name={name}
        onName={setName}
        parserCount={parser.length}
        aiCount={ai.length}
        pictureCount={pictureCount}
        sharePictures={sharePictures && api.canUploadPictures}
        canUploadPictures={api.canUploadPictures}
        onSharePictures={setSharePictures}
      />
    );
  }

  const footerButton =
    'inline-flex items-center gap-1.5 px-5 py-2 bg-brand-blue-primary hover:bg-brand-blue-dark text-white text-sm font-bold rounded-xl transition-colors shadow-xs disabled:opacity-50 disabled:cursor-not-allowed';
  const chosen = parser.length + ai.length;
  const footer = (
    <div className="flex items-center justify-center gap-3 px-6 py-3 bg-white">
      <button
        type="button"
        onClick={close}
        disabled={busy}
        {...tourAttr('import-course.cancel')}
        className="px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100 rounded-xl transition-colors disabled:opacity-40"
      >
        {phase.kind === 'finished' ? 'Done' : 'Cancel'}
      </button>
      {read.kind === 'ready' && phase.kind === 'checklist' && (
        <button
          type="button"
          onClick={() => void start()}
          disabled={chosen === 0 || !courseName}
          {...tourAttr('import-course.import')}
          className={footerButton}
        >
          <CheckCircle2 className="h-4 w-4" />
          Import {plural(chosen, 'item')}
        </button>
      )}
      {phase.kind === 'finished' && failed.length > 0 && (
        <button
          type="button"
          onClick={() => void runSave(failed)}
          {...tourAttr('import-course.retry')}
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
      contentClassName="px-6 py-5 bg-white"
      ariaLabelledby="course-import-title"
      zIndex="z-dialog"
    >
      {body}
    </Modal>
  );
};

interface ChecklistProps {
  rows: CourseRow[];
  picks: ReadonlyMap<string, CourseRowTarget>;
  onPick: (row: CourseRow, target: CourseRowTarget) => void;
  name: string;
  onName: (name: string) => void;
  parserCount: number;
  aiCount: number;
  pictureCount: number;
  sharePictures: boolean;
  canUploadPictures: boolean;
  onSharePictures: (on: boolean) => void;
}

const Checklist: React.FC<ChecklistProps> = ({
  rows,
  picks,
  onPick,
  name,
  onName,
  parserCount,
  aiCount,
  pictureCount,
  sharePictures,
  canUploadPictures,
  onSharePictures,
}) => {
  const groups: { path: string; rows: CourseRow[] }[] = [];
  for (const row of rows) {
    const path = row.path.join(' › ');
    const last = groups.at(-1);
    if (last && last.path === path) last.rows.push(row);
    else groups.push({ path, rows: [row] });
  }
  return (
    <div className="space-y-4">
      <div>
        <label
          htmlFor="course-import-folder-name"
          className="mb-1.5 block text-xs font-black uppercase tracking-widest text-slate-500"
        >
          Folder name
        </label>
        <input
          id="course-import-folder-name"
          type="text"
          value={name}
          onChange={(e) => onName(e.target.value)}
          {...tourAttr('import-course.folder-name')}
          className="w-full rounded-xl border-2 border-slate-200 bg-white px-4 py-2 font-medium text-slate-800 transition-colors focus:border-brand-blue-primary focus:outline-hidden"
        />
        <p className="mt-1 text-xs text-slate-500">
          Quizzes, question banks and flashcards keep their Schoology folders
          inside this one.
        </p>
      </div>

      <p className="text-xs font-bold text-slate-600">
        {plural(parserCount, 'item')} to save
        {aiCount > 0 ? ` · ${plural(aiCount, 'page')} to make with AI` : ''}
      </p>
      {aiCount > 0 && (
        <p className="text-xs text-slate-500">{AI_CONVERSION_LIMIT_NOTE}</p>
      )}

      <ul
        aria-label="Items in the course"
        className="divide-y divide-slate-200 border-y border-slate-200"
      >
        {groups.map((group) => (
          <li key={group.path}>
            <div className="flex items-center gap-1.5 py-1.5 text-[11px] font-bold text-slate-500">
              <Folder className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{group.path}</span>
            </div>
            <ul className="divide-y divide-slate-100">
              {group.rows.map((row) => (
                <CourseRowItem
                  key={row.id}
                  row={row}
                  target={targetOf(row, picks)}
                  onPick={(t) => onPick(row, t)}
                />
              ))}
            </ul>
          </li>
        ))}
      </ul>

      {pictureCount > 0 && (
        <label className="flex items-start gap-2 text-xs text-slate-700">
          <input
            type="checkbox"
            {...tourAttr('import-course.share-pictures')}
            className="mt-0.5 h-4 w-4 shrink-0 accent-brand-blue-primary"
            checked={sharePictures}
            disabled={!canUploadPictures}
            onChange={(e) => onSharePictures(e.target.checked)}
          />
          <span>
            {canUploadPictures
              ? `Copy ${plural(pictureCount, 'picture')} to your Drive and share ${pictureCount === 1 ? 'it' : 'them'} as “anyone with the link can view,” so students can see ${pictureCount === 1 ? 'it' : 'them'}. Unticked, the quizzes are saved without pictures.`
              : `Connect Google Drive to bring in ${plural(pictureCount, 'picture')}. The quizzes will be saved without ${pictureCount === 1 ? 'it' : 'them'}.`}
          </span>
        </label>
      )}
    </div>
  );
};

const CourseRowItem: React.FC<{
  row: CourseRow;
  target: CourseRowTarget;
  onPick: (target: CourseRowTarget) => void;
}> = ({ row, target, onPick }) => (
  <li
    className={`flex items-center gap-3 py-2 pl-5 ${target === 'skip' ? 'text-slate-400' : ''}`}
  >
    <span
      className={`shrink-0 ${target === 'skip' ? 'text-slate-300' : 'text-slate-500'}`}
    >
      {KIND_ICON[row.kind]}
    </span>
    <span className="min-w-0 flex-1">
      <span
        className={`block truncate text-sm font-bold ${target === 'skip' ? 'text-slate-500' : 'text-slate-800'}`}
      >
        {row.title}
      </span>
      <span className="block truncate text-xs text-slate-500">
        {rowDetail(row)}
        {row.duplicate ? ' · Already in your library' : ''}
      </span>
    </span>
    <select
      value={target}
      onChange={(e) => onPick(e.target.value as CourseRowTarget)}
      disabled={row.options.length < 2}
      aria-label={`Import ${row.title} as`}
      {...tourAttr('import-course.row-target')}
      className="w-52 shrink-0 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm font-medium text-slate-700 focus:border-brand-blue-primary focus:outline-hidden disabled:bg-slate-50 disabled:text-slate-400"
    >
      {row.options.map((option) => (
        <option key={option} value={option}>
          {targetLabel(row.kind, option)}
        </option>
      ))}
    </select>
  </li>
);

const FinishScreen: React.FC<{
  courseName: string;
  savedCount: number;
  failed: CourseRow[];
  aiLeft: number;
  links: CourseRow[];
  linksBoard: 'idle' | 'making' | 'made';
  onReview: () => void;
  onLinksBoard: () => void;
}> = ({
  courseName,
  savedCount,
  failed,
  aiLeft,
  links,
  linksBoard,
  onReview,
  onLinksBoard,
}) => (
  <div className="space-y-5">
    {savedCount > 0 && (
      <p className="flex items-start gap-2 text-sm font-medium text-slate-700">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
        <span>
          {plural(savedCount, 'item')} saved. Quizzes, question banks and
          flashcards are in the “{courseName}” folder.
        </span>
      </p>
    )}
    {failed.length > 0 && (
      <div role="alert" className="text-sm text-brand-red-dark">
        <p className="font-bold">
          {plural(failed.length, 'item')} couldn’t be saved:
        </p>
        <ul className="mt-1 list-disc pl-5">
          {failed.map((r) => (
            <li key={r.id}>{[...r.path, r.title].join(' › ')}</li>
          ))}
        </ul>
      </div>
    )}
    {aiLeft > 0 && (
      <section className="space-y-2 border-t border-slate-200 pt-4">
        <p className="text-sm text-slate-700">
          {plural(aiLeft, 'page')} to make with AI. Each one opens for you to
          check before it saves.
        </p>
        <button
          type="button"
          onClick={onReview}
          {...tourAttr('import-course.review')}
          className="inline-flex items-center gap-1.5 rounded-xl bg-brand-blue-primary px-4 py-2 text-sm font-bold text-white hover:bg-brand-blue-dark"
        >
          {aiLeft > MAX_AI_CONVERSIONS_PER_IMPORT
            ? `Review the next ${MAX_AI_CONVERSIONS_PER_IMPORT}`
            : 'Review pages'}
        </button>
      </section>
    )}
    {links.length > 0 && (
      <section className="space-y-2 border-t border-slate-200 pt-4">
        <h4 className="text-xs font-black uppercase tracking-widest text-slate-500">
          Links
        </h4>
        <ul className="space-y-1">
          {links.map((r) => (
            <li key={r.id} className="flex items-center gap-2 text-sm">
              <Link2 className="h-4 w-4 shrink-0 text-slate-400" />
              <a
                href={r.material?.url}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 truncate font-medium text-brand-blue-primary hover:underline"
              >
                {r.title}
              </a>
            </li>
          ))}
        </ul>
        {linksBoard === 'made' ? (
          <p className="text-sm text-slate-700">The board is ready.</p>
        ) : (
          <button
            type="button"
            onClick={onLinksBoard}
            disabled={linksBoard === 'making'}
            {...tourAttr('import-course.links-board')}
            className="inline-flex items-center gap-1.5 rounded-xl border border-brand-blue-primary px-4 py-2 text-sm font-bold text-brand-blue-primary hover:bg-brand-blue-lighter disabled:opacity-50"
          >
            {linksBoard === 'making' && (
              <Loader2 className="h-4 w-4 animate-spin" />
            )}
            Put these links on a new board
          </button>
        )}
      </section>
    )}
  </div>
);
