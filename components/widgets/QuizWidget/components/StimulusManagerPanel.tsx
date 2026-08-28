/**
 * Quiz-level stimulus management for the quiz editor, plus the compact
 * per-question attach section used in the detail pane. Both entry points
 * operate on the same `stimuli` array owned by `useQuizEditorState`.
 *
 * Sources: device upload (teacher's Drive), Drive/any URL paste. Uploaded
 * and Drive-pasted files require link-viewable sharing so anonymous
 * students can load them — the teacher is prompted to confirm on every
 * attach (never auto-shared silently).
 */
import React, { useCallback, useRef, useState } from 'react';
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Link2,
  Loader2,
  Paperclip,
  Trash2,
  Upload,
} from 'lucide-react';
import type { QuizStimulus, QuizStimulusType } from '@/types';
import {
  STIMULUS_TYPE_LABELS,
  detectStimulusTypeFromFile,
  detectStimulusTypeFromUrl,
  isPlayLimitedType,
  questionsUsingStimulus,
} from '@/utils/quizStimuli';
import { extractGoogleFileId } from '@/utils/urlHelpers';
import { useGoogleDrive } from '@/hooks/useGoogleDrive';
import { useDialog } from '@/context/useDialog';
import type { QuizEditorController } from './useQuizEditorState';

const labelClass =
  'block text-slate-600 font-bold uppercase tracking-wider mb-1 text-xs';
const inputClass =
  'w-full bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40 focus:border-brand-blue-primary px-3 py-2 text-sm';

const TYPE_BADGE: Record<QuizStimulusType, string> = {
  image: 'bg-emerald-100 text-emerald-700',
  pdf: 'bg-red-100 text-red-700',
  audio: 'bg-amber-100 text-amber-800',
  video: 'bg-blue-100 text-blue-700',
  youtube: 'bg-rose-100 text-rose-700',
  'gdoc-embed': 'bg-indigo-100 text-indigo-700',
};

/** Accept list for the device-upload input. */
const STIMULUS_ACCEPT = 'image/*,audio/*,video/*,application/pdf,.pdf';

/** Max upload size — matches the GL video ceiling. */
const MAX_STIMULUS_BYTES = 200 * 1024 * 1024;

/**
 * Shared intake used by both entry points. Returns the created stimulus
 * or null when the teacher declined the sharing prompt / an error hit.
 */
function useStimulusIntake(state: QuizEditorController) {
  const { driveService, userDomain } = useGoogleDrive();
  const { showConfirm, showAlert } = useDialog();
  const [busy, setBusy] = useState(false);

  const confirmShare = useCallback(
    async (what: string): Promise<boolean> =>
      showConfirm(
        `Students open stimuli without a Google sign-in, so "${what}" must be shared as "anyone with the link can view." Update its sharing now?`,
        { title: 'Share with students?', confirmLabel: 'Share & attach' }
      ),
    [showConfirm]
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
        const shared = await confirmShare(file.name);
        if (!shared) {
          // Attach cancelled — remove the just-uploaded orphan.
          await driveService.deleteFile(driveFile.id).catch(() => undefined);
          return null;
        }
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
    [driveService, confirmShare, showAlert, state]
  );

  const addFromUrl = useCallback(
    async (rawUrl: string): Promise<QuizStimulus | null> => {
      const url = rawUrl.trim();
      if (!url) return null;
      const type = detectStimulusTypeFromUrl(url);
      const driveFileId =
        /(?:drive|docs)\.google\.com\//.test(url) && type !== 'gdoc-embed'
          ? (extractGoogleFileId(url) ?? undefined)
          : undefined;
      setBusy(true);
      try {
        if (driveFileId && driveService) {
          const shared = await confirmShare('this Drive file');
          if (!shared) return null;
          try {
            await driveService.makePublic(driveFileId, undefined);
          } catch {
            await showAlert(
              "Couldn't update sharing (you may not own this file). Make sure it's set to \"anyone with the link\" in Drive, or students won't see it.",
              { variant: 'warning' }
            );
          }
        }
        const stimulus: QuizStimulus = {
          id: crypto.randomUUID(),
          type,
          url,
          ...(driveFileId ? { driveFileId } : {}),
          label: url.replace(/^https?:\/\//, '').slice(0, 60),
        };
        state.addStimulus(stimulus);
        return stimulus;
      } finally {
        setBusy(false);
      }
    },
    [driveService, confirmShare, showAlert, state]
  );

  // userDomain intentionally unused today: stimulus sharing is always
  // type:'anyone' (anonymous students), never domain-scoped.
  void userDomain;

  return { addFromFile, addFromUrl, busy };
}

const UrlAddRow: React.FC<{
  onAdd: (url: string) => Promise<unknown>;
  busy: boolean;
  compact?: boolean;
}> = ({ onAdd, busy, compact = false }) => {
  const [url, setUrl] = useState('');
  const submit = async () => {
    if (!url.trim()) return;
    await onAdd(url);
    setUrl('');
  };
  return (
    <div className="flex gap-2">
      <input
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            void submit();
          }
        }}
        placeholder={
          compact ? 'Paste a URL…' : 'Paste an image, YouTube, Doc, or PDF URL…'
        }
        className={inputClass}
        disabled={busy}
      />
      <button
        type="button"
        onClick={() => void submit()}
        disabled={busy || !url.trim()}
        className="shrink-0 flex items-center gap-1 px-3 py-2 bg-brand-blue-primary hover:bg-brand-blue-dark disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-colors"
      >
        {busy ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Link2 className="w-3.5 h-3.5" />
        )}
        Add
      </button>
    </div>
  );
};

