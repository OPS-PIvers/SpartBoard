/**
 * Quiz-level stimulus management for the quiz editor, plus the compact
 * per-question attach section used in the detail pane. Both entry points
 * operate on the same `stimuli` array owned by `useQuizEditorState`.
 *
 * Sources: device upload or paste (teacher's Drive), Drive picker, URL paste. Uploaded
 * and Drive-pasted files require link-viewable sharing so anonymous
 * students can load them — the teacher is prompted to confirm on every
 * attach (never auto-shared silently).
 */
import { tourFieldAttr, tourTypeAttr } from '@/config/tourAnchors';
import React, { useCallback, useContext, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Calculator,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  FileText,
  Link2,
  Loader2,
  Paperclip,
  Shuffle,
  Trash2,
  Upload,
  Volume2,
  ListPlus,
} from 'lucide-react';
import type { QuizStimulus, QuizStimulusType } from '@/types';
import {
  STIMULUS_TYPE_LABELS,
  detectStimulusTypeFromFile,
  detectStimulusTypeFromUrl,
  isPlayLimitedType,
  questionsUsingStimulus,
  stimulusDisplayName,
  stimulusPickerTitle,
} from '@/utils/quizStimuli';
import { StimulusRenderer } from '@/components/quiz/QuizStimulusView';
import { extractGoogleFileId } from '@/utils/urlHelpers';
import { useGoogleDrive } from '@/hooks/useGoogleDrive';
import { useGooglePicker } from '@/hooks/useGooglePicker';
import { useFilesDrop } from '@/hooks/useFileDrop';
import {
  FileSourceButtons as SharedFileSourceButtons,
  UrlAddRow as SharedUrlAddRow,
  fileAddButtonClass as fileButtonClass,
} from '@/components/common/fileAdd/FileAddSources';
import {
  isImageFile,
  usePasteFiles,
} from '@/components/common/fileAdd/usePasteFiles';
import { useAuth } from '@/context/useAuth';
import { useDialog } from '@/context/useDialog';
import { extractStimulusReadAloudText } from '@/utils/quizReadAloudApi';
import type { QuizEditorController } from './useQuizEditorState';
import { MetaChevron, MetaItem, metaValueClass } from './QuestionFields';
import { StimulusTabFields } from './StimulusTabFields';
import { StimulusPickerModal } from './StimulusPickerModal';
import { PICKER_ADD, initialPickerSelection } from './stimulusPickerSelection';
import {
  StimulusTourTypeContext,
  type SharedEditorTourType,
} from './stimulusTourType';

/** What the panel needs to list and edit stimuli; a quiz also attaches them to questions. */
export type StimulusListState = Pick<
  QuizEditorController,
  'stimuli' | 'addStimulus' | 'updateStimulus' | 'deleteStimulus'
>;

const attachTargetsOf = (
  state: StimulusListState | QuizEditorController
): QuizEditorController | null => ('questions' in state ? state : null);

// Literal per-type anchors so the tour registry lists both widget types.
const CHOOSE_FILE = {
  quiz: tourTypeAttr('quiz-stimuli.choose-file', 'quiz'),
  writing: tourTypeAttr('quiz-stimuli.choose-file', 'writing'),
};
const CHOOSE_DRIVE = {
  quiz: tourTypeAttr('quiz-stimuli.choose-drive', 'quiz'),
  writing: tourTypeAttr('quiz-stimuli.choose-drive', 'writing'),
};
const URL_INPUT = {
  quiz: tourTypeAttr('quiz-stimuli.url-input', 'quiz'),
  writing: tourTypeAttr('quiz-stimuli.url-input', 'writing'),
};
const URL_ADD = {
  quiz: tourTypeAttr('quiz-stimuli.url-add', 'quiz'),
  writing: tourTypeAttr('quiz-stimuli.url-add', 'writing'),
};
const ADD_PASSAGE = {
  quiz: tourTypeAttr('quiz-stimuli.add-passage', 'quiz'),
  writing: tourTypeAttr('quiz-stimuli.add-passage', 'writing'),
};

const labelClass =
  'block text-slate-600 font-bold uppercase tracking-wider mb-1 text-xs';
const inputClass =
  'w-full bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-brand-blue-primary/40 focus:border-brand-blue-primary px-3 py-2 text-sm';

const TYPE_BADGE: Record<QuizStimulusType, string> = {
  image: 'bg-emerald-100 text-emerald-700',
  pdf: 'bg-red-100 text-red-700',
  audio: 'bg-amber-100 text-amber-800',
  video: 'bg-blue-100 text-blue-700',
  youtube: 'bg-rose-100 text-rose-700',
  'gdoc-embed': 'bg-indigo-100 text-indigo-700',
  text: 'bg-slate-200 text-slate-700',
  'word-bank': 'bg-sky-100 text-sky-800',
  calculator: 'bg-teal-100 text-teal-700',
};

/** Accept list for the device-upload input. */
const STIMULUS_ACCEPT = 'image/*,audio/*,video/*,application/pdf,.pdf';

/** Max upload size — matches the GL video ceiling. */
const MAX_STIMULUS_BYTES = 200 * 1024 * 1024;

/**
 * Shared intake used by both entry points. Returns the created stimulus
 * or null when an error hit.
 */
