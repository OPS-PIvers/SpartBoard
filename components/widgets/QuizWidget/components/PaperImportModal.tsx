/**
 * PaperImportModal — scan in, responses out (plan §6 `PaperImportPanel`).
 *
 * Pick the printed batch and the administration, read a scanned PDF or image
 * locally, then review: the answer key first (mandatory, plan Q19), then the
 * doubtful rows with their crops, spares to assign, and anything that could
 * not be read. Clean sheets need no attention. Nothing leaves the browser but
 * seat numbers, PINs, letters and, on `layoutVersion: 2` batches, the
 * handwritten box crops (handwritten plan D20, D21).
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CloudDownload,
  FileUp,
  History,
  Loader2,
  ScanLine,
  Tag,
  X,
} from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import { TargetChips } from '@/components/quiz/targets/TargetChips';
import { TargetPicker } from '@/components/quiz/targets/TargetPicker';
import type {
  ClassRoster,
  PaperBatch,
  PaperPendingReview,
  PaperPendingWritten,
  PaperSeatAssignment,
  QuestionTargetTag,
  QuizAssignment,
  QuizData,
} from '@/types';
import {
  createCropUploader,
  indexedDbCropStore,
  writtenCropKey,
  type CropStore,
  type CropUploader,
  type CropUploadStatus,
  type WrittenCrop,
} from '@/utils/paperCropStore';
import {
  assemblePaperScan,
  sheetRowOf,
  type AssembledSheet,
  type AssembleResult,
  type ScannedPage,
} from '@/utils/paperImportAssemble';
import {
  applyKeyToQuiz,
  buildImportPayload,
  findStudent,
  keySheetChoices,
  paperImportRequestFields,
  sheetRowQuestionIds,
  type ImportPaperCollision,
  type ImportPaperResponsesResult,
  type ImportPaperSheetPayload,
} from '@/utils/paperImportPlan';
import type { PaperImportQuota } from '@/utils/paperImportQuota';
import {
  applyTargetsToQuiz,
  fromPendingReview,
  pendingReviewMatches,
  targetsFromQuiz,
  toPendingReview,
} from '@/utils/paperReviewState';
import {
  cropWrittenBlob,
  rasterizeScan,
  type RasterizedPage,
} from '@/utils/paperScanRaster';
import { CHOICE_LETTERS, paperGridOf } from '@/utils/paperSheetLayout';
import { readPaperPage } from '@/utils/paperSheetReader';
import { paperCropStoragePath } from '@/utils/paperWritten';
import { overAnsweredSections, sessionSectionsFor } from '@/utils/quizSections';

const IMPORT_CHUNK = 200;
/** Debounce for parking the review on the batch doc (plan Q26). */
const SAVE_DELAY_MS = 600;

/** Callable request fields beyond the sheets: `{ layoutVersion: 2, scanId }` on a v2 batch. */
export interface PaperImportRequestExtra {
  layoutVersion?: 2;
  scanId?: string;
}

/** Handwritten-answer additions to the import result (handwritten plan §3.6); absent on v1. */
export interface PaperImportWrittenResult {
  keptWritten?: { seat: number; questionId: string }[];
  jobsCreated?: number;
  pagesQueued?: number;
  pagesOverQuota?: number;
}

type ImportResult = ImportPaperResponsesResult & PaperImportWrittenResult;

interface PaperImportModalProps {
  quiz: QuizData;
  /** Owner of the crop uploads; handwriting is not uploaded without it. */
  uid?: string;
  batches: PaperBatch[];
  rosters: ClassRoster[];
  /** Administrations of this quiz the scan may attach to (plan Q24). */
  assignments: QuizAssignment[];
  /** Create a fresh paper administration; returns its id. */
  onCreateAssignment: () => Promise<string>;
  onImport: (
    batchId: string,
    assignmentId: string,
    sheets: ImportPaperSheetPayload[],
    extra: PaperImportRequestExtra
  ) => Promise<ImportResult>;
  /** Upload one handwriting crop; Storage is create-only (handwritten plan §3.5). */
  onUploadCrop?: (path: string, blob: Blob) => Promise<void>;
  /** A crop another device uploaded, as a displayable URL; null when unavailable. */
  loadRemoteCrop?: (path: string) => Promise<string | null>;
  /** Read-only transcription quota, shown before import (D25). */
  checkQuota?: () => Promise<PaperImportQuota>;
  /** Persist the quiz after the key sheet fills in its answers. */
  onSaveQuiz: (quiz: QuizData) => Promise<void>;
  /** Park the review on the batch so a closed tab never means rescanning; null clears it. */
  onSavePending?: (
    batchId: string,
    review: PaperPendingReview | null
  ) => Promise<void>;
  /** Drive picker for copiers that scan to a folder (plan Q17); null when cancelled. */
  onPickFromDrive?: () => Promise<File | null>;
  onClose: () => void;
  onError: (message: string) => void;
  /** Test seams. */
  rasterize?: (file: Blob) => AsyncGenerator<RasterizedPage>;
  readPage?: typeof readPaperPage;
  cropWritten?: typeof cropWrittenBlob;
  cropStore?: CropStore;
}

type PickerTarget = { questionId: string } | { all: true };

type Step = 'setup' | 'reading' | 'review' | 'importing' | 'done';

const NEW_ADMINISTRATION = '__new__';

// Keyed by seat and question, not scan position, so a resumed review
// still finds the crops parked for it.
const cropKey = (seat: number, question: number) => `${seat}:${question}`;

const newScanId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID().replace(/-/g, '')
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

const objectUrl = (blob: Blob): string =>
  typeof URL.createObjectURL === 'function' ? URL.createObjectURL(blob) : '';

const revokeAll = (urls: ReadonlyMap<string, string>) => {
  if (typeof URL.revokeObjectURL !== 'function') return;
  for (const url of urls.values()) {
    if (url.startsWith('blob:')) URL.revokeObjectURL(url);
  }
};

type CropMime = 'image/webp' | 'image/png';

const cropMimeOf = (blob: Blob): CropMime =>
  blob.type === 'image/png' ? 'image/png' : 'image/webp';

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

const formatDate = (ms: number) =>
  new Date(ms).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