// ─── Quiz-level panel (editor "Stimuli" tab) ────────────────────────────────

export const StimulusManagerPanel: React.FC<{
  state: QuizEditorController;
}> = ({ state }) => {
  const { stimuli, questions } = state;
  const intake = useStimulusIntake(state);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar bg-slate-50 px-5 py-4 space-y-4">
      <div className="flex gap-2 p-2.5 bg-brand-blue-primary text-white rounded-lg shadow-sm">
        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
        <p className="text-xs">
          Stimuli are images, PDFs, audio, video, YouTube, or Doc/Slides embeds
          students see while answering. Attach one to a single question, a group
          of questions, or the whole quiz. Grouped questions stay together when
          question shuffle is on.
        </p>
      </div>

      <div className="space-y-2">
        <input
          ref={fileInputRef}
          type="file"
          accept={STIMULUS_ACCEPT}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void intake.addFromFile(file);
          }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={intake.busy}
          className="w-full flex items-center justify-center gap-1.5 py-2.5 border-2 border-dashed border-slate-300 hover:border-brand-blue-primary/40 hover:bg-slate-100 rounded-lg text-slate-600 hover:text-brand-blue-primary font-bold transition-all text-xs disabled:opacity-50"
        >
          {intake.busy ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Upload className="w-4 h-4" />
          )}
          Upload to your Drive
        </button>
        <UrlAddRow onAdd={intake.addFromUrl} busy={intake.busy} />
      </div>

      {stimuli.length === 0 ? (
        <div className="text-center text-slate-500 text-sm py-6 border-2 border-dashed border-slate-300 rounded-lg bg-white">
          No stimuli yet. Upload a file or paste a URL to get started.
        </div>
      ) : (
        <div className="space-y-2">
          {stimuli.map((s) => (
            <StimulusCard key={s.id} stimulus={s} state={state} />
          ))}
        </div>
      )}
      {questions.length === 0 && stimuli.length > 0 && (
        <p className="text-xs text-slate-500">
          Add questions to assign these stimuli.
        </p>
      )}
    </div>
  );
};

