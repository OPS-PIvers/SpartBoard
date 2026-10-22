import React, {
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react';
import type { GuidedLearningSet, GuidedLearningStep } from '@/types';
import { Modal } from '@/components/common/Modal';
import { DashboardContext } from '@/context/DashboardContextValue';
import { useAuth } from '@/context/useAuth';
import { useDialog } from '@/context/useDialog';
import { tourAttr } from '@/config/tourAnchors';
import { logError } from '@/utils/logError';
import {
  buildNameMatcher,
  type NameMatcher,
} from '@/components/widgets/GuidedLearning/components/recorder/redaction';
import {
  deleteWebTourDraft,
  loadWebTourPicture,
  publishWebTour,
  saveWebTourDraft,
  uploadWebTourPicture,
} from '@/components/tours/webTours';
import { isHardHit } from './studentData';
import { pictureBlob, toWebStep } from './recordedSteps';
import type { RecordedWebStep } from './recorderProtocol';
import { useWebTourRecorder, type RecorderLink } from './useWebTourRecorder';
import {
  assertPublishable,
  clearStepCheck,
  hideHits,
  isStepChecked,
  markStepChecked,
  publishBlockers,
  reviewEntries,
  setReviewField,
  type ReviewEntry,
  type ReviewField,
} from './webStepReview';

const SAVE_DELAY_MS = 800;

const FIELD_LABEL: Record<string, string> = {
  label: 'Step title',
  text: 'Tip',
  url: 'Page address',
  role: 'Control type',
  name: 'Control name',
  pageText: 'Text on the control',
  css: 'Page position',
};

const fieldLabel = (field: ReviewField) =>
  field.startsWith('frame:')
    ? `Frame address ${Number(field.slice(6)) + 1}`
    : FIELD_LABEL[field];

// Clues playback can do without; the address, title and tip stay.
const REMOVABLE: ReadonlySet<ReviewField> = new Set([
  'role',
  'name',
  'pageText',
  'css',
]);

const LINK_COPY: Record<RecorderLink, string> = {
  off: '',
  connecting: 'Connecting to the SpartBoard extension...',
  connected:
    'Recorder ready. On the website, open the SpartBoard extension, press Record and click through. Steps you send appear here.',
  unavailable:
    "The SpartBoard extension isn't installed, or Chrome isn't signed in with your Orono staff account.",
};

const Highlighted: React.FC<{ entry: ReviewEntry }> = ({ entry }) => {
  const parts: React.ReactNode[] = [];
  let at = 0;
  entry.hits.forEach((hit, i) => {
    parts.push(entry.value.slice(at, hit.start));
    parts.push(
      <mark
        key={i}
        className={isHardHit(hit) ? 'bg-red-100 text-red-900' : 'bg-amber-100'}
      >
        {entry.value.slice(hit.start, hit.end)}
      </mark>
    );
    at = hit.end;
  });
  parts.push(entry.value.slice(at));
  return <span className="break-all">{parts}</span>;
};

const WebStepPicture: React.FC<{ path: string; label: string }> = ({
  path,
  label,
}) => {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let made: string | null = null;
    let cancelled = false;
    void loadWebTourPicture(path)
      .then((bytes) => {
        if (cancelled) return;
        made = URL.createObjectURL(new Blob([bytes]));
        setUrl(made);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
      if (made) URL.revokeObjectURL(made);
    };
  }, [path]);
  if (failed)
    return (
      <p className="text-xs text-slate-500">Picture couldn&apos;t load.</p>
    );
  return url ? (
    <img
      src={url}
      alt={label}
      className="w-full max-w-md rounded-md border border-slate-200"
    />
  ) : null;
};