function useStimulusIntake(state: StimulusListState) {
  const { driveService, userDomain } = useGoogleDrive();
  const { openPicker } = useGooglePicker();
  const { ensureGoogleScope } = useAuth();
  const { showAlert } = useDialog();
  const [busy, setBusy] = useState(false);

  // Shares a copy so picking or linking a file never changes the original's sharing.
  const shareCopy = useCallback(
    async (fileId: string, name: string): Promise<string | null> => {
      if (!driveService) return null;
      let copyId: string | null = null;
      try {
        const copy = await driveService.copyFile(
          fileId,
          `stimulus-${Date.now()}-${name.replace(/[^\w.-]+/g, '_')}`,
          'Assets/QuizStimuli'
        );
        copyId = copy.id;
        await driveService.makePublic(copy.id, undefined);
        return copy.id;
      } catch {
        // Don't leave a private copy behind when sharing it failed.
        if (copyId)
          await driveService.deleteFile(copyId).catch(() => undefined);
        await showAlert(
          "Couldn't update sharing (you may not own this file). Make sure it's set to \"anyone with the link\" in Drive, or students won't see it.",
          { variant: 'warning' }
        );
        return null;
      }
    },
    [driveService, showAlert]
  );

  const addFromFile = useCallback(
    async (file: File): Promise<QuizStimulus | null> => {
      const type = detectStimulusTypeFromFile(file);
      if (!type) {
        await showAlert(
          `"${file.name}" isn't a supported stimulus. Use an image, audio, video, or PDF file.`,
          { variant: 'warning' }
        );
        return null;
      }
      if (file.size > MAX_STIMULUS_BYTES) {
        await showAlert(
          `"${file.name}" is too large (max ${Math.round(MAX_STIMULUS_BYTES / 1024 / 1024)}MB).`,
          { variant: 'warning' }
        );
        return null;
      }
      if (!driveService) {
        await showAlert(
          'Connect Google Drive to upload files — you can still paste a URL instead.',
          { variant: 'warning' }
        );
        return null;
      }
      setBusy(true);
      try {
        const driveFile = await driveService.uploadFile(
          file,
          `stimulus-${Date.now()}-${file.name.replace(/[^\w.-]+/g, '_')}`,
          'Assets/QuizStimuli'
        );
        // undefined domain forces type:'anyone' — anonymous live-session
        // students have no Workspace identity a domain grant could match.
        await driveService.makePublic(driveFile.id, undefined);
        const stimulus: QuizStimulus = {
          id: crypto.randomUUID(),
          type,
          url: `https://drive.google.com/file/d/${driveFile.id}/view`,
          driveFileId: driveFile.id,
          label: file.name,
        };
        state.addStimulus(stimulus);
        return stimulus;
      } catch (err) {
        await showAlert(
          err instanceof Error ? err.message : 'Upload failed. Try again.',
          { variant: 'error' }
        );
        return null;
      } finally {
        setBusy(false);
      }
    },
    [driveService, showAlert, state]
  );

  const addFromUrl = useCallback(
    async (rawUrl: string, label?: string): Promise<QuizStimulus | null> => {
      const url = rawUrl.trim();
      if (!url) return null;
      const type = detectStimulusTypeFromUrl(url);
      const driveFileId =
        /(?:drive|docs)\.google\.com\//.test(url) && type !== 'gdoc-embed'
          ? (extractGoogleFileId(url) ?? undefined)
          : undefined;
      setBusy(true);
      try {
        const copyId = driveFileId
          ? await shareCopy(driveFileId, label ?? driveFileId)
          : null;
        const fileId = copyId ?? driveFileId;
        const stimulus: QuizStimulus = {
          id: crypto.randomUUID(),
          type,
          url: copyId ? `https://drive.google.com/file/d/${copyId}/view` : url,
          ...(fileId ? { driveFileId: fileId } : {}),
          label: label ?? url.replace(/^https?:\/\//, '').slice(0, 60),
        };
        state.addStimulus(stimulus);
        return stimulus;
      } finally {
        setBusy(false);
      }
    },
    [shareCopy, state]
  );

  const addFromDrive = useCallback(async (): Promise<QuizStimulus | null> => {
    let picked;
    try {
      const token = await ensureGoogleScope('drive.file', {
        interactive: true,
      });
      if (!token) {
        throw new Error(
          'Google Drive access is required. Please sign in again.'
        );
      }
      picked = await openPicker({ mode: 'stimuli', token });
    } catch (err) {
      await showAlert(
        err instanceof Error ? err.message : 'Could not open Google Drive.',
        { variant: 'error' }
      );
      return null;
    }
    if (!picked) return null;
    // Docs and Slides take the same path as a pasted Doc link.
    if (picked.mimeType === 'application/vnd.google-apps.document') {
      return addFromUrl(
        `https://docs.google.com/document/d/${picked.id}/edit`,
        picked.name
      );
    }
    if (picked.mimeType === 'application/vnd.google-apps.presentation') {
      return addFromUrl(
        `https://docs.google.com/presentation/d/${picked.id}/edit`,
        picked.name
      );
    }
    const type = detectStimulusTypeFromFile(
      new File([], picked.name, { type: picked.mimeType })
    );
    if (!type) {
      await showAlert(
        `"${picked.name}" isn't a supported stimulus. Use an image, audio, video, or PDF file.`,
        { variant: 'warning' }
      );
      return null;
    }
    setBusy(true);
    try {
      const fileId = (await shareCopy(picked.id, picked.name)) ?? picked.id;
      const stimulus: QuizStimulus = {
        id: crypto.randomUUID(),
        type,
        url: `https://drive.google.com/file/d/${fileId}/view`,
        driveFileId: fileId,
        label: picked.name,
      };
      state.addStimulus(stimulus);
      return stimulus;
    } finally {
      setBusy(false);
    }
  }, [ensureGoogleScope, openPicker, addFromUrl, shareCopy, showAlert, state]);

  // userDomain intentionally unused today: stimulus sharing is always
  // type:'anyone' (anonymous students), never domain-scoped.
  void userDomain;

  /** A passage has no file and no URL; the text is the stimulus (D16). */
  const addPassage = useCallback((): QuizStimulus => {
    const stimulus: QuizStimulus = {
      id: crypto.randomUUID(),
      type: 'text',
      url: '',
      text: '',
      label: 'Passage',
      readAloudSource: 'text',
    };
    state.addStimulus(stimulus);
    return stimulus;
  }, [state]);

  const addWordBank = useCallback((): QuizStimulus => {
    const stimulus: QuizStimulus = {
      id: crypto.randomUUID(),
      type: 'word-bank',
      url: '',
      text: '',
      label: 'Word bank',
    };
    state.addStimulus(stimulus);
    return stimulus;
  }, [state]);

  const addCalculator = useCallback((): QuizStimulus => {
    const stimulus: QuizStimulus = {
      id: crypto.randomUUID(),
      type: 'calculator',
      url: '',
      calculator: 'graphing',
      label: 'Calculator',
    };
    state.addStimulus(stimulus);
    return stimulus;
  }, [state]);

  return {
    addFromFile,
    addFromUrl,
    addFromDrive,
    addPassage,
    addWordBank,
    addCalculator,
    busy,
  };
}

type StimulusIntake = ReturnType<typeof useStimulusIntake>;

/** Adds dropped or pasted files one at a time; each has its own share prompt. */
async function addFiles(
  addFromFile: StimulusIntake['addFromFile'],
  files: File[],
  onAdded?: (s: QuizStimulus) => void
): Promise<void> {
  for (const file of files) {
    const added = await addFromFile(file);
    if (added) onAdded?.(added);
  }
}

/** Hidden file input plus "Choose file" and "Choose from Drive" buttons. */
const FileSourceButtons: React.FC<{
  intake: StimulusIntake;
  onAdded?: (s: QuizStimulus) => void;
  compact?: boolean;
}> = ({ intake, onAdded, compact = false }) => {
  const tourType = useContext(StimulusTourTypeContext);
  return (
    <SharedFileSourceButtons
      onFiles={(files) => void addFiles(intake.addFromFile, files, onAdded)}
      onDrive={() =>
        void intake.addFromDrive().then((added) => {
          if (added) onAdded?.(added);
        })
      }
      busy={intake.busy}
      accept={STIMULUS_ACCEPT}
      compact={compact}
      inputTestId="stimulus-file-input"
      anchors={{
        file: compact ? undefined : CHOOSE_FILE[tourType],
        drive: compact ? undefined : CHOOSE_DRIVE[tourType],
      }}
    />
  );
};

const UrlAddRow: React.FC<{
  onAdd: (url: string) => Promise<unknown>;
  busy: boolean;
  anchored?: boolean;
}> = ({ onAdd, busy, anchored = false }) => {
  const tourType = useContext(StimulusTourTypeContext);
  return (
    <SharedUrlAddRow
      onAdd={onAdd}
      busy={busy}
      anchors={{
        input: anchored ? URL_INPUT[tourType] : undefined,
        add: anchored ? URL_ADD[tourType] : undefined,
      }}
    />
  );
};

// ─── Quiz-level panel (editor "Stimuli" tab) ────────────────────────────────

export const StimulusManagerPanel: React.FC<{
  /** A quiz editor attaches stimuli to questions; a list-only state hides that. */
  state: StimulusListState | QuizEditorController;
  /** `quiz-read-aloud` gate; shows the per-stimulus read-aloud text row (D12). */
  readAloudAvailable?: boolean;
  /** `quiz-calculator-stimulus` gate. */
  calculatorAvailable?: boolean;
  /** `quiz-word-bank` gate. */
  wordBankAvailable?: boolean;
  /** Widget type the panel's tour anchors are scoped to. */
  tourWidgetType?: SharedEditorTourType;
}> = ({
  state,
  readAloudAvailable = false,
  calculatorAvailable = false,
  wordBankAvailable = false,
  tourWidgetType = 'quiz',
}) => {
  const { stimuli } = state;
  const attach = attachTargetsOf(state);
  const intake = useStimulusIntake(state);
  const { addFromFile } = intake;
  const onFiles = useCallback(
    (files: File[]) => void addFiles(addFromFile, files),
    [addFromFile]
  );
  const drop = useFilesDrop(onFiles, intake.busy);
  usePasteFiles(onFiles, intake.busy);

  return (
    <StimulusTourTypeContext.Provider value={tourWidgetType}>
      <div className="flex-1 overflow-y-auto custom-scrollbar bg-slate-50 px-5 py-4 space-y-4">
        <div className="space-y-2">
          <div
            {...drop.dropProps}
            data-testid="stimulus-drop-zone"
            className={`flex flex-col items-center gap-2.5 rounded-lg border-2 border-dashed px-4 py-4 transition-colors ${
              drop.dragging
                ? 'border-brand-blue-primary bg-brand-blue-lighter'
                : 'border-slate-300 bg-white'
            }`}
          >
            <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-600">
              {intake.busy ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Upload className="h-4 w-4" aria-hidden />
              )}
              {drop.dragging ? 'Drop it here' : 'Drag a file or paste an image'}
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <FileSourceButtons intake={intake} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => intake.addPassage()}
              {...ADD_PASSAGE[tourWidgetType]}
              disabled={intake.busy}
              className="shrink-0 flex items-center gap-2 px-3 py-2 bg-white border-2 border-slate-300 hover:border-brand-blue-primary/50 disabled:opacity-40 rounded-lg text-sm font-bold text-slate-700"
            >
              <FileText className="w-4 h-4" />
              Add a passage
            </button>
            {wordBankAvailable && (
              <button
                type="button"
                onClick={() => intake.addWordBank()}
                {...tourTypeAttr('quiz-stimuli.add-word-bank', 'quiz')}
                disabled={intake.busy}
                className="shrink-0 flex items-center gap-2 px-3 py-2 bg-white border-2 border-slate-300 hover:border-brand-blue-primary/50 disabled:opacity-40 rounded-lg text-sm font-bold text-slate-700"
              >
                <ListPlus className="w-4 h-4" />
                Add a word bank
              </button>
            )}
            {calculatorAvailable && (
              <button
                type="button"
                onClick={() => intake.addCalculator()}
                {...tourTypeAttr('quiz-stimuli.add-calculator', 'quiz')}
                disabled={intake.busy}
                className="shrink-0 flex items-center gap-2 px-3 py-2 bg-white border-2 border-slate-300 hover:border-brand-blue-primary/50 disabled:opacity-40 rounded-lg text-sm font-bold text-slate-700"
              >
                <Calculator className="w-4 h-4" />
                Add a calculator
              </button>
            )}
            <div className="flex-1 min-w-[18rem]">
              <UrlAddRow
                onAdd={intake.addFromUrl}
                busy={intake.busy}
                anchored
              />
            </div>
          </div>
        </div>

        {stimuli.length === 0 ? (
          <div className="text-center text-slate-500 text-sm py-6 border-2 border-dashed border-slate-300 rounded-lg bg-white">
            No stimuli yet.
          </div>
        ) : (
          <div className="space-y-2">
            {stimuli.map((s, index) => (
              <StimulusCard
                key={s.id}
                index={index + 1}
                stimulus={s}
                state={state}
                attach={attach}
                readAloudAvailable={readAloudAvailable}
              />
            ))}
          </div>
        )}
        {attach && attach.questions.length === 0 && stimuli.length > 0 && (
          <p className="text-xs text-slate-500">
            Add questions to assign these stimuli.
          </p>
        )}
      </div>
    </StimulusTourTypeContext.Provider>
  );
};