const StimulusCard: React.FC<{
  stimulus: QuizStimulus;
  state: QuizEditorController;
}> = ({ stimulus: s, state }) => {
  const {
    questions,
    updateStimulus,
    deleteStimulus,
    toggleStimulusOnQuestion,
    setStimulusOnAllQuestions,
  } = state;
  const [open, setOpen] = useState(false);
  const covered = questionsUsingStimulus(questions, s.id);
  const allAttached =
    questions.length > 0 && covered.length === questions.length;

  return (
    <div className="bg-white border border-slate-200 rounded-lg">
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={open ? 'Collapse stimulus' : 'Expand stimulus'}
          className="text-slate-400 hover:text-slate-600 p-0.5"
        >
          {open ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </button>
        <span
          className={`shrink-0 px-1.5 py-0.5 rounded text-xxs font-bold uppercase tracking-wider ${TYPE_BADGE[s.type]}`}
        >
          {STIMULUS_TYPE_LABELS[s.type]}
        </span>
        <input
          type="text"
          value={s.label}
          onChange={(e) => updateStimulus(s.id, { label: e.target.value })}
          placeholder="Label (only you see this)"
          className="flex-1 min-w-0 bg-transparent border-0 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none"
        />
        <span className="shrink-0 text-xxs text-slate-400 tabular-nums">
          {covered.length === 0
            ? 'unassigned'
            : allAttached
              ? 'all questions'
              : `${covered.length} question${covered.length === 1 ? '' : 's'}`}
        </span>
        <button
          type="button"
          onClick={() => deleteStimulus(s.id)}
          aria-label="Delete stimulus"
          className="text-slate-300 hover:text-red-500 hover:bg-red-50 rounded p-1 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      {open && (
        <div className="px-3 pb-3 pt-1 border-t border-slate-100 space-y-3">
          <p className="text-xs text-slate-500 break-all">
            <Link2 className="w-3 h-3 inline mr-1" aria-hidden />
            {s.url}
          </p>
          {s.type === 'gdoc-embed' && !s.driveFileId && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
              Make sure this doc is shared as &ldquo;anyone with the link can
              view&rdquo; — SpartBoard can&apos;t verify pasted doc links.
            </p>
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
                className={`${inputClass} max-w-[140px]`}
              />
            </div>
          )}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className={labelClass.replace('mb-1', 'mb-0')}>
                Shown on
              </span>
              {questions.length > 0 && (
                <label className="flex items-center gap-1.5 text-xs font-bold text-slate-600 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={allAttached}
                    onChange={(e) =>
                      setStimulusOnAllQuestions(s.id, e.target.checked)
                    }
                    className="w-3.5 h-3.5 accent-brand-blue-primary"
                  />
                  All questions
                </label>
              )}
            </div>
            {questions.length === 0 ? (
              <p className="text-xs text-slate-400">No questions yet.</p>
            ) : (
              <ul className="space-y-1 max-h-48 overflow-y-auto custom-scrollbar">
                {questions.map((q, i) => (
                  <li key={q.id}>
                    <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none rounded px-1.5 py-1 hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={q.stimulusIds?.includes(s.id) ?? false}
                        onChange={() => toggleStimulusOnQuestion(s.id, q.id)}
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
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Per-question attach section (detail pane) ──────────────────────────────

export const QuestionStimulusSection: React.FC<{
  state: QuizEditorController;
  questionId: string;
}> = ({ state, questionId }) => {
  const { stimuli, questions, toggleStimulusOnQuestion } = state;
  const intake = useStimulusIntake(state);
  const [open, setOpen] = useState(false);
  const question = questions.find((q) => q.id === questionId);
  const attachedCount = question?.stimulusIds?.length ?? 0;

  return (
    <div className="border border-slate-200 rounded-lg bg-white">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-3 py-2 text-left"
      >
        {open ? (
          <ChevronDown className="w-4 h-4 text-slate-400" />
        ) : (
          <ChevronRight className="w-4 h-4 text-slate-400" />
        )}
        <Paperclip className="w-3.5 h-3.5 text-slate-500" aria-hidden />
        <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
          Stimuli
        </span>
        <span className="text-xs text-slate-400 tabular-nums">
          {attachedCount > 0 ? `${attachedCount} attached` : 'none'}
        </span>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2 border-t border-slate-100 pt-2">
          {stimuli.length === 0 ? (
            <p className="text-xs text-slate-500">
              No stimuli in this quiz yet. Add one below, or manage the full
              list in the <strong>Stimuli</strong> tab.
            </p>
          ) : (
            <ul className="space-y-1">
              {stimuli.map((s) => {
                const covered = questionsUsingStimulus(questions, s.id);
                return (
                  <li key={s.id}>
                    <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none rounded px-1.5 py-1 hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={question?.stimulusIds?.includes(s.id) ?? false}
                        onChange={() =>
                          toggleStimulusOnQuestion(s.id, questionId)
                        }
                        className="w-3.5 h-3.5 accent-brand-blue-primary"
                      />
                      <span
                        className={`shrink-0 px-1.5 py-0.5 rounded text-xxs font-bold uppercase tracking-wider ${TYPE_BADGE[s.type]}`}
                      >
                        {STIMULUS_TYPE_LABELS[s.type]}
                      </span>
                      <span className="flex-1 truncate">
                        {s.label || s.url}
                      </span>
                      <span className="shrink-0 text-xxs text-slate-400 tabular-nums">
                        {covered.length > 0
                          ? `on ${covered.map((i) => `Q${i + 1}`).join(', ')}`
                          : 'unused'}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          <UrlAddRow
            compact
            busy={intake.busy}
            onAdd={async (url) => {
              const added = await intake.addFromUrl(url);
              if (added) toggleStimulusOnQuestion(added.id, questionId);
            }}
          />
        </div>
      )}
    </div>
  );
};