const StepRow: React.FC<{
  step: GuidedLearningStep;
  index: number;
  count: number;
  matcher: NameMatcher | null;
  uid: string;
  onChange: (step: GuidedLearningStep) => void;
  onMove: (by: -1 | 1) => void;
  onDelete: () => void;
}> = ({ step, index, count, matcher, uid, onChange, onMove, onDelete }) => {
  const entries = reviewEntries(step, matcher);
  const checked = isStepChecked(step);
  const blocked = entries.some((e) => e.hits.some(isHardHit));
  const edit = (field: ReviewField, value: string | undefined) =>
    onChange(setReviewField(step, field, value));
  return (
    <li className="flex flex-col gap-2 py-4">
      <div className="flex items-center gap-2">
        <span className="font-semibold text-slate-900">Step {index + 1}</span>
        <span className="flex-1" />
        {/* no-tour-anchor: per-step controls repeat on every step */}
        <button
          type="button"
          className="rounded p-1 text-slate-600 hover:bg-slate-100 disabled:opacity-40"
          aria-label="Move step up"
          disabled={index === 0}
          onClick={() => onMove(-1)}
        >
          <ArrowUp className="h-4 w-4" />
        </button>
        {/* no-tour-anchor: per-step controls repeat on every step */}
        <button
          type="button"
          className="rounded p-1 text-slate-600 hover:bg-slate-100 disabled:opacity-40"
          aria-label="Move step down"
          disabled={index === count - 1}
          onClick={() => onMove(1)}
        >
          <ArrowDown className="h-4 w-4" />
        </button>
        {/* no-tour-anchor: per-step controls repeat on every step */}
        <button
          type="button"
          className="rounded p-1 text-slate-600 hover:bg-slate-100"
          aria-label="Delete step"
          onClick={onDelete}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-slate-600">Step title</span>
        {/* no-tour-anchor: per-step controls repeat on every step */}
        <input
          className="rounded-md border border-slate-300 px-2 py-1"
          value={step.label ?? ''}
          onChange={(e) => edit('label', e.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-slate-600">Tip</span>
        {/* no-tour-anchor: per-step controls repeat on every step */}
        <textarea
          className="rounded-md border border-slate-300 px-2 py-1"
          rows={2}
          value={step.text ?? ''}
          onChange={(e) => edit('text', e.target.value)}
        />
      </label>
      {step.web?.picture ? (
        <div className="flex flex-col items-start gap-1">
          <WebStepPicture
            path={step.web.picture.path}
            label={`Picture for step ${index + 1}`}
          />
          {/* no-tour-anchor: per-step controls repeat on every step */}
          <button
            type="button"
            className="text-xs text-slate-600 underline hover:text-slate-900"
            onClick={() => {
              if (!step.web) return;
              const { picture: _picture, ...web } = step.web;
              onChange({ ...step, web });
            }}
          >
            Remove picture
          </button>
        </div>
      ) : (
        <p className="text-xs text-slate-500">No picture</p>
      )}
      <dl className="flex flex-col divide-y divide-slate-100 text-xs">
        {entries
          .filter((e) => e.field !== 'label' && e.field !== 'text')
          .map((entry) => (
            <div key={entry.field} className="flex items-start gap-2 py-1.5">
              <dt className="w-32 shrink-0 text-slate-500">
                {fieldLabel(entry.field)}
              </dt>
              <dd className="min-w-0 flex-1 text-slate-800">
                <Highlighted entry={entry} />
              </dd>
              {entry.hits.length > 0 && (
                // no-tour-anchor: per-field controls repeat on every step
                <button
                  type="button"
                  className="shrink-0 text-slate-700 underline"
                  onClick={() => edit(entry.field, hideHits(entry))}
                >
                  Hide highlighted
                </button>
              )}
              {REMOVABLE.has(entry.field) && (
                // no-tour-anchor: per-field controls repeat on every step
                <button
                  type="button"
                  className="shrink-0 text-slate-700 underline"
                  onClick={() => edit(entry.field, undefined)}
                >
                  Remove
                </button>
              )}
            </div>
          ))}
      </dl>
      {entries.some((e) => e.hits.length > 0 && !e.hits.some(isHardHit)) && (
        <p className="text-xs text-amber-800">
          Highlighted text might be a name. Hide it if it is.
        </p>
      )}
      {blocked && (
        <p className="text-xs text-red-800">
          Hide the highlighted student data before publishing.
        </p>
      )}
      <label className="flex items-center gap-2 text-sm">
        {/* no-tour-anchor: per-step controls repeat on every step */}
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) =>
            onChange(
              e.target.checked
                ? markStepChecked(step, uid)
                : clearStepCheck(step)
            )
          }
        />
        I checked this step&apos;s picture, text and page address for student
        data
      </label>
    </li>
  );
};