/** 'text' is absent on purpose: a passage shows no read-aloud row (D16). */
const SOURCE_LABEL_KEY: Record<
  Exclude<NonNullable<QuizStimulus['readAloudSource']>, 'text'>,
  string
> = {
  'pdf-text': 'quizReadAloud.sourcePdfText',
  ocr: 'quizReadAloud.sourceOcr',
  edited: 'quizReadAloud.sourceEdited',
};

/** D12: collapsed "Read-aloud text" row under image/pdf stimuli; R12 help copy. */
const ReadAloudTextRow: React.FC<{
  stimulus: QuizStimulus;
  onChange: (updates: Partial<QuizStimulus>) => void;
}> = ({ stimulus: s, onChange }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<'needs-manual' | 'failed' | null>(null);
  const text = s.readAloudText ?? '';
  // A passage never reaches this row, so 'text' has no badge of its own.
  const source = s.readAloudSource === 'text' ? 'edited' : s.readAloudSource;
  const badge = text
    ? t(SOURCE_LABEL_KEY[source ?? 'edited'])
    : t('quizReadAloud.sourceNone', 'None');

  const extract = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await extractStimulusReadAloudText({
        stimulusId: s.id,
        type: s.type === 'pdf' ? 'pdf' : 'image',
        ...(s.driveFileId ? { driveFileId: s.driveFileId } : { url: s.url }),
      });
      if (res.source === 'needs-manual' || !res.text) {
        setNotice('needs-manual');
        return;
      }
      onChange({ readAloudText: res.text, readAloudSource: res.source });
    } catch {
      setNotice('failed');
    } finally {
      setBusy(false);
    }
  };
  const clear = () => {
    setNotice(null);
    onChange({ readAloudText: undefined, readAloudSource: undefined });
  };

  return (
    <div className="rounded-lg border border-slate-200">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        {...tourTypeAttr('quiz-stimuli.read-aloud-toggle', 'quiz')}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs font-bold text-slate-600 hover:bg-slate-50"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5" aria-hidden />
        ) : (
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        )}
        <Volume2 className="h-3.5 w-3.5" aria-hidden />
        <span className="flex-1">
          {t('quizReadAloud.stimulusText', 'Read-aloud text')}
        </span>
        <span
          data-testid="read-aloud-source-badge"
          className={`rounded px-1.5 py-0.5 text-xxs font-bold uppercase tracking-wider ${
            text
              ? 'bg-brand-blue-lighter text-brand-blue-primary'
              : 'bg-slate-100 text-slate-500'
          }`}
        >
          {badge}
        </span>
      </button>
      {open && (
        <div className="space-y-2 border-t border-slate-100 px-2.5 pb-2.5 pt-2">
          <textarea
            aria-label={t('quizReadAloud.stimulusText', 'Read-aloud text')}
            value={text}
            rows={5}
            disabled={busy}
            {...tourTypeAttr('quiz-stimuli.read-aloud-text', 'quiz')}
            onChange={(e) => {
              const next = e.target.value;
              if (next.trim()) {
                onChange({ readAloudText: next, readAloudSource: 'edited' });
              } else {
                onChange({
                  readAloudText: undefined,
                  readAloudSource: undefined,
                });
              }
            }}
            placeholder={t(
              'quizReadAloud.stimulusTextPlaceholder',
              'Text students hear for this stimulus'
            )}
            className={`${inputClass} resize-y text-sm`}
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void extract()}
              {...tourTypeAttr('quiz-stimuli.read-aloud-extract', 'quiz')}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-blue-primary px-2.5 py-1.5 text-xs font-bold text-white hover:bg-brand-blue-dark disabled:opacity-60"
            >
              {busy && (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              )}
              {busy
                ? t('quizReadAloud.extracting', 'Extracting…')
                : t('quizReadAloud.extract', 'Extract text')}
            </button>
            <button
              type="button"
              onClick={clear}
              {...tourTypeAttr('quiz-stimuli.read-aloud-clear', 'quiz')}
              disabled={busy || !text}
              className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              {t('quizReadAloud.clear', 'Clear')}
            </button>
            <span className="text-xs text-slate-500">
              {t(
                'quizReadAloud.readingHelp',
                'Leave empty on reading assessments.'
              )}
            </span>
          </div>
          {notice && (
            <p role="status" className="text-xs text-amber-700">
              {notice === 'needs-manual'
                ? t(
                    'quizReadAloud.needsManual',
                    "Couldn't extract text automatically. Paste or type it here."
                  )
                : t(
                    'quizReadAloud.extractFailed',
                    'Text extraction failed. Try again.'
                  )}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

const StimulusCard: React.FC<{
  stimulus: QuizStimulus;
  index: number;
  state: StimulusListState;
  attach: QuizEditorController | null;
  readAloudAvailable: boolean;
}> = ({ stimulus: s, index, state, attach, readAloudAvailable }) => {
  const { updateStimulus, deleteStimulus } = state;
  const questions = attach?.questions ?? [];
  const bankSlots = attach?.bankSlots ?? [];
  const tourType = useContext(StimulusTourTypeContext);
  const [open, setOpen] = useState(false);
  const covered = questionsUsingStimulus(questions, s.id);
  const coveredSlots = bankSlots.filter((slot) =>
    slot.stimulusIds?.includes(s.id)
  );
  const targetCount = questions.length + bankSlots.length;
  const coveredCount = covered.length + coveredSlots.length;
  const allAttached = targetCount > 0 && coveredCount === targetCount;

  return (
    <div className="bg-white border border-slate-200 rounded-lg">
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={open ? 'Collapse stimulus' : 'Expand stimulus'}
          {...tourFieldAttr(
            'quiz-stimuli.card-expand',
            tourType,
            String(index)
          )}
          className="text-slate-400 hover:text-slate-600 p-0.5"
        >
          {open ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </button>
        <span
          className={`shrink-0 px-1.5 py-0.5 rounded-sm text-xxs font-bold uppercase tracking-wider ${TYPE_BADGE[s.type]}`}
        >
          {STIMULUS_TYPE_LABELS[s.type]}
        </span>
        <input
          type="text"
          value={s.label}
          onChange={(e) => updateStimulus(s.id, { label: e.target.value })}
          placeholder="Label (only you see this)"
          {...tourFieldAttr('quiz-stimuli.card-label', tourType, String(index))}
          className="flex-1 min-w-0 bg-transparent border-0 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-hidden"
        />
        {attach && (
          <span className="shrink-0 text-xxs text-slate-400 tabular-nums">
            {coveredCount === 0
              ? 'unassigned'
              : allAttached
                ? 'all questions'
                : [
                    covered.length > 0 &&
                      `${covered.length} question${covered.length === 1 ? '' : 's'}`,
                    coveredSlots.length > 0 &&
                      `${coveredSlots.length} bank draw${coveredSlots.length === 1 ? '' : 's'}`,
                  ]
                    .filter(Boolean)
                    .join(', ')}
          </span>
        )}
        <button
          type="button"
          onClick={() => deleteStimulus(s.id)}
          aria-label="Delete stimulus"
          {...tourFieldAttr(
            'quiz-stimuli.card-delete',
            tourType,
            String(index)
          )}
          className="text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-sm p-1 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      {open && (
        <div className="px-3 pb-3 pt-1 border-t border-slate-100 space-y-3">
          {s.type === 'text' ? (
            <div>
              <label className={labelClass} htmlFor={`passage-${s.id}`}>
                Passage
              </label>
              <textarea
                id={`passage-${s.id}`}
                {...tourFieldAttr(
                  'quiz-stimuli.passage-text',
                  tourType,
                  String(index)
                )}
                value={s.text ?? ''}
                onChange={(e) => updateStimulus(s.id, { text: e.target.value })}
                rows={6}
                placeholder="Paste or type the passage students will read."
                className="w-full px-2.5 py-2 border-2 border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-hidden focus:border-brand-blue-primary/50"
              />
            </div>
          ) : s.type === 'word-bank' ? (
            <div>
              <label className={labelClass} htmlFor={`wordbank-${s.id}`}>
                Word bank
              </label>
              <textarea
                id={`wordbank-${s.id}`}
                {...tourFieldAttr(
                  'quiz-stimuli.word-bank-text',
                  tourType,
                  String(index)
                )}
                value={s.text ?? ''}
                onChange={(e) => updateStimulus(s.id, { text: e.target.value })}
                rows={10}
                placeholder="Put each word or phrase on its own line."
                className="w-full px-2.5 py-2 border-2 border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-hidden focus:border-brand-blue-primary/50"
              />
              <p className="mt-1 text-xs text-slate-500">
                Each line is one choice. Students tap a choice to add it to
                their answer.
              </p>
              <div className="mt-3 flex items-center gap-3">
                <span className={`${labelClass} mb-0`}>Columns</span>
                <div
                  role="radiogroup"
                  aria-label="Columns"
                  {...tourFieldAttr(
                    'quiz-stimuli.word-bank-columns',
                    tourType,
                    String(index)
                  )}
                  className="inline-flex rounded-lg border border-slate-300 overflow-hidden"
                >
                  {([1, 2, 3] as const).map((n) => {
                    const on = (s.wordBankColumns ?? 1) === n;
                    return (
                      <button
                        // no-tour-anchor: the group carries quiz-stimuli.word-bank-columns
                        key={n}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() =>
                          updateStimulus(s.id, { wordBankColumns: n })
                        }
                        className={`min-w-[44px] px-3 py-1.5 text-sm font-bold border-l border-slate-300 first:border-l-0 ${on ? 'bg-brand-blue-primary text-white' : 'bg-white text-slate-700 hover:bg-slate-50'}`}
                      >
                        {n}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : s.type === 'calculator' ? null : (
            <p className="text-xs text-slate-500 break-all">
              <Link2 className="w-3 h-3 inline mr-1" aria-hidden />
              {s.url}
            </p>
          )}
          {s.type === 'gdoc-embed' && !s.driveFileId && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
              Share this doc as &ldquo;Anyone with the link can view.&rdquo;
            </p>
          )}
          <StimulusTabFields
            stimulus={s}
            index={index}
            onChange={(updates) => updateStimulus(s.id, updates)}
          />
          {readAloudAvailable && (s.type === 'image' || s.type === 'pdf') && (
            <ReadAloudTextRow
              stimulus={s}
              onChange={(updates) => updateStimulus(s.id, updates)}
            />
          )}
          {isPlayLimitedType(s.type) && (
            <div>
              <label className={labelClass}>Play limit (per attempt)</label>
              <input
                type="number"
                min={0}
                max={20}
                value={s.playLimit ?? ''}
                onChange={(e) => {
                  const raw = parseInt(e.target.value, 10);
                  updateStimulus(s.id, {
                    playLimit:
                      Number.isFinite(raw) && raw > 0
                        ? Math.min(20, raw)
                        : undefined,
                  });
                }}
                placeholder="Unlimited"
                {...tourFieldAttr(
                  'quiz-stimuli.play-limit',
                  tourType,
                  String(index)
                )}
                className={`${inputClass} max-w-[140px]`}
              />
            </div>
          )}
          {attach && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className={labelClass.replace('mb-1', 'mb-0')}>
                  Shown on
                </span>
                {targetCount > 0 && (
                  <label className="flex items-center gap-1.5 text-xs font-bold text-slate-600 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={allAttached}
                      {...tourFieldAttr(
                        'quiz-stimuli.attach-all-questions',
                        'quiz',
                        String(index)
                      )}
                      onChange={(e) =>
                        attach.setStimulusOnAllQuestions(s.id, e.target.checked)
                      }
                      className="w-3.5 h-3.5 accent-brand-blue-primary"
                    />
                    All questions
                  </label>
                )}
              </div>
              {targetCount === 0 ? (
                <p className="text-xs text-slate-400">No questions yet.</p>
              ) : (
                <ul className="space-y-1 max-h-48 overflow-y-auto custom-scrollbar">
                  {questions.map((q, i) => (
                    <li key={q.id}>
                      <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none rounded-sm px-1.5 py-1 hover:bg-slate-50">
                        <input
                          type="checkbox"
                          checked={q.stimulusIds?.includes(s.id) ?? false}
                          onChange={() =>
                            attach.toggleStimulusOnQuestion(s.id, q.id)
                          }
                          {...tourFieldAttr(
                            'quiz-stimuli.attach-question',
                            'quiz',
                            `${index}-${i + 1}`
                          )}
                          className="w-3.5 h-3.5 accent-brand-blue-primary"
                        />
                        <span className="font-mono font-bold text-slate-400 w-6 shrink-0">
                          Q{i + 1}
                        </span>
                        <span className="truncate">
                          {q.text || (
                            <span className="italic text-slate-400">
                              Untitled question
                            </span>
                          )}
                        </span>
                      </label>
                    </li>
                  ))}
                  {bankSlots.map((slot, slotIndex) => (
                    <li key={slot.id}>
                      <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none rounded-sm px-1.5 py-1 hover:bg-slate-50">
                        <input
                          type="checkbox"
                          checked={slot.stimulusIds?.includes(s.id) ?? false}
                          onChange={() =>
                            attach.toggleStimulusOnSlot(s.id, slot.id)
                          }
                          {...tourFieldAttr(
                            'quiz-stimuli.attach-bank-slot',
                            'quiz',
                            `${index}-${slotIndex + 1}`
                          )}
                          className="w-3.5 h-3.5 accent-brand-blue-primary"
                        />
                        <Shuffle
                          className="w-3.5 h-3.5 text-slate-400 shrink-0"
                          aria-label="Random from bank"
                        />
                        <span className="truncate">
                          {slot.bankTitle} ({slot.count ?? 0} drawn)
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Per-question attach section (detail pane) ──────────────────────────────

export const QuestionStimulusSection: React.FC<{
  state: QuizEditorController;
  questionId: string;
  /** `quiz-calculator-stimulus` gate. */
  calculatorAvailable?: boolean;
  /** Attaches an image pasted inside this element to the question; absent turns pasting off. */
  pasteScopeRef?: React.RefObject<HTMLElement | null>;
  /** `question-editor-fields`: a row of the light metadata list. */
  metaList?: boolean;
  /** `quiz-stimulus-picker`: attach in a list-and-preview dialog. */
  pickerModal?: boolean;
}> = ({
  state,
  questionId,
  calculatorAvailable = false,
  pasteScopeRef,
  metaList = false,
  pickerModal = false,
}) => {
  const question = state.questions.find((q) => q.id === questionId);
  return (
    <AttachStimulusSection
      state={state}
      attachedIds={question?.stimulusIds}
      calculatorAvailable={calculatorAvailable}
      pasteScopeRef={pasteScopeRef}
      metaList={metaList}
      pickerModal={pickerModal}
      ownerNoun="question"
      ownerLabel={`Q${state.questions.findIndex((q) => q.id === questionId) + 1}`}
      ownerId={questionId}
      onToggle={(stimulusId) =>
        state.toggleStimulusOnQuestion(stimulusId, questionId)
      }
    />
  );
};

/** Attach section for a random bank slot: stimuli shown with every drawn question. */
export const SlotStimulusSection: React.FC<{
  state: QuizEditorController;
  slotId: string;
  calculatorAvailable?: boolean;
  metaList?: boolean;
  pickerModal?: boolean;
}> = ({
  state,
  slotId,
  calculatorAvailable = false,
  metaList = false,
  pickerModal = false,
}) => {
  const slot = state.bankSlots.find((s) => s.id === slotId);
  return (
    <AttachStimulusSection
      state={state}
      attachedIds={slot?.stimulusIds}
      calculatorAvailable={calculatorAvailable}
      metaList={metaList}
      pickerModal={pickerModal}
      ownerNoun="bank"
      ownerLabel={slot?.bankTitle ?? 'bank'}
      ownerId={slotId}
      onToggle={(stimulusId) => state.toggleStimulusOnSlot(stimulusId, slotId)}
    />
  );
};

const AttachStimulusSection: React.FC<{
  state: QuizEditorController;
  attachedIds: string[] | undefined;
  calculatorAvailable: boolean;
  pasteScopeRef?: React.RefObject<HTMLElement | null>;
  /** The question or slot shown; a change closes the open preview. */
  ownerId?: string;
  metaList?: boolean;
  pickerModal?: boolean;
  ownerNoun: 'question' | 'bank';
  ownerLabel: string;
  onToggle: (stimulusId: string) => void;
}> = ({
  state,
  attachedIds,
  calculatorAvailable,
  pasteScopeRef,
  ownerId,
  metaList = false,
  pickerModal = false,
  ownerNoun,
  ownerLabel,
  onToggle,
}) => {
  const { stimuli, questions, bankSlots } = state;
  const intake = useStimulusIntake(state);
  const { addFromFile } = intake;
  const [pickerSelectedId, setPickerSelectedId] = useState(PICKER_ADD);
  const onPastedFiles = useCallback(
    (files: File[]) =>
      void addFiles(
        addFromFile,
        files.filter((f) => f.type.startsWith('image/')),
        (s) => {
          onToggle(s.id);
          setPickerSelectedId(s.id);
        }
      ),
    [addFromFile, onToggle]
  );
  const [open, setOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const fieldId = useId();
  const onPasted = useCallback(
    (files: File[]) => {
      if (!pickerModal) setOpen(true);
      onPastedFiles(files);
    },
    [onPastedFiles, pickerModal]
  );
  usePasteFiles(
    onPasted,
    intake.busy || !pasteScopeRef,
    pasteScopeRef,
    isImageFile
  );
  const drop = useFilesDrop((files) => {
    if (!pickerModal) setOpen(true);
    void addFiles(addFromFile, files, (s) => {
      onToggle(s.id);
      setPickerSelectedId(s.id);
    });
  }, intake.busy);
  const attachedCount = attachedIds?.length ?? 0;
  const [previewId, setPreviewId] = useState<string | null>(null);
  const rowIdPrefix = useId();
  const [previewOwner, setPreviewOwner] = useState(ownerId);
  if (previewOwner !== ownerId) {
    setPreviewOwner(ownerId);
    setPreviewId(null);
  }
  // Collapsed, the header names what is attached instead of only counting it.
  const attachedNames = stimuli
    .filter((s) => attachedIds?.includes(s.id))
    .map((s) =>
      pickerModal ? stimulusPickerTitle(s, stimuli) : stimulusDisplayName(s)
    )
    .join(pickerModal ? '; ' : ', ');
  const summary =
    drop.dragging && !open
      ? 'Drop it here'
      : attachedCount > 0
        ? attachedNames && (!open || pickerModal)
          ? attachedNames
          : `${attachedCount} attached`
        : stimuli.length === 0
          ? 'No stimuli yet'
          : 'None attached';

  const onAdded = setPickerSelectedId;
  const addArea = (inPicker: boolean) => (
    <>
      <div
        className={`flex flex-col items-center gap-2 rounded-lg border border-dashed px-2.5 py-2.5 ${
          drop.dragging ? 'border-brand-blue-primary' : 'border-slate-300'
        }`}
      >
        <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
          {intake.busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <Upload className="h-3.5 w-3.5" aria-hidden />
          )}
          {drop.dragging
            ? 'Drop it here'
            : pasteScopeRef && !inPicker
              ? 'Drag a file or paste an image'
              : 'Drag a file'}
        </span>
        <div className="flex flex-wrap justify-center gap-2">
          <FileSourceButtons
            compact
            intake={intake}
            onAdded={(added) => {
              onToggle(added.id);
              onAdded(added.id);
            }}
          />
          {calculatorAvailable && (
            <button
              type="button"
              onClick={() => {
                const added = intake.addCalculator();
                onToggle(added.id);
                onAdded(added.id);
              }}
              disabled={intake.busy}
              {...tourTypeAttr('quiz-stimuli.attach-calculator', 'quiz')}
              className={fileButtonClass}
            >
              <Calculator className="h-3.5 w-3.5" aria-hidden />
              Calculator
            </button>
          )}
        </div>
      </div>
      <UrlAddRow
        busy={intake.busy}
        onAdd={async (url) => {
          const added = await intake.addFromUrl(url);
          if (added) {
            onToggle(added.id);
            onAdded(added.id);
          }
        }}
      />
    </>
  );

  const panel = (
    <>
      {stimuli.length > 0 && (
        <ul className="space-y-1">
          {stimuli.map((s, stimulusIndex) => {
            const usedOn = [
              ...questionsUsingStimulus(questions, s.id).map(
                (i) => `Q${i + 1}`
              ),
              ...bankSlots
                .filter((slot) => slot.stimulusIds?.includes(s.id))
                .map((slot) => slot.bankTitle),
            ];
            const previewing = previewId === s.id;
            const name = stimulusDisplayName(s);
            const checkboxId = `${rowIdPrefix}-attach-${s.id}`;
            const checkbox = (
              <input
                id={checkboxId}
                type="checkbox"
                checked={attachedIds?.includes(s.id) ?? false}
                onChange={() => onToggle(s.id)}
                {...tourFieldAttr(
                  'quiz-stimuli.attach-stimulus',
                  'quiz',
                  String(stimulusIndex + 1)
                )}
                className="w-3.5 h-3.5 accent-brand-blue-primary"
              />
            );
            const badge = (
              <span
                className={`shrink-0 px-1.5 py-0.5 rounded-sm text-xxs font-bold uppercase tracking-wider ${TYPE_BADGE[s.type]}`}
              >
                {STIMULUS_TYPE_LABELS[s.type]}
              </span>
            );
            const usedOnText =
              usedOn.length > 0 ? `on ${usedOn.join(', ')}` : 'unused';
            const previewDomId = `attach-preview-${s.id}`;
            return (
              <li key={s.id}>
                <div className="flex items-center gap-1 rounded-sm px-1.5 hover:bg-slate-50 text-xs text-slate-700">
                  <label className="flex min-w-0 items-center gap-2 cursor-pointer select-none py-1">
                    {checkbox}
                    {badge}
                    <span className="truncate">{name}</span>
                  </label>
                  {s.type !== 'calculator' && (
                    <button
                      type="button"
                      onClick={() =>
                        setPreviewId((id) => (id === s.id ? null : s.id))
                      }
                      aria-expanded={previewing}
                      aria-controls={previewing ? previewDomId : undefined}
                      aria-label={
                        previewing ? `Hide ${name}` : `Preview ${name}`
                      }
                      title={previewing ? 'Hide preview' : 'Preview'}
                      {...tourFieldAttr(
                        'quiz-stimuli.attach-preview',
                        'quiz',
                        String(stimulusIndex + 1)
                      )}
                      className={`shrink-0 rounded-sm p-1 transition-colors touch-target-expand ${
                        previewing
                          ? 'text-brand-blue-primary bg-brand-blue-lighter'
                          : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {previewing ? (
                        <EyeOff className="w-3.5 h-3.5" aria-hidden />
                      ) : (
                        <Eye className="w-3.5 h-3.5" aria-hidden />
                      )}
                    </button>
                  )}
                  <label
                    htmlFor={checkboxId}
                    className="flex-1 min-w-[25%] self-stretch flex items-center justify-end cursor-pointer select-none py-1 text-right text-xxs text-slate-400 tabular-nums"
                  >
                    <span className="truncate">{usedOnText}</span>
                  </label>
                </div>
                {previewing && (
                  <div
                    id={previewDomId}
                    data-testid="attach-stimulus-preview"
                    className="mt-1 mb-2 ml-6 max-h-[60vh] overflow-y-auto custom-scrollbar pb-2"
                  >
                    <StimulusRenderer
                      stimulus={s}
                      light
                      enforcePlayLimit={false}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {addArea(false)}
    </>
  );

  const openPicker = () => {
    setPickerSelectedId(initialPickerSelection(stimuli, attachedIds));
    setPickerOpen(true);
  };
  const usedOn = (stimulusId: string) => [
    ...questionsUsingStimulus(questions, stimulusId).map((i) => `Q${i + 1}`),
    ...bankSlots
      .filter((slot) => slot.stimulusIds?.includes(stimulusId))
      .map((slot) => slot.bankTitle),
  ];
  const picker = pickerOpen && (
    <StimulusPickerModal
      stimuli={stimuli}
      attachedIds={attachedIds}
      ownerNoun={ownerNoun}
      ownerLabel={ownerLabel}
      usedOn={usedOn}
      onToggle={onToggle}
      selectedId={pickerSelectedId}
      onSelect={setPickerSelectedId}
      addArea={addArea(true)}
      onClose={() => setPickerOpen(false)}
    />
  );

  if (metaList && pickerModal) {
    return (
      <div
        {...drop.dropProps}
        data-testid="question-stimulus-drop-zone"
        className={`rounded-sm ${drop.dragging ? 'bg-brand-blue-lighter' : ''}`}
      >
        <MetaItem label="Stimuli" htmlFor={fieldId}>
          <button
            id={fieldId}
            type="button"
            onClick={openPicker}
            aria-haspopup="dialog"
            aria-describedby={`${fieldId}-value`}
            {...tourTypeAttr('quiz-stimuli.attach-toggle', 'quiz')}
            className={`${metaValueClass} max-w-full py-1`}
          >
            <span
              id={`${fieldId}-value`}
              className={`min-w-0 break-words ${attachedCount > 0 ? '' : 'text-slate-400'}`}
            >
              {summary}
            </span>
            <ChevronRight
              className="h-3.5 w-3.5 shrink-0 text-slate-400"
              aria-hidden
            />
          </button>
        </MetaItem>
        {picker}
      </div>
    );
  }

  if (metaList) {
    return (
      <div
        {...drop.dropProps}
        data-testid="question-stimulus-drop-zone"
        className={`rounded-sm ${drop.dragging ? 'bg-brand-blue-lighter' : ''}`}
      >
        <MetaItem label="Stimuli" htmlFor={fieldId}>
          <button
            id={fieldId}
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-describedby={`${fieldId}-value`}
            {...tourTypeAttr('quiz-stimuli.attach-toggle', 'quiz')}
            className={`${metaValueClass} max-w-full`}
          >
            <span
              id={`${fieldId}-value`}
              className={`min-w-0 truncate tabular-nums ${attachedCount > 0 ? '' : 'text-slate-400'}`}
            >
              {summary}
            </span>
            <MetaChevron open={open} />
          </button>
        </MetaItem>
        {open && <div className="space-y-2 pb-3 pt-1">{panel}</div>}
      </div>
    );
  }

  return (
    <div
      {...drop.dropProps}
      data-testid="question-stimulus-drop-zone"
      className={`border rounded-lg transition-colors ${
        drop.dragging
          ? 'border-brand-blue-primary bg-brand-blue-lighter'
          : 'border-slate-200 bg-white'
      }`}
    >
      <button
        type="button"
        onClick={pickerModal ? openPicker : () => setOpen((o) => !o)}
        aria-expanded={pickerModal ? undefined : open}
        aria-haspopup={pickerModal ? 'dialog' : undefined}
        {...tourTypeAttr('quiz-stimuli.attach-toggle', 'quiz')}
        className="w-full flex items-center gap-2 px-3 py-2 text-left"
      >
        {open && !pickerModal ? (
          <ChevronDown className="w-4 h-4 text-slate-400" />
        ) : (
          <ChevronRight className="w-4 h-4 text-slate-400" />
        )}
        <Paperclip className="w-3.5 h-3.5 text-slate-500" aria-hidden />
        <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
          Stimuli
        </span>
        <span
          className={`min-w-0 text-xs text-slate-400 tabular-nums ${pickerModal ? 'break-words' : 'truncate'}`}
        >
          {summary}
        </span>
      </button>
      {picker}
      {open && !pickerModal && (
        <div className="px-3 pb-3 space-y-2 border-t border-slate-100 pt-2">
          {panel}
        </div>
      )}
    </div>
  );
};