const sheetLabel = (
  sheet: AssembledSheet,
  rosters: readonly ClassRoster[]
): string => {
  if (sheet.kind === 'spare') return `Spare sheet (seat ${sheet.seat})`;
  const found = sheet.student ? findStudent(rosters, sheet.student) : null;
  if (!found) return `Seat ${sheet.seat}`;
  return `${found.student.lastName}, ${found.student.firstName} · ${found.roster.name}`;
};

export const PaperImportModal: React.FC<PaperImportModalProps> = ({
  quiz,
  uid,
  batches,
  rosters,
  assignments,
  onCreateAssignment,
  onImport,
  onUploadCrop,
  loadRemoteCrop,
  checkQuota,
  onSaveQuiz,
  onSavePending,
  onPickFromDrive,
  onClose,
  onError,
  rasterize = rasterizeScan,
  readPage = readPaperPage,
  cropWritten = cropWrittenBlob,
  cropStore = indexedDbCropStore,
}) => {
  const [step, setStep] = useState<Step>('setup');
  const [batchId, setBatchId] = useState(batches[0]?.id ?? '');
  const [assignmentId, setAssignmentId] = useState(NEW_ADMINISTRATION);
  const [progress, setProgress] = useState('');
  const [assembled, setAssembled] = useState<AssembleResult | null>(null);
  const [crops, setCrops] = useState<Map<string, string>>(new Map());
  const [key, setKey] = useState<Record<string, number | null>>({});
  const [keyConfirmed, setKeyConfirmed] = useState(false);
  const [spareAssignments, setSpareAssignments] = useState<
    Record<number, PaperSeatAssignment>
  >({});
  const [targets, setTargets] = useState<Record<string, QuestionTargetTag[]>>(
    () => targetsFromQuiz(quiz)
  );
  const [picker, setPicker] = useState<PickerTarget | null>(null);
  const [picking, setPicking] = useState(false);
  // The batch list is loaded once, so a discarded review is remembered here.
  const [discarded, setDiscarded] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<ImportResult | null>(null);
  const [replaceSeats, setReplaceSeats] = useState<Set<number>>(new Set());
  const [lastPayload, setLastPayload] = useState<ImportPaperSheetPayload[]>([]);
  const [importedAssignmentId, setImportedAssignmentId] = useState('');
  const [scanId, setScanId] = useState('');
  const [cropMime, setCropMime] = useState<Map<string, CropMime>>(new Map());
  // Blob URLs for this scan's crops, or URLs another device's upload came back as.
  const [thumbs, setThumbs] = useState<Map<string, string>>(new Map());
  const [uploads, setUploads] = useState<Map<string, CropUploadStatus>>(
    new Map()
  );
  const [quota, setQuota] = useState<PaperImportQuota | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const uploaderRef = useRef<CropUploader | null>(null);
  const thumbsRef = useRef(thumbs);
  thumbsRef.current = thumbs;

  useEffect(() => () => revokeAll(thumbsRef.current), []);

  const batch = useMemo(
    () => batches.find((b) => b.id === batchId) ?? null,
    [batches, batchId]
  );
  const rowIds = useMemo(
    () => sheetRowQuestionIds(quiz, batch ?? undefined),
    [quiz, batch]
  );
  const isV2 = batch?.layoutVersion === 2;
  const writtenLabels = useMemo(() => {
    const out = new Map<string, string>();
    for (const map of batch?.pageMaps ?? []) {
      for (const item of map.items) {
        if (item.kind === 'written') out.set(item.questionId, item.label);
      }
    }
    return out;
  }, [batch]);
  const quizSections = useMemo(() => sessionSectionsFor(quiz), [quiz]);
  const resumable =
    batch?.pendingReview &&
    !discarded.has(batch.id) &&
    pendingReviewMatches(batch, batch.pendingReview)
      ? batch.pendingReview
      : null;

  const pendingWritten = useMemo((): PaperPendingWritten | null => {
    if (!isV2 || !scanId || !assembled) return null;
    return {
      scanId,
      boxes: assembled.sheets.flatMap((s) =>
        (s.written ?? []).map((w) => ({
          seat: s.seat,
          questionId: w.questionId,
          page: w.page,
          state: w.state,
          uploaded:
            uploads.get(writtenCropKey(s.seat, w.questionId)) === 'done',
          ...(cropMime.has(writtenCropKey(s.seat, w.questionId))
            ? { mimeType: cropMime.get(writtenCropKey(s.seat, w.questionId)) }
            : {}),
        }))
      ),
    };
  }, [isV2, scanId, assembled, uploads, cropMime]);

  // Park the review whenever it changes (Q26). Firestore is the external
  // system here; the debounce keeps clicking through rows cheap.
  useEffect(() => {
    if (step !== 'review' || !assembled || !onSavePending || !batchId) return;
    const timer = window.setTimeout(() => {
      const review = toPendingReview(
        {
          assembled,
          assignmentId: assignmentId === NEW_ADMINISTRATION ? '' : assignmentId,
          key,
          keyConfirmed,
          spareAssignments,
          targets,
        },
        Date.now()
      );
      void onSavePending(
        batchId,
        pendingWritten ? { ...review, written: pendingWritten } : review
      ).catch(() => undefined);
    }, SAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [
    step,
    assembled,
    assignmentId,
    key,
    keyConfirmed,
    spareAssignments,
    targets,
    pendingWritten,
    onSavePending,
    batchId,
  ]);

  const refreshQuota = async (forBatch: PaperBatch) => {
    setQuota(null);
    if (forBatch.layoutVersion !== 2 || !checkQuota) return;
    try {
      setQuota(await checkQuota());
    } catch {
      setQuota(null);
    }
  };

  // Starts the background upload of every handwriting crop (D21); a crop is keyed by seat and question.
  const beginWritten = (
    next: AssembleResult,
    blobs: Map<string, Blob>,
    nextScanId: string,
    uploaded: ReadonlySet<string>,
    mimes: ReadonlyMap<string, CropMime>,
    resumed: boolean
  ) => {
    revokeAll(thumbsRef.current);
    setThumbs(new Map([...blobs].map(([k, blob]) => [k, objectUrl(blob)])));
    const nextMime = new Map(mimes);
    for (const [k, blob] of blobs) nextMime.set(k, cropMimeOf(blob));
    setCropMime(nextMime);
    setScanId(nextScanId);
    setUploads(new Map());
    const upload =
      onUploadCrop && uid
        ? onUploadCrop
        : () => Promise.reject(new Error('Sign in to upload handwriting.'));
    const uploader: CropUploader = createCropUploader(upload, (k, status) => {
      if (uploaderRef.current !== uploader) return;
      setUploads((prev) => new Map(prev).set(k, status));
    });
    uploaderRef.current = uploader;
    for (const sheet of next.sheets) {
      if (sheet.isBlank) continue;
      for (const w of sheet.written ?? []) {
        const k = writtenCropKey(sheet.seat, w.questionId);
        const blob = blobs.get(k);
        if (uploaded.has(k)) uploader.markDone(k);
        else if (blob && uid) {
          uploader.enqueue({
            key: k,
            path: paperCropStoragePath(
              uid,
              nextScanId,
              sheet.seat,
              w.questionId
            ),
            blob,
            mayExist: resumed,
          });
        }
      }
    }
  };

  const loadRemoteThumbs = async (
    forScanId: string,
    boxes: PaperPendingWritten['boxes'],
    local: ReadonlyMap<string, Blob>
  ) => {
    if (!loadRemoteCrop || !uid) return;
    const wanted = boxes.filter(
      (b) => b.uploaded && !local.has(writtenCropKey(b.seat, b.questionId))
    );
    for (let i = 0; i < wanted.length; i += 6) {
      const part = await Promise.all(
        wanted.slice(i, i + 6).map(async (b) => {
          const url = await loadRemoteCrop(
            paperCropStoragePath(uid, forScanId, b.seat, b.questionId)
          ).catch(() => null);
          return [writtenCropKey(b.seat, b.questionId), url] as const;
        })
      );
      if (uploaderRef.current === null) return;
      setThumbs((prev) => {
        const next = new Map(prev);
        for (const [k, url] of part) if (url) next.set(k, url);
        return next;
      });
    }
  };

  const handleResume = async () => {
    if (!resumable || !batch) return;
    const state = fromPendingReview(resumable);
    const pw = batch.layoutVersion === 2 ? resumable.written : undefined;
    let restored = state.assembled;
    if (pw) {
      // The compact review keeps written states apart from the sheets, so put them back.
      restored = {
        ...restored,
        sheets: restored.sheets.map((s) => ({
          ...s,
          written: pw.boxes
            .filter((b) => b.seat === s.seat)
            .map((b) => ({
              questionId: b.questionId,
              label: writtenLabels.get(b.questionId) ?? '',
              page: b.page,
              state: b.state,
              inkMm2: 0,
              scanIndex: -1,
            })),
        })),
      };
      const local = await cropStore.loadWritten(batch.id);
      const blobs = new Map<string, Blob>();
      if (local?.scanId === pw.scanId) {
        for (const c of local.crops) {
          if (c.blob) blobs.set(writtenCropKey(c.seat, c.questionId), c.blob);
        }
      }
      const uploaded = new Set(
        pw.boxes
          .filter((b) => b.uploaded)
          .map((b) => writtenCropKey(b.seat, b.questionId))
      );
      const mimes = new Map(
        pw.boxes.flatMap((b) =>
          b.mimeType
            ? [[writtenCropKey(b.seat, b.questionId), b.mimeType] as const]
            : []
        )
      );
      beginWritten(restored, blobs, pw.scanId, uploaded, mimes, true);
      void loadRemoteThumbs(pw.scanId, pw.boxes, blobs);
    }
    void refreshQuota(batch);
    setAssembled(restored);
    setAssignmentId(state.assignmentId || NEW_ADMINISTRATION);
    setKey(state.key);
    setKeyConfirmed(state.keyConfirmed);
    setSpareAssignments(state.spareAssignments);
    setTargets(state.targets);
    setCrops(await cropStore.load(batch.id));
    setStep('review');
  };

  const discardPending = async () => {
    if (!batch) return;
    setDiscarded((prev) => new Set(prev).add(batch.id));
    await Promise.all([
      onSavePending?.(batch.id, null).catch(() => undefined),
      cropStore.clear(batch.id),
    ]);
  };

  const readFile = async (file: File) => {
    if (!batch) return;
    setStep('reading');
    const pages: ScannedPage[] = [];
    const nextCrops = new Map<string, string>();
    const blobs = new Map<string, Blob>();
    const grid = paperGridOf(batch);
    const byMap = batch.layoutVersion === 2;
    try {
      let scanIndex = 0;
      for await (const page of rasterize(file)) {
        setProgress(`Reading page ${page.pageNumber}…`);
        const read = readPage(page.page, {
          questionCount: batch.questionCount,
          choiceCount: batch.choiceCount,
          columnsPerPage: grid,
          ...(byMap && batch.pageMaps ? { pageMaps: batch.pageMaps } : {}),
        });
        if (read.status === 'ok') {
          for (const row of read.rows) {
            if (row.doubt) {
              nextCrops.set(
                cropKey(read.marker.seat, sheetRowOf(read, row, grid)),
                page.crop(row.crop)
              );
            }
          }
          // Blank boxes are cropped too: they are archived as the record of an empty answer (D22).
          if (byMap && read.marker.seat !== batch.keySheetSeat) {
            for (const box of read.written) {
              const blob = await cropWritten(
                page.page,
                read.mmToPx,
                box.boxMm
              ).catch(() => null);
              const k = writtenCropKey(read.marker.seat, box.questionId);
              if (blob) blobs.set(k, blob);
              else blobs.delete(k);
            }
          }
        }
        pages.push({ scanIndex, read });
        scanIndex += 1;
      }
      const next = assemblePaperScan(batch, pages);
      setAssembled(next);
      setCrops(nextCrops);
      setKey(next.keySheet ? keySheetChoices(next.keySheet, quiz, batch) : {});
      setKeyConfirmed(false);
      setSpareAssignments({});
      void cropStore.save(batch.id, nextCrops);
      if (byMap) {
        const nextScanId = newScanId();
        const written: WrittenCrop[] = next.sheets.flatMap((s) =>
          (s.written ?? []).map((w) => ({
            seat: s.seat,
            questionId: w.questionId,
            page: w.page,
            state: w.state,
            blob: blobs.get(writtenCropKey(s.seat, w.questionId)) ?? null,
          }))
        );
        void cropStore.saveWritten(batch.id, {
          scanId: nextScanId,
          crops: written,
        });
        beginWritten(next, blobs, nextScanId, new Set(), new Map(), false);
      }
      void refreshQuota(batch);
      setProgress('');
      setStep('review');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not read the scan.');
      setStep('setup');
    }
  };

  const pickFromDrive = async () => {
    if (!onPickFromDrive) return;
    setPicking(true);
    try {
      const file = await onPickFromDrive();
      if (file) await readFile(file);
    } catch (err) {
      onError(
        err instanceof Error ? err.message : 'Could not open the Drive file.'
      );
    } finally {
      setPicking(false);
    }
  };

  const setAnswer = (seat: number, question: number, choice: number | null) => {
    setAssembled((prev) => {
      if (!prev) return prev;
      const patch = (s: AssembledSheet): AssembledSheet =>
        s.seat !== seat
          ? s
          : {
              ...s,
              answers: s.answers.map((a) =>
                a.question === question
                  ? {
                      question: a.question,
                      choice,
                      fills: a.fills,
                      crop: a.crop,
                      scanIndex: a.scanIndex,
                    }
                  : a
              ),
            };
      return { ...prev, sheets: prev.sheets.map(patch) };
    });
  };

  // A batch records choiceOrder only for an authored quiz; a stub's key comes
  // from the bubbled key sheet and nowhere else.
  const needsKey = !!batch?.keySheetSeat && !batch?.choiceOrder;
  const keyMissing = needsKey && !assembled?.keySheet;
  const keyIncomplete =
    !!assembled?.keySheet &&
    rowIds.some((id) => key[id] === null || key[id] === undefined);
  const canImport =
    step === 'review' &&
    !!assembled &&
    !keyMissing &&
    (!assembled.keySheet || (keyConfirmed && !keyIncomplete));

  const runImport = async (
    sheets: ImportPaperSheetPayload[],
    targetAssignmentId: string
  ): Promise<ImportResult> => {
    const extra: PaperImportRequestExtra = batch
      ? paperImportRequestFields(batch, scanId)
      : {};
    const written: number[] = [];
    const collisions: ImportPaperCollision[] = [];
    const keptWritten: { seat: number; questionId: string }[] = [];
    let jobsCreated = 0;
    let pagesQueued = 0;
    let pagesOverQuota = 0;
    for (let i = 0; i < sheets.length; i += IMPORT_CHUNK) {
      const part = await onImport(
        batchId,
        targetAssignmentId,
        sheets.slice(i, i + IMPORT_CHUNK),
        extra
      );
      written.push(...part.written);
      collisions.push(...part.collisions);
      keptWritten.push(...(part.keptWritten ?? []));
      jobsCreated += part.jobsCreated ?? 0;
      pagesQueued += part.pagesQueued ?? 0;
      pagesOverQuota += part.pagesOverQuota ?? 0;
    }
    return {
      written,
      collisions,
      keptWritten,
      jobsCreated,
      pagesQueued,
      pagesOverQuota,
    };
  };

  const buildPayload = (b: PaperBatch, sheets: readonly AssembledSheet[]) => {
    const built = buildImportPayload({
      batch: b,
      quiz,
      rosters,
      sheets,
      spareAssignments,
      ...(b.layoutVersion === 2 && uid && scanId
        ? { scan: { uid, scanId } }
        : {}),
    });
    return {
      ...built,
      payload: built.payload.map((sheet) =>
        sheet.written
          ? {
              ...sheet,
              written: sheet.written.map((w) => ({
                ...w,
                mimeType:
                  cropMime.get(writtenCropKey(sheet.seat, w.questionId)) ??
                  'image/webp',
              })),
            }
          : sheet
      ),
    };
  };

  // Every crop the payload points at must exist in Storage before the worker looks for it.
  const unuploaded = (payload: readonly ImportPaperSheetPayload[]) =>
    payload.flatMap((sheet) =>
      (sheet.written ?? []).filter(
        (w) =>
          uploaderRef.current?.status(
            writtenCropKey(sheet.seat, w.questionId)
          ) !== 'done'
      )
    ).length;

  const applyTags = (tags: QuestionTargetTag[], mode: 'add' | 'replace') => {
    if (!picker) return;
    const ids = 'all' in picker ? rowIds : [picker.questionId];
    setTargets((prev) => {
      const next = { ...prev };
      for (const id of ids) {
        const own = prev[id] ?? [];
        const merged =
          mode === 'replace'
            ? tags
            : [...own, ...tags.filter((t) => !own.some((p) => p.id === t.id))];
        if (merged.length > 0) next[id] = merged;
        else delete next[id];
      }
      return next;
    });
    setPicker(null);
  };

  const removeTag = (questionId: string, tagId: string) =>
    setTargets((prev) => {
      const rest = (prev[questionId] ?? []).filter((t) => t.id !== tagId);
      const next = { ...prev };
      if (rest.length > 0) next[questionId] = rest;
      else delete next[questionId];
      return next;
    });

  const handleImport = async () => {
    if (!batch || !assembled) return;
    setProgress('');
    setStep('importing');
    try {
      const { payload } = buildPayload(batch, assembled.sheets);
      if (isV2) {
        setProgress('Uploading handwriting…');
        await uploaderRef.current?.whenIdle();
        const missing = unuploaded(payload);
        if (missing > 0) {
          throw new Error(
            `${plural(missing, 'handwriting crop')} did not upload. Retry before importing.`
          );
        }
      }
      setProgress('');
      // Key first (Q19): grading reads the quiz, so the key must land before
      // any response that will be graded against it. Tags ride the same save.
      const now = Date.now();
      let nextQuiz = quiz;
      if (assembled.keySheet) nextQuiz = applyKeyToQuiz(quiz, batch, key, now);
      nextQuiz = applyTargetsToQuiz(nextQuiz, targets, now);
      if (nextQuiz !== quiz) await onSaveQuiz(nextQuiz);
      const target =
        assignmentId === NEW_ADMINISTRATION
          ? await onCreateAssignment()
          : assignmentId;
      setImportedAssignmentId(target);
      setLastPayload(payload);
      setResult(await runImport(payload, target));
      await discardPending();
      setStep('done');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Import failed.');
      setStep('review');
    }
  };

  const handleReplace = async () => {
    if (!result || replaceSeats.size === 0) return;
    setProgress('');
    setStep('importing');
    try {
      const retry = lastPayload
        .filter((s) => replaceSeats.has(s.seat))
        .map((s) => ({ ...s, replaceExisting: true }));
      const part = await runImport(retry, importedAssignmentId);
      setResult({
        written: [...result.written, ...part.written],
        collisions: result.collisions.filter((c) => !replaceSeats.has(c.seat)),
        keptWritten: [
          ...(result.keptWritten ?? []),
          ...(part.keptWritten ?? []),
        ],
        jobsCreated: (result.jobsCreated ?? 0) + (part.jobsCreated ?? 0),
        pagesQueued: (result.pagesQueued ?? 0) + (part.pagesQueued ?? 0),
        pagesOverQuota:
          (result.pagesOverQuota ?? 0) + (part.pagesOverQuota ?? 0),
      });
      setReplaceSeats(new Set());
      setStep('done');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Import failed.');
      setStep('done');
    }
  };

  const summary = useMemo(() => {
    if (!assembled || !batch) return null;
    const { payload, skipped } = buildImportPayload({
      batch,
      quiz,
      rosters,
      sheets: assembled.sheets,
      spareAssignments,
      ...(isV2 && uid && scanId ? { scan: { uid, scanId } } : {}),
    });
    const writtenKeys = payload.flatMap((s) =>
      (s.written ?? []).map((w) => writtenCropKey(s.seat, w.questionId))
    );
    // One transcription call per page with ink (D24), so quota counts pages.
    const inkPages = new Set(
      payload.flatMap((s) =>
        (s.written ?? [])
          .filter((w) => w.state === 'ink')
          .map((w) => `${s.seat}:${w.page}`)
      )
    ).size;
    return {
      writtenKeys,
      inkPages,
      ready: payload.length,
      blank: skipped.filter((s) => s.reason === 'blank').length,
      unassigned: skipped.filter((s) => s.reason === 'unassigned-spare').length,
      missingStudent: skipped.filter((s) => s.reason === 'student-not-found')
        .length,
      doubtful: assembled.sheets.reduce(
        (n, s) => n + s.answers.filter((a) => a.doubt).length,
        0
      ),
    };
  }, [assembled, batch, quiz, rosters, spareAssignments, isV2, uid, scanId]);

  const header = (
    <div className="flex items-start justify-between border-b border-slate-100 px-5 pb-3 pt-5">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-blue-lighter/40 text-brand-blue-primary">
          <ScanLine className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-base font-bold text-slate-900">
            Import responses
          </h2>
          <p className="mt-0.5 max-w-[24rem] truncate text-xs text-slate-500">
            {quiz.title || 'Untitled paper test'}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="shrink-0 rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
      >
        <X className="h-5 w-5" />
      </button>
    </div>
  );

  const fieldClass =
    'mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm';
  const labelClass =
    'text-xs font-bold uppercase tracking-wider text-slate-500';

  const renderSetup = () => (
    <div className="space-y-4 px-5 pb-5 pt-4">
      {batches.length === 0 ? (
        <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
          Print response sheets before importing a scan.
        </p>
      ) : (
        <>
          <label className="block">
            <span className={labelClass}>Printed batch</span>
            <select
              value={batchId}
              onChange={(e) => setBatchId(e.target.value)}
              className={fieldClass}
            >
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {formatDate(b.createdAt)} ·{' '}
                  {Object.keys(b.seats).length + b.spareSeats.length} sheets ·{' '}
                  {b.questionCount} questions
                  {b.printedByName ? ` · printed by ${b.printedByName}` : ''}
                </option>
              ))}
            </select>
            {batch?.printedByName && (
              <span className="mt-1 block text-xs text-slate-500">
                {batch.printedByName} printed this stack for you from your PLC.
              </span>
            )}
          </label>
          <label className="block">
            <span className={labelClass}>Administration</span>
            <select
              value={assignmentId}
              onChange={(e) => setAssignmentId(e.target.value)}
              className={fieldClass}
            >
              <option value={NEW_ADMINISTRATION}>
                New paper administration
              </option>
              {assignments.map((a) => (
                <option key={a.id} value={a.id}>
                  {formatDate(a.createdAt)} ·{' '}
                  {a.className?.trim() ? a.className : a.code}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-slate-500">
              Pick an existing one to add paper make-ups to it.
            </span>
          </label>
          {resumable && (
            <section className="rounded-xl border border-brand-blue-primary/30 bg-brand-blue-lighter/20 p-3">
              <p className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <History className="h-4 w-4 text-brand-blue-primary" />A review
                from {formatDate(resumable.savedAt)} is waiting
              </p>
              <p className="mt-0.5 text-xs text-slate-600">
                {resumable.sheets.length} sheet
                {resumable.sheets.length === 1 ? ' was' : 's were'} read but not
                imported.
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => void handleResume()}
                  className="rounded-lg bg-brand-blue-primary px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-blue-dark"
                >
                  Resume review
                </button>
                <button
                  type="button"
                  onClick={() => void discardPending()}
                  className="rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Discard it
                </button>
              </div>
            </section>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,image/*"
            aria-label="Scan file"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void readFile(file);
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={!batch}
            className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 px-4 py-6 text-sm font-semibold text-slate-600 transition-colors hover:border-brand-blue-primary hover:text-brand-blue-primary disabled:opacity-50"
          >
            <FileUp className="h-5 w-5" />
            Choose the scanned PDF or image
          </button>
          {onPickFromDrive && (
            <button
              type="button"
              onClick={() => void pickFromDrive()}
              disabled={!batch || picking}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:border-brand-blue-primary hover:text-brand-blue-primary disabled:opacity-50"
            >
              {picking ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CloudDownload className="h-4 w-4" />
              )}
              Pick the scan from Google Drive
            </button>
          )}
          <p className="text-xs text-slate-500">
            Pages can be in any order or upside down, and the file never leaves
            this computer.
          </p>
        </>
      )}
    </div>
  );

  const renderKey = () => {
    if (!assembled || !batch) return null;
    if (keyMissing) {
      return (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="mr-1 inline h-4 w-4" />
          The ANSWER KEY sheet was not in this scan. Scan it before importing.
        </div>
      );
    }
    if (!assembled.keySheet) return null;
    return (
      <section className="rounded-xl border border-slate-200 p-3">
        <p className="text-sm font-bold text-slate-900">Answer key</p>
        <p className="mt-0.5 text-xs text-slate-500">
          Check every row, because this key grades the whole stack.
        </p>
        <ol className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
          {rowIds.map((id, i) => (
            <li key={id} className="flex items-center gap-2 text-sm">
              <span className="w-6 text-right text-slate-500">{i + 1}.</span>
              <select
                aria-label={`Key for question ${i + 1}`}
                value={key[id] ?? ''}
                onChange={(e) => {
                  const v = e.target.value;
                  setKey((k) => ({ ...k, [id]: v === '' ? null : Number(v) }));
                  setKeyConfirmed(false);
                }}
                className="rounded border border-slate-200 px-1 py-0.5 text-sm"
              >
                <option value="">—</option>
                {CHOICE_LETTERS.slice(0, batch.choiceCount).map((letter, c) => (
                  <option key={letter} value={c}>
                    {letter}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ol>
        <label className="mt-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
          <input
            type="checkbox"
            checked={keyConfirmed}
            disabled={keyIncomplete}
            onChange={(e) => setKeyConfirmed(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          {keyIncomplete
            ? 'Fill in every row to confirm the key'
            : 'This key is correct'}
        </label>
      </section>
    );
  };

  const renderTargets = () => (
    <section className="rounded-xl border border-slate-200 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-bold text-slate-900">Learning targets</p>
        <button
          type="button"
          onClick={() => setPicker({ all: true })}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          <Tag className="h-3.5 w-3.5" />
          Tag all questions
        </button>
      </div>
      <ol className="mt-2 space-y-1">
        {rowIds.map((id, i) => (
          <li key={id} className="flex items-center gap-2 text-sm">
            <span className="w-6 shrink-0 text-right text-slate-500">
              {i + 1}.
            </span>
            <span className="min-w-0 flex-1">
              {targets[id]?.length ? (
                <TargetChips
                  targets={targets[id]}
                  compact
                  onRemove={(tagId) => removeTag(id, tagId)}
                />
              ) : (
                <span className="text-xs text-slate-400">No targets</span>
              )}
            </span>
            <button
              type="button"
              aria-label={`Tag question ${i + 1}`}
              onClick={() => setPicker({ questionId: id })}
              className="shrink-0 rounded px-2 py-0.5 text-xs font-semibold text-brand-blue-primary hover:bg-brand-blue-lighter/40"
            >
              {targets[id]?.length ? 'Edit' : 'Tag'}
            </button>
          </li>
        ))}
      </ol>
    </section>
  );

  const renderSheet = (sheet: AssembledSheet) => {
    if (!batch) return null;
    const doubtful = sheet.answers.filter((a) => a.doubt);
    // More than N bubbled in a choose-N section: the first N in order count (E15).
    const overAnswered = overAnsweredSections(
      quizSections,
      new Set(
        sheet.answers.flatMap((a) =>
          a.choice !== null && rowIds[a.question] ? [rowIds[a.question]] : []
        )
      )
    );
    const needsAttention =
      doubtful.length > 0 ||
      sheet.flags.length > 0 ||
      overAnswered.length > 0 ||
      (sheet.kind === 'spare' && !sheet.isBlank);
    if (!needsAttention) return null;
    return (
      <section
        key={sheet.seat}
        className="rounded-xl border border-slate-200 p-3"
        aria-label={sheetLabel(sheet, rosters)}
      >
        <p className="text-sm font-bold text-slate-900">
          {sheetLabel(sheet, rosters)}
        </p>
        {sheet.kind === 'spare' && !sheet.isBlank && (
          <label className="mt-2 block">
            <span className={labelClass}>Whose sheet is this?</span>
            <select
              aria-label={`Student for seat ${sheet.seat}`}
              value={
                spareAssignments[sheet.seat]
                  ? `${spareAssignments[sheet.seat].rosterId}/${spareAssignments[sheet.seat].studentId}`
                  : ''
              }
              onChange={(e) => {
                const [rosterId, studentId] = e.target.value.split('/');
                setSpareAssignments((prev) => {
                  const next = { ...prev };
                  if (rosterId && studentId)
                    next[sheet.seat] = { rosterId, studentId };
                  else delete next[sheet.seat];
                  return next;
                });
              }}
              className={fieldClass}
            >
              <option value="">Not assigned (skip this sheet)</option>
              {rosters.map((r) =>
                r.students.map((s) => (
                  <option key={`${r.id}/${s.id}`} value={`${r.id}/${s.id}`}>
                    {s.lastName}, {s.firstName} · {r.name}
                  </option>
                ))
              )}
            </select>
          </label>
        )}
        {sheet.missingPages.length > 0 && (
          <p className="mt-2 text-xs text-amber-800">
            Page {sheet.missingPages.join(', ')} not found in the scan, so those
            questions import blank.
          </p>
        )}
        {overAnswered.map(({ section, answered }) => (
          <p key={section.id} className="mt-2 text-xs text-amber-800">
            {`${section.title}: ${answered} answered but only ${section.chooseCount} count, so the first ${section.chooseCount} in order are scored.`}
          </p>
        ))}
        {sheet.flags.includes('duplicate-conflict') && (
          <p className="mt-2 text-xs text-amber-800">
            This sheet was scanned twice with different answers, so the later
            scan is shown.
          </p>
        )}
        {doubtful.length > 0 && (
          <ul className="mt-2 space-y-2">
            {doubtful.map((a) => {
              const crop = crops.get(cropKey(sheet.seat, a.question));
              return (
                <li
                  key={a.question}
                  className="flex flex-wrap items-center gap-3 rounded-lg bg-slate-50 p-2"
                >
                  <span className="w-8 text-sm font-semibold text-slate-700">
                    {a.question + 1}.
                  </span>
                  {crop && (
                    <img
                      src={crop}
                      alt={`Question ${a.question + 1} as scanned`}
                      className="h-10 rounded border border-slate-200 bg-white"
                    />
                  )}
                  <span className="text-xs text-slate-500">
                    {a.doubt === 'multiple'
                      ? 'More than one bubble'
                      : 'Unclear mark'}
                  </span>
                  <span className="flex gap-1">
                    {CHOICE_LETTERS.slice(0, batch.choiceCount).map(
                      (letter, c) => (
                        <button
                          key={letter}
                          type="button"
                          aria-label={`Question ${a.question + 1}: ${letter}`}
                          onClick={() => setAnswer(sheet.seat, a.question, c)}
                          className="h-7 w-7 rounded-full border border-slate-300 text-xs font-bold text-slate-700 hover:bg-brand-blue-lighter/40"
                        >
                          {letter}
                        </button>
                      )
                    )}
                    <button
                      type="button"
                      aria-label={`Question ${a.question + 1}: blank`}
                      onClick={() => setAnswer(sheet.seat, a.question, null)}
                      className="h-7 rounded-full border border-slate-300 px-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                    >
                      Blank
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    );
  };

  const writtenLabelOf = (questionId: string, label?: string) =>
    label !== undefined && label.length > 0
      ? label
      : (writtenLabels.get(questionId) ?? '');

  const renderWritten = () => {
    if (!isV2 || !assembled || !summary) return null;
    const sheets = assembled.sheets.filter(
      (s) => !s.isBlank && (s.written?.length ?? 0) > 0
    );
    if (sheets.length === 0) return null;
    const keys = summary.writtenKeys;
    const done = keys.filter((k) => uploads.get(k) === 'done').length;
    const failed = keys.filter((k) => uploads.get(k) === 'failed').length;
    const missing = keys.filter((k) => !uploads.has(k)).length;
    const over = quota
      ? quota.disabled
        ? summary.inkPages
        : Math.max(0, summary.inkPages - quota.remaining)
      : 0;
    return (
      <section
        className="rounded-xl border border-slate-200 p-3"
        aria-label="Written answers"
      >
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-bold text-slate-900">Written answers</p>
          <span className="text-xs text-slate-500">
            {done === keys.length
              ? 'Uploaded'
              : `Uploading ${done} of ${keys.length}`}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-slate-600">
          {plural(summary.inkPages, 'page')} to transcribe
        </p>
        {quota?.disabled ? (
          <p className="mt-1 text-xs text-amber-800">
            Transcription is off, so written answers import without typed text.
          </p>
        ) : (
          over > 0 && (
            <p className="mt-1 text-xs text-amber-800">
              {`${plural(over, 'page')} over today's transcription limit will be transcribed later.`}
            </p>
          )
        )}
        {failed > 0 && (
          <p className="mt-1 flex items-center gap-2 text-xs text-amber-800">
            {plural(failed, 'crop')} failed to upload.
            <button
              type="button"
              onClick={() => uploaderRef.current?.retryFailed()}
              className="rounded px-2 py-0.5 font-semibold text-brand-blue-primary hover:bg-brand-blue-lighter/40"
            >
              Retry
            </button>
          </p>
        )}
        {missing > 0 && (
          <p className="mt-1 text-xs text-amber-800">
            {`${plural(missing, 'crop')} did not upload from the computer that read the scan. Scan the stack again to import.`}
          </p>
        )}
        <ul className="mt-2 space-y-2">
          {sheets.map((sheet) => (
            <li key={sheet.seat}>
              <p className="text-xs font-semibold text-slate-700">
                {sheetLabel(sheet, rosters)}
              </p>
              <div className="mt-1 flex flex-wrap gap-2">
                {(sheet.written ?? []).map((w) => {
                  const k = writtenCropKey(sheet.seat, w.questionId);
                  const url = thumbs.get(k);
                  const label = writtenLabelOf(w.questionId, w.label);
                  const blank = w.state === 'blank';
                  return (
                    <figure
                      key={w.questionId}
                      className={`w-28 rounded-lg border bg-white p-1 ${
                        blank
                          ? 'border-dashed border-slate-300'
                          : 'border-slate-200'
                      }`}
                    >
                      {url ? (
                        <img
                          src={url}
                          alt={`Handwritten answer, question ${label}`}
                          className="h-16 w-full object-contain"
                        />
                      ) : (
                        <div className="h-16 w-full rounded bg-slate-50" />
                      )}
                      <figcaption className="mt-0.5 flex justify-between text-xs text-slate-600">
                        <span>{label}.</span>
                        {blank && (
                          <span className="font-semibold text-slate-500">
                            Blank
                          </span>
                        )}
                      </figcaption>
                    </figure>
                  );
                })}
              </div>
            </li>
          ))}
        </ul>
      </section>
    );
  };

  const renderReview = () => {
    if (!assembled || !summary) return null;
    const problems = [
      ...assembled.unreadablePages.map(
        (p) => `Page ${p + 1}: could not be read`
      ),
      ...assembled.foreignPages.map(
        (p) => `Page ${p + 1}: belongs to a different batch`
      ),
      ...assembled.unknownPages.map(
        (p) => `Page ${p + 1}: seat or page number not in this batch`
      ),
    ];
    const blankSheets = assembled.sheets.filter((s) => s.isBlank);
    return (
      <div className="space-y-4 px-5 pb-5 pt-4">
        <p className="text-sm text-slate-700">
          <strong>{summary.ready}</strong> sheet{summary.ready === 1 ? '' : 's'}{' '}
          ready to import
          {summary.doubtful > 0 && (
            <>
              , <strong>{summary.doubtful}</strong> row
              {summary.doubtful === 1 ? '' : 's'} to check
            </>
          )}
          {summary.blank > 0 && (
            <>
              , {summary.blank} blank sheet{summary.blank === 1 ? '' : 's'}{' '}
              unused
            </>
          )}
          {summary.unassigned > 0 && (
            <>
              , {summary.unassigned} spare{summary.unassigned === 1 ? '' : 's'}{' '}
              unassigned
            </>
          )}
          {summary.missingStudent > 0 && (
            <>, {summary.missingStudent} no longer on a roster</>
          )}
          .
        </p>
        {renderKey()}
        {renderTargets()}
        {assembled.sheets.map(renderSheet)}
        {renderWritten()}
        {problems.length > 0 && (
          <section className="rounded-xl border border-amber-200 bg-amber-50 p-3">
            <p className="text-sm font-bold text-amber-900">Pages set aside</p>
            <ul className="mt-1 space-y-0.5 text-xs text-amber-800">
              {problems.map((p) => (
                <li key={p}>• {p}</li>
              ))}
            </ul>
          </section>
        )}
        {blankSheets.length > 0 && (
          <p className="text-xs text-slate-500">
            Unused: {blankSheets.map((s) => sheetLabel(s, rosters)).join('; ')}.
          </p>
        )}
      </div>
    );
  };

  const renderDone = () => {
    if (!result) return null;
    return (
      <div className="space-y-4 px-5 pb-5 pt-4">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          <div>
            <p className="text-sm font-bold text-slate-900">
              {result.written.length} response
              {result.written.length === 1 ? '' : 's'} imported
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Grade and publish them in Results.
            </p>
            {(result.pagesQueued ?? 0) > 0 && (
              <p className="mt-1 text-xs text-slate-600">
                {plural(result.pagesQueued ?? 0, 'page')} of handwriting queued
                to transcribe.
              </p>
            )}
            {(result.pagesOverQuota ?? 0) > 0 && (
              <p className="mt-1 text-xs text-amber-800">
                {`${plural(result.pagesOverQuota ?? 0, 'page')} over today's limit will be transcribed later.`}
              </p>
            )}
          </div>
        </div>
        {(result.keptWritten?.length ?? 0) > 0 && (
          <section className="rounded-xl border border-slate-200 p-3">
            <p className="text-sm font-bold text-slate-900">
              {plural(result.keptWritten?.length ?? 0, 'written answer')} kept
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              Already graded or edited, so the new scan did not replace them.
            </p>
            <ul className="mt-2 space-y-0.5 text-sm text-slate-700">
              {(result.keptWritten ?? []).map((kept) => {
                const sheet = assembled?.sheets.find(
                  (s) => s.seat === kept.seat
                );
                return (
                  <li key={`${kept.seat}:${kept.questionId}`}>
                    {sheet ? sheetLabel(sheet, rosters) : `Seat ${kept.seat}`}
                    {` · question ${writtenLabelOf(kept.questionId)}`}
                  </li>
                );
              })}
            </ul>
          </section>
        )}
        {result.collisions.length > 0 && (
          <section className="rounded-xl border border-amber-200 bg-amber-50 p-3">
            <p className="text-sm font-bold text-amber-900">
              {result.collisions.length} student
              {result.collisions.length === 1
                ? ' already has'
                : 's already have'}{' '}
              a response here
            </p>
            <p className="mt-0.5 text-xs text-amber-800">
              Tick a sheet to replace that response with the paper one.
            </p>
            <ul className="mt-2 space-y-1">
              {result.collisions.map((c) => {
                const sheet = assembled?.sheets.find((s) => s.seat === c.seat);
                return (
                  <li key={c.seat} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      aria-label={`Replace seat ${c.seat}`}
                      checked={replaceSeats.has(c.seat)}
                      onChange={(e) =>
                        setReplaceSeats((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(c.seat);
                          else next.delete(c.seat);
                          return next;
                        })
                      }
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    <span>
                      {sheet ? sheetLabel(sheet, rosters) : `Seat ${c.seat}`}
                      <span className="ml-2 text-xs text-amber-800">
                        {c.fromOtherBatch
                          ? 'from an earlier paper import'
                          : 'answered on a device'}
                        {c.existingSubmittedAt
                          ? ` · ${formatDate(c.existingSubmittedAt)}`
                          : ''}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
            <button
              type="button"
              onClick={() => void handleReplace()}
              disabled={replaceSeats.size === 0}
              className="mt-3 rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
            >
              Replace selected
            </button>
          </section>
        )}
      </div>
    );
  };

  const uploadBlocked =
    isV2 &&
    !!summary &&
    summary.writtenKeys.some((k) => {
      const status = uploads.get(k);
      return status === undefined || status === 'failed';
    });

  const footer =
    step === 'review' ? (
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setStep('setup')}
          className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-100"
        >
          Back
        </button>
        <button
          type="button"
          onClick={() => void handleImport()}
          disabled={!canImport || summary?.ready === 0 || uploadBlocked}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-blue-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-blue-dark disabled:cursor-not-allowed disabled:opacity-50"
        >
          Import {summary?.ready ?? 0} sheet{summary?.ready === 1 ? '' : 's'}
        </button>
      </div>
    ) : step === 'done' ? (
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg bg-brand-blue-primary px-4 py-2 text-sm font-semibold text-white hover:bg-brand-blue-dark"
        >
          Done
        </button>
      </div>
    ) : undefined;

  return (
    <Modal
      isOpen
      onClose={onClose}
      ariaLabel="Import responses"
      maxWidth="max-w-2xl"
      contentClassName=""
      customHeader={header}
      footer={footer}
    >
      {step === 'setup' && renderSetup()}
      {(step === 'reading' || step === 'importing') && (
        <div className="flex items-center gap-3 px-5 py-8 text-sm text-slate-600">
          <Loader2 className="h-5 w-5 animate-spin" />
          {progress || (step === 'reading' ? 'Reading…' : 'Importing…')}
        </div>
      )}
      {step === 'review' && renderReview()}
      {step === 'done' && renderDone()}
      {picker && (
        <TargetPicker
          open
          initial={'all' in picker ? [] : (targets[picker.questionId] ?? [])}
          onApply={applyTags}
          onClose={() => setPicker(null)}
          allowReplace={'all' in picker}
          title={
            'all' in picker
              ? 'Tag every question'
              : `Question ${rowIds.indexOf(picker.questionId) + 1} targets`
          }
        />
      )}
    </Modal>
  );
};