/** Edits a web tour draft: recorded steps, wording, order, student-data review and publishing. */
export const WebTourEditor: React.FC<{
  initial: GuidedLearningSet;
  onClose: () => void;
}> = ({ initial, onClose }) => {
  const { user } = useAuth();
  const uid = user?.uid ?? '';
  const { showConfirm } = useDialog();
  const rosters = useContext(DashboardContext)?.rosters;
  const matcher = useMemo(
    () => buildNameMatcher((rosters ?? []).flatMap((r) => r.students)),
    [rosters]
  );
  const [set, setSet] = useState<GuidedLearningSet>(initial);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const latest = useRef(set);
  const dirty = useRef(false);
  const publishing = useRef(false);
  const deleted = useRef(false);

  useLayoutEffect(() => {
    latest.current = set;
  }, [set]);

  // Built on the latest set, so a step the recorder just added is never overwritten.
  const change = (update: (s: GuidedLearningSet) => GuidedLearningSet) => {
    const next = update(latest.current);
    latest.current = next;
    dirty.current = true;
    setSet(next);
  };

  // Debounced draft save while the admin edits.
  useEffect(() => {
    if (!dirty.current) return;
    const timer = setTimeout(() => {
      if (deleted.current) return;
      dirty.current = false;
      void saveWebTourDraft(set).catch((err: unknown) => {
        logError('web tour draft save', err, { setId: set.id });
        setStatus("Changes couldn't be saved. Check your connection.");
      });
    }, SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [set]);

  // Closing the editor mid-delay still saves the last change.
  useEffect(
    () => () => {
      if (!dirty.current || deleted.current) return;
      dirty.current = false;
      void saveWebTourDraft(latest.current).catch((err: unknown) =>
        logError('web tour draft save', err, { setId: latest.current.id })
      );
    },
    []
  );

  const onStep = useCallback(async (recorded: RecordedWebStep) => {
    if (publishing.current) throw new Error('Publishing; the step is re-sent');
    const current = latest.current;
    // A re-sent step is already here but its save may have failed, so save again before the ack.
    if (current.steps.some((s) => s.id === recorded.id)) {
      if (deleted.current) throw new Error('Tour deleted');
      await saveWebTourDraft(current);
      return;
    }
    let picture;
    const blob = recorded.picture
      ? pictureBlob(recorded.picture.dataUrl)
      : null;
    if (blob && recorded.picture) {
      const path = await uploadWebTourPicture(current.id, blob, 'image/jpeg');
      picture = { path, w: recorded.picture.w, h: recorded.picture.h };
    }
    // A step that lands after Delete must not re-create the draft.
    if (deleted.current) throw new Error('Tour deleted');
    const next = {
      ...latest.current,
      steps: [...latest.current.steps, toWebStep(recorded, picture)],
    };
    latest.current = next;
    setSet(next);
    await saveWebTourDraft(next);
  }, []);

  const recorder = useWebTourRecorder({
    setId: set.id,
    title: set.title,
    onStep,
  });

  const blockers = publishBlockers(set, matcher);
  const unchecked = blockers.filter((b) => b.kind === 'unchecked').length;
  const flagged = new Set(
    blockers.flatMap((b) => (b.kind === 'student-data' ? [b.stepId] : []))
  ).size;

  const updateStep = (id: string, step: GuidedLearningStep) =>
    change((cur) => ({
      ...cur,
      steps: cur.steps.map((s) => (s.id === id ? step : s)),
    }));

  const moveStep = (id: string, by: -1 | 1) =>
    change((cur) => {
      const steps = [...cur.steps];
      const i = steps.findIndex((s) => s.id === id);
      const to = i + by;
      if (i < 0 || to < 0 || to >= steps.length) return cur;
      const [moved] = steps.splice(i, 1);
      steps.splice(to, 0, moved);
      return { ...cur, steps };
    });

  const publish = async () => {
    if (!uid) return;
    setBusy(true);
    setStatus('');
    // Recorded steps wait (unacknowledged) until publishing is done.
    publishing.current = true;
    try {
      dirty.current = false;
      await saveWebTourDraft(latest.current);
      // The gate runs on the draft publishing reads, so nothing saved since slips through.
      await publishWebTour(set.id, uid, (draft) =>
        assertPublishable(draft, matcher)
      );
      setStatus('Published. Staff can open this tour from its link.');
    } catch (err) {
      logError('web tour publish', err, { setId: set.id });
      setStatus("The tour couldn't be published.");
    } finally {
      publishing.current = false;
      setBusy(false);
    }
  };

  const remove = async () => {
    const ok = await showConfirm(
      'This deletes the web tour, its pictures and its published copy.',
      { title: 'Delete web tour', variant: 'danger', confirmLabel: 'Delete' }
    );
    if (!ok) return;
    recorder.disconnect();
    deleted.current = true;
    dirty.current = false;
    try {
      await deleteWebTourDraft(set.id);
    } catch (err) {
      deleted.current = false;
      logError('web tour delete', err, { setId: set.id });
      setStatus("The tour couldn't be deleted.");
      return;
    }
    onClose();
  };

  const footer = (
    <div className="flex w-full flex-wrap items-center gap-3">
      <button
        type="button"
        className="text-sm text-red-700 underline"
        onClick={() => void remove()}
        {...tourAttr('web-tour-editor.delete')}
      >
        Delete web tour
      </button>
      <span className="flex-1 text-sm text-slate-600" role="status">
        {status ||
          (set.steps.length === 0
            ? 'Record steps to start.'
            : flagged > 0
              ? `${flagged} ${flagged === 1 ? 'step has' : 'steps have'} student data to hide.`
              : unchecked > 0
                ? `Check ${unchecked} more ${unchecked === 1 ? 'step' : 'steps'} for student data to publish.`
                : '')}
      </span>
      <button
        type="button"
        disabled={busy || blockers.length > 0}
        className="rounded-md bg-blue-700 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
        onClick={() => void publish()}
        {...tourAttr('web-tour-editor.publish')}
      >
        Publish tour
      </button>
    </div>
  );

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Web tour"
      maxWidth="max-w-3xl"
      footer={footer}
      tourScope="web-tour"
    >
      <div className="flex flex-col gap-3 pb-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600">Title</span>
          <input
            className="rounded-md border border-slate-300 px-2 py-1"
            value={set.title}
            onChange={(e) => {
              const title = e.target.value;
              change((cur) => ({ ...cur, title }));
            }}
            {...tourAttr('web-tour-editor.title')}
          />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            onClick={
              recorder.link === 'connected'
                ? recorder.disconnect
                : recorder.connect
            }
            {...tourAttr('web-tour-editor.record')}
          >
            {recorder.link === 'connected'
              ? 'Stop receiving steps'
              : 'Record steps'}
          </button>
          {LINK_COPY[recorder.link] && (
            <p className="min-w-0 flex-1 text-sm text-slate-600">
              {LINK_COPY[recorder.link]}
            </p>
          )}
        </div>
        {!matcher && (
          <p role="note" className="text-sm text-amber-800">
            No class rosters are loaded, so student names can&apos;t be found
            automatically. Check every picture and line of text yourself.
          </p>
        )}
        <ol className="flex flex-col divide-y divide-slate-200">
          {set.steps.map((step, i) => (
            <StepRow
              key={step.id}
              step={step}
              index={i}
              count={set.steps.length}
              matcher={matcher}
              uid={uid}
              onChange={(s) => updateStep(step.id, s)}
              onMove={(by) => moveStep(step.id, by)}
              onDelete={() =>
                change((cur) => ({
                  ...cur,
                  steps: cur.steps.filter((s) => s.id !== step.id),
                }))
              }
            />
          ))}
        </ol>
      </div>
    </Modal>
  );
};
