import React, {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ArrowDown,
  ArrowUp,
  Check,
  Droplets,
  Globe,
  ImageOff,
  Link2,
  Loader2,
  MapPin,
  Play,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import type {
  GuidedLearningSet,
  GuidedLearningStep,
  WebTourAction,
} from '@/types';
import { Modal } from '@/components/common/Modal';
import { DashboardContext } from '@/context/DashboardContextValue';
import { useAuth } from '@/context/useAuth';
import { useDialog } from '@/context/useDialog';
import { tourAttr } from '@/config/tourAnchors';
import { logError } from '@/utils/logError';
import {
  inputLight,
  primaryBtn,
  secondaryBtn,
  iconBtn,
  warnChip,
} from '@/components/common/lightChrome';
import {
  buildNameMatcher,
  type NameMatcher,
} from '@/components/widgets/GuidedLearning/components/recorder/redaction';
import {
  redactImage,
  type RedactRect,
} from '@/components/widgets/GuidedLearning/utils/redactImage';
import {
  deleteWebTourDraft,
  loadWebTourPicture,
  publishWebTour,
  saveWebTourDraft,
  uploadWebTourPicture,
  type WebTourPictureType,
} from '@/components/tours/webTours';
import { usePublishedTour } from '@/components/tours/publishedTours';
import { isWebTourSet } from '@/components/widgets/GuidedLearning/utils/liveTour';
import { isHardHit } from './studentData';
import { pictureBlob, toWebStep } from './recordedSteps';
import type { RecordedWebStep } from './recorderProtocol';
import { useWebTourRecorder, type RecorderLink } from './useWebTourRecorder';
import { BlobImage, BlurBoxes } from './BlurBoxes';
import { buildTourUrl } from './tourLinks';
import { useCopyWebTourLink } from './useCopyWebTourLink';
import { pageUrlOf, type HubStep } from './webTourHub';
import { pingExtension, REPICK_PROTOCOL } from './extensionClient';
import {
  assertPublishable,
  confirmPictures,
  hideHits,
  hideStudentData,
  needsFixOnSite,
  picturesNeedConfirm,
  publishBlockers,
  reviewEntries,
  setReviewField,
  type HiddenText,
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

const ACTION_LABEL: Record<WebTourAction, string> = {
  observe: 'Look',
  click: 'Click',
  type: 'Type',
  select: 'Choose',
};

const LINK_COPY: Record<RecorderLink, string> = {
  off: '',
  connecting: 'Connecting to the SpartBoard extension...',
  connected:
    'Recorder ready. On the website, open the SpartBoard extension, press Record and click through. Steps you send appear here.',
  unavailable:
    "The SpartBoard extension isn't installed, or Chrome isn't signed in with your Orono staff account.",
};

const PICTURE_TYPES: readonly string[] = [
  'image/png',
  'image/jpeg',
  'image/webp',
];

type WebStep = GuidedLearningStep & {
  web?: NonNullable<GuidedLearningStep['web']>;
};

// One download per picture while the editor is open, shared by the list, the preview and the publish check.
const PictureCache = createContext<Map<string, Promise<Blob>> | null>(null);

function usePictureBlob(path: string | undefined): {
  blob: Blob | null;
  failed: boolean;
} {
  const cache = useContext(PictureCache);
  const [state, setState] = useState<{
    path?: string;
    blob: Blob | null;
    failed: boolean;
  }>({ blob: null, failed: false });
  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    let pending = cache?.get(path);
    if (!pending) {
      pending = loadWebTourPicture(path).then((bytes) => new Blob([bytes]));
      cache?.set(path, pending);
    }
    pending
      .then((blob) => !cancelled && setState({ path, blob, failed: false }))
      .catch(() => {
        cache?.delete(path);
        if (!cancelled) setState({ path, blob: null, failed: true });
      });
    return () => {
      cancelled = true;
    };
  }, [cache, path]);
  return state.path === path && path ? state : { blob: null, failed: false };
}

const WebStepPicture: React.FC<{
  path: string | undefined;
  label: string;
  className: string;
}> = ({ path, label, className }) => {
  const { blob, failed } = usePictureBlob(path);
  if (!path || failed)
    return (
      <div
        className={`${className} flex items-center justify-center bg-slate-100 text-slate-400`}
        role="img"
        aria-label={failed ? "Picture couldn't load." : 'No picture'}
      >
        <ImageOff className="h-5 w-5" aria-hidden="true" />
      </div>
    );
  return blob ? (
    <BlobImage
      blob={blob}
      alt={label}
      className={`${className} object-contain`}
    />
  ) : (
    <div className={`${className} animate-pulse bg-slate-100`} />
  );
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

/** Whether the list flags the step: a weak target, or student data in its text. */
const stepWarning = (
  step: WebStep,
  matcher: NameMatcher | null
): string | null =>
  reviewEntries(step, matcher).some((e) => e.hits.some(isHardHit))
    ? 'Student data'
    : needsFixOnSite(step)
      ? 'Needs checking'
      : null;

const StepList: React.FC<{
  steps: WebStep[];
  selected: string | null;
  matcher: NameMatcher | null;
  onSelect: (id: string) => void;
}> = ({ steps, selected, matcher, onSelect }) => (
  <ol className="flex flex-col gap-1">
    {steps.map((step, i) => {
      const warning = stepWarning(step, matcher);
      const active = step.id === selected;
      return (
        <li key={step.id}>
          {/* no-tour-anchor: one row per recorded step */}
          <button
            type="button"
            aria-current={active ? 'step' : undefined}
            onClick={() => onSelect(step.id)}
            className={`flex w-full items-center gap-2 rounded-lg p-1.5 text-left ${
              active
                ? 'bg-brand-blue-lighter ring-1 ring-brand-blue-primary/40'
                : 'hover:bg-slate-100'
            }`}
          >
            <span className="w-5 shrink-0 text-right text-xs font-semibold text-slate-500">
              {i + 1}
            </span>
            <WebStepPicture
              path={step.web?.picture?.path}
              label=""
              className="h-10 w-16 shrink-0 rounded-md border border-slate-200"
            />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-semibold text-slate-900">
                {step.label?.trim() ? step.label : `Step ${i + 1}`}
              </span>
              {warning && (
                <span className={`${warnChip} mt-0.5 w-fit text-[11px]`}>
                  <TriangleAlert className="h-3 w-3" aria-hidden="true" />
                  {warning}
                </span>
              )}
            </span>
          </button>
        </li>
      );
    })}
  </ol>
);

const BlurEditor: React.FC<{
  path: string;
  index: number;
  onApply: (blob: Blob) => Promise<void>;
  onCancel: () => void;
}> = ({ path, index, onApply, onCancel }) => {
  const { blob } = usePictureBlob(path);
  const [boxes, setBoxes] = useState<RedactRect[]>([]);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const apply = async () => {
    if (!blob || boxes.length === 0) return;
    setBusy(true);
    setFailed(false);
    try {
      await onApply(await redactImage(blob, boxes, { mode: 'blur' }));
    } catch (err) {
      logError('web tour blur', err);
      setFailed(true);
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-2">
      {blob ? (
        <BlurBoxes
          picture={blob}
          boxes={boxes}
          onChange={setBoxes}
          label={`Picture for step ${index + 1}. Drag across what to blur.`}
        />
      ) : (
        <div className="h-48 animate-pulse rounded-lg bg-slate-100" />
      )}
      <div className="flex items-center gap-2">
        {/* no-tour-anchor: per-step controls repeat on every step */}
        <button
          type="button"
          className={primaryBtn}
          disabled={busy || boxes.length === 0}
          onClick={() => void apply()}
        >
          {busy ? 'Blurring...' : 'Apply blur'}
        </button>
        {/* no-tour-anchor: per-step controls repeat on every step */}
        <button type="button" className={secondaryBtn} onClick={onCancel}>
          Cancel
        </button>
        {failed && (
          <span className="text-sm text-red-700">
            The blur couldn&apos;t be saved.
          </span>
        )}
      </div>
    </div>
  );
};

const StepDetail: React.FC<{
  step: WebStep;
  index: number;
  count: number;
  matcher: NameMatcher | null;
  blurring: boolean;
  canFix: boolean;
  onChange: (step: WebStep) => void;
  onMove: (by: -1 | 1) => void;
  onDelete: () => void;
  onBlur: (on: boolean) => void;
  onBlurred: (blob: Blob) => Promise<void>;
  onFix: () => void;
}> = ({
  step,
  index,
  count,
  matcher,
  blurring,
  canFix,
  onChange,
  onMove,
  onDelete,
  onBlur,
  onBlurred,
  onFix,
}) => {
  const entries = reviewEntries(step, matcher);
  const blocked = entries.some((e) => e.hits.some(isHardHit));
  const edit = (field: ReviewField, value: string | undefined) =>
    onChange(setReviewField(step, field, value));
  const picture = step.web?.picture;
  const clues = entries.filter(
    (e) => e.field !== 'label' && e.field !== 'text'
  );
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-1">
        <h3 className="flex-1 text-base font-semibold text-slate-900">
          Step {index + 1}
        </h3>
        {/* no-tour-anchor: per-step controls repeat on every step */}
        <button
          type="button"
          className={iconBtn}
          aria-label="Move step up"
          disabled={index === 0}
          onClick={() => onMove(-1)}
        >
          <ArrowUp className="h-4 w-4" />
        </button>
        {/* no-tour-anchor: per-step controls repeat on every step */}
        <button
          type="button"
          className={iconBtn}
          aria-label="Move step down"
          disabled={index === count - 1}
          onClick={() => onMove(1)}
        >
          <ArrowDown className="h-4 w-4" />
        </button>
        {/* no-tour-anchor: per-step controls repeat on every step */}
        <button
          type="button"
          className={iconBtn}
          aria-label="Delete step"
          onClick={onDelete}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {blurring && picture ? (
        <BlurEditor
          path={picture.path}
          index={index}
          onApply={onBlurred}
          onCancel={() => onBlur(false)}
        />
      ) : (
        <div className="flex flex-col gap-2">
          <WebStepPicture
            path={picture?.path}
            label={`Picture for step ${index + 1}`}
            className="h-72 w-full rounded-lg border border-slate-200 bg-slate-50"
          />
          {picture && (
            <div className="flex items-center gap-2">
              {/* no-tour-anchor: per-step controls repeat on every step */}
              <button
                type="button"
                className={secondaryBtn}
                onClick={() => onBlur(true)}
              >
                <span className="inline-flex items-center gap-1.5">
                  <Droplets className="h-4 w-4" aria-hidden="true" />
                  Blur
                </span>
              </button>
              {/* no-tour-anchor: per-step controls repeat on every step */}
              <button
                type="button"
                className={secondaryBtn}
                onClick={() => {
                  if (!step.web) return;
                  const { picture: _picture, ...web } = step.web;
                  onChange({ ...step, web });
                }}
              >
                Remove picture
              </button>
            </div>
          )}
        </div>
      )}

      {needsFixOnSite(step) && (
        <div className="flex items-center gap-3 rounded-lg bg-amber-50 px-3 py-2">
          <TriangleAlert
            className="h-4 w-4 shrink-0 text-amber-700"
            aria-hidden="true"
          />
          <span className="flex-1 text-sm text-amber-900">
            This step may not find its target on the site.
          </span>
          {/* no-tour-anchor: per-step controls repeat on every step */}
          <button
            type="button"
            className={`${primaryBtn} disabled:cursor-not-allowed disabled:opacity-50`}
            disabled={!canFix}
            title={
              canFix
                ? undefined
                : 'Needs a newer SpartBoard extension in this Chrome profile.'
            }
            onClick={onFix}
          >
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-4 w-4" aria-hidden="true" />
              Fix on site
            </span>
          </button>
        </div>
      )}

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-semibold text-slate-700">Step title</span>
        {/* no-tour-anchor: per-step controls repeat on every step */}
        <input
          className={`${inputLight} rounded-lg px-2.5 py-1.5`}
          value={step.label ?? ''}
          onChange={(e) => edit('label', e.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-semibold text-slate-700">Tip</span>
        {/* no-tour-anchor: per-step controls repeat on every step */}
        <textarea
          className={`${inputLight} rounded-lg px-2.5 py-1.5`}
          rows={3}
          value={step.text ?? ''}
          onChange={(e) => edit('text', e.target.value)}
        />
      </label>
      {step.web && (
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold text-slate-700">Step type</span>
          {/* no-tour-anchor: per-step controls repeat on every step */}
          <select
            className={`${inputLight} w-48 rounded-lg px-2.5 py-1.5`}
            value={step.web.action}
            onChange={(e) =>
              step.web &&
              onChange({
                ...step,
                web: { ...step.web, action: e.target.value as WebTourAction },
              })
            }
          >
            {(Object.keys(ACTION_LABEL) as WebTourAction[]).map((a) => (
              <option key={a} value={a}>
                {ACTION_LABEL[a]}
              </option>
            ))}
          </select>
        </label>
      )}

      {blocked && (
        <p className="text-sm text-red-800">
          Publish hides the highlighted student data.
        </p>
      )}
      {clues.length > 0 && (
        <details className="rounded-lg border border-slate-200 px-3 py-2 text-xs">
          <summary className="cursor-pointer text-sm font-semibold text-slate-700">
            How the step finds its target
          </summary>
          <dl className="mt-1 flex flex-col divide-y divide-slate-100">
            {clues.map((entry) => (
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
                    className="shrink-0 font-semibold text-brand-blue-primary hover:underline"
                    onClick={() => edit(entry.field, hideHits(entry))}
                  >
                    Hide highlighted
                  </button>
                )}
                {REMOVABLE.has(entry.field) && (
                  // no-tour-anchor: per-field controls repeat on every step
                  <button
                    type="button"
                    className="shrink-0 font-semibold text-brand-blue-primary hover:underline"
                    onClick={() => edit(entry.field, undefined)}
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </dl>
        </details>
      )}
    </div>
  );
};

const hiddenWhere = (h: HiddenText) =>
  h.step === null ? 'Title' : `Step ${h.step + 1}, ${fieldLabel(h.field)}`;

/** The one check before publishing: what the text scan hid, and every picture. */
const PublishCheck: React.FC<{
  set: GuidedLearningSet;
  hidden: HiddenText[];
  askPictures: boolean;
  onPublish: () => void;
  onBlur: () => void;
  onCancel: () => void;
}> = ({ set, hidden, askPictures, onPublish, onBlur, onCancel }) => {
  const pictured = (set.steps as WebStep[]).flatMap((s, i) =>
    s.web?.picture ? [{ path: s.web.picture.path, index: i }] : []
  );
  return (
    <Modal
      isOpen
      onClose={onCancel}
      title="Before you publish"
      maxWidth="max-w-3xl"
      zIndex="z-modal-deep"
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          {askPictures && (
            // no-tour-anchor: inside the one-off publish check
            <button type="button" className={secondaryBtn} onClick={onBlur}>
              Blur
            </button>
          )}
          {/* no-tour-anchor: inside the one-off publish check */}
          <button type="button" className={primaryBtn} onClick={onPublish}>
            Publish
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-4 pb-2">
        {hidden.length > 0 && (
          <section className="flex flex-col gap-1">
            <h3 className="text-sm font-semibold text-slate-900">
              Student data hidden
            </h3>
            <ul className="flex flex-col gap-1 text-sm">
              {hidden.map((h, i) => (
                <li key={i} className="flex gap-2">
                  <span className="w-40 shrink-0 text-slate-500">
                    {hiddenWhere(h)}
                  </span>
                  <span className="min-w-0 break-all text-slate-800">
                    {h.after}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {askPictures && (
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-slate-900">
              Anything private in these pictures?
            </h3>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {pictured.map((p) => (
                <WebStepPicture
                  key={p.path}
                  path={p.path}
                  label={`Picture for step ${p.index + 1}`}
                  className="h-32 w-48 shrink-0 rounded-lg border border-slate-200"
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </Modal>
  );
};

const PublishState: React.FC<{
  loaded: boolean;
  live: { publishedAt: number } | null;
  editedAt: number;
}> = ({ loaded, live, editedAt }) => {
  if (!loaded) return null;
  const label = !live
    ? 'Draft'
    : editedAt > live.publishedAt
      ? 'Changed since publish'
      : 'Published';
  const tone = !live
    ? 'bg-slate-100 text-slate-700'
    : label === 'Published'
      ? 'bg-emerald-100 text-emerald-800'
      : 'bg-amber-100 text-amber-800';
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${tone}`}
    >
      {label}
    </span>
  );
};

/** Edits a web tour draft: a step list with pictures, each step's wording and target, and one check at publish. */
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
  const pictureCache = useMemo(() => new Map<string, Promise<Blob>>(), []);
  const [set, setSet] = useState<GuidedLearningSet>(initial);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(
    initial.steps[0]?.id ?? null
  );
  const [blurring, setBlurring] = useState(false);
  const [editedAt, setEditedAt] = useState(initial.updatedAt ?? 0);
  const [check, setCheck] = useState<{
    hidden: HiddenText[];
    askPictures: boolean;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [canFix, setCanFix] = useState(false);
  const copyLink = useCopyWebTourLink();
  const published = usePublishedTour(initial.id);
  const live =
    published.tour && isWebTourSet(published.tour.set) ? published.tour : null;
  const latest = useRef(set);
  const dirty = useRef(false);
  const publishing = useRef(false);
  const deleted = useRef(false);

  useLayoutEffect(() => {
    latest.current = set;
  }, [set]);

  useEffect(() => {
    let cancelled = false;
    void pingExtension().then((s) => {
      if (!cancelled)
        setCanFix(s.kind === 'ready' && s.protocol >= REPICK_PROTOCOL);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Built on the latest set, so a step the recorder just added is never overwritten.
  const change = (update: (s: GuidedLearningSet) => GuidedLearningSet) => {
    const next = update(latest.current);
    latest.current = next;
    dirty.current = true;
    setEditedAt(Date.now());
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

  const uploadRecorded = async (recorded: RecordedWebStep, setId: string) => {
    const blob = recorded.picture
      ? pictureBlob(recorded.picture.dataUrl)
      : null;
    if (!blob || !recorded.picture) return undefined;
    const path = await uploadWebTourPicture(setId, blob, 'image/jpeg');
    return { path, w: recorded.picture.w, h: recorded.picture.h };
  };

  const saveNow = async (next: GuidedLearningSet) => {
    latest.current = next;
    setSet(next);
    setEditedAt(Date.now());
    await saveWebTourDraft(next);
  };

  const onStep = async (recorded: RecordedWebStep) => {
    if (publishing.current) throw new Error('Publishing; the step is re-sent');
    const current = latest.current;
    // A re-sent step is already here but its save may have failed, so save again before the ack.
    if (current.steps.some((s) => s.id === recorded.id)) {
      if (deleted.current) throw new Error('Tour deleted');
      await saveWebTourDraft(current);
      return;
    }
    const picture = await uploadRecorded(recorded, current.id);
    // A step that lands after Delete must not re-create the draft.
    if (deleted.current) throw new Error('Tour deleted');
    await saveNow({
      ...latest.current,
      steps: [...latest.current.steps, toWebStep(recorded, picture)],
    });
    setSelectedId((id) => id ?? recorded.id);
  };

  // Fix on site: the new target and picture replace the step's; its title and tip stay.
  const onRepicked = async (recorded: RecordedWebStep) => {
    if (publishing.current) throw new Error('Publishing; the step is re-sent');
    const index = latest.current.steps.findIndex((s) => s.id === recorded.id);
    const target = latest.current.steps[index];
    if (!target?.web) return;
    const picture = await uploadRecorded(recorded, latest.current.id);
    if (deleted.current) throw new Error('Tour deleted');
    const web = {
      ...target.web,
      urlPattern: recorded.urlPattern,
      locator: recorded.locator,
      ...(picture ? { picture } : {}),
    };
    await saveNow({
      ...latest.current,
      steps: latest.current.steps.map((s) =>
        s.id === recorded.id ? { ...s, web } : s
      ),
    });
    setStatus(`Step ${index + 1} was fixed.`);
  };

  const recorder = useWebTourRecorder({
    setId: set.id,
    title: set.title,
    onStep,
    onRepicked,
  });

  const steps = set.steps as WebStep[];
  const selectedIndex = steps.findIndex((s) => s.id === selectedId);
  const selected = selectedIndex >= 0 ? steps[selectedIndex] : steps[0];
  const blockers = publishBlockers(set, matcher).filter(
    (b) => b.kind !== 'student-data' && b.kind !== 'title-data'
  );

  const updateStep = (id: string, step: GuidedLearningStep) =>
    change((cur) => ({
      ...cur,
      steps: cur.steps.map((s) => (s.id === id ? step : s)),
    }));

  const moveStep = (id: string, by: -1 | 1) =>
    change((cur) => {
      const next = [...cur.steps];
      const i = next.findIndex((s) => s.id === id);
      const to = i + by;
      if (i < 0 || to < 0 || to >= next.length) return cur;
      const [moved] = next.splice(i, 1);
      next.splice(to, 0, moved);
      return { ...cur, steps: next };
    });

  const deleteStep = (id: string) => {
    const i = steps.findIndex((s) => s.id === id);
    const nextSelected = steps[i + 1]?.id ?? steps[i - 1]?.id ?? null;
    setBlurring(false);
    setSelectedId(nextSelected);
    change((cur) => ({
      ...cur,
      steps: cur.steps.filter((s) => s.id !== id),
    }));
  };

  const applyBlur = async (stepId: string, blob: Blob) => {
    const type = (
      PICTURE_TYPES.includes(blob.type) ? blob.type : 'image/png'
    ) as WebTourPictureType;
    const path = await uploadWebTourPicture(latest.current.id, blob, type);
    const cur = latest.current;
    dirty.current = false;
    await saveNow({
      ...cur,
      steps: cur.steps.map((s) =>
        s.id === stepId && s.web?.picture
          ? { ...s, web: { ...s.web, picture: { ...s.web.picture, path } } }
          : s
      ),
    });
    setBlurring(false);
  };

  const fixOnSite = (step: WebStep, index: number) => {
    const url = step.web ? pageUrlOf([step as HubStep], 0) : null;
    recorder.repick(step.id);
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
    setStatus(`Click the right control on the site to fix step ${index + 1}.`);
  };

  const doPublish = async (toPublish: GuidedLearningSet) => {
    if (!uid) return;
    setCheck(null);
    setBusy(true);
    setStatus('');
    // Recorded steps wait (unacknowledged) until publishing is done.
    publishing.current = true;
    try {
      dirty.current = false;
      await saveNow(toPublish);
      // The gate runs on the draft publishing reads, so nothing saved since slips through.
      await publishWebTour(toPublish.id, uid, (draft) =>
        assertPublishable(draft, matcher)
      );
      setStatus('Published.');
    } catch (err) {
      logError('web tour publish', err, { setId: toPublish.id });
      setStatus("The tour couldn't be published.");
    } finally {
      publishing.current = false;
      setBusy(false);
    }
  };

  const publish = () => {
    const { set: scrubbed, hidden } = hideStudentData(latest.current, matcher);
    if (hidden.length > 0) change(() => scrubbed);
    const askPictures = picturesNeedConfirm(scrubbed);
    if (hidden.length === 0 && !askPictures) {
      void doPublish(scrubbed);
      return;
    }
    setCheck({ hidden, askPictures });
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

  const copy = async () => {
    if (await copyLink(set.id, set.title)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    }
  };

  const header = (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <Globe className="h-5 w-5 shrink-0 text-slate-500" aria-hidden="true" />
      <input
        aria-label="Title"
        className={`${inputLight} min-w-0 flex-1 rounded-lg px-2.5 py-1.5 text-base font-semibold`}
        value={set.title}
        onChange={(e) => {
          const title = e.target.value;
          change((cur) => ({ ...cur, title }));
        }}
        {...tourAttr('web-tour-editor.title')}
      />
      <PublishState loaded={published.loaded} live={live} editedAt={editedAt} />
      <button
        type="button"
        disabled={!live}
        className={`${secondaryBtn} inline-flex shrink-0 items-center gap-1.5 disabled:opacity-40`}
        onClick={() =>
          window.open(buildTourUrl(set.id), '_blank', 'noopener,noreferrer')
        }
        {...tourAttr('web-tour-editor.play')}
      >
        <Play className="h-4 w-4" aria-hidden="true" />
        Play
      </button>
      <button
        type="button"
        className={`${secondaryBtn} inline-flex shrink-0 items-center gap-1.5`}
        onClick={() => void copy()}
        {...tourAttr('web-tour-editor.copy-link')}
      >
        {copied ? (
          <Check className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Link2 className="h-4 w-4" aria-hidden="true" />
        )}
        {copied ? 'Link copied' : 'Copy link'}
      </button>
    </div>
  );

  const footer = (
    <div className="flex w-full flex-wrap items-center gap-3">
      <button
        type="button"
        className="text-sm font-semibold text-red-700 hover:underline"
        onClick={() => void remove()}
        {...tourAttr('web-tour-editor.delete')}
      >
        Delete web tour
      </button>
      <span className="flex-1 text-sm text-slate-600" role="status">
        {status}
      </span>
      <button
        type="button"
        disabled={busy || blockers.length > 0}
        className={`${primaryBtn} inline-flex items-center gap-1.5 disabled:opacity-50`}
        onClick={publish}
        {...tourAttr('web-tour-editor.publish')}
      >
        {busy && (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        )}
        Publish tour
      </button>
    </div>
  );

  return (
    <PictureCache.Provider value={pictureCache}>
      <Modal
        isOpen
        onClose={onClose}
        customHeader={header}
        ariaLabel="Web tour"
        maxWidth="max-w-6xl"
        footer={footer}
        tourScope="web-tour"
      >
        <div className="grid min-h-[60vh] grid-cols-[17rem_minmax(0,1fr)] gap-5 pb-4">
          <aside className="flex min-h-0 flex-col gap-3 border-r border-slate-200 pr-4">
            <button
              type="button"
              className={`${secondaryBtn} border border-slate-300`}
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
              <p className="text-xs text-slate-600">
                {LINK_COPY[recorder.link]}
              </p>
            )}
            {!matcher && (
              <p role="note" className="text-xs text-amber-800">
                No class rosters are loaded, so student names can&apos;t be
                found automatically.
              </p>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto pb-2">
              <StepList
                steps={steps}
                selected={selected?.id ?? null}
                matcher={matcher}
                onSelect={(id) => {
                  setBlurring(false);
                  setSelectedId(id);
                }}
              />
            </div>
          </aside>
          <section className="min-w-0">
            {selected ? (
              <StepDetail
                key={selected.id}
                step={selected}
                index={steps.indexOf(selected)}
                count={steps.length}
                matcher={matcher}
                blurring={blurring}
                canFix={canFix}
                onChange={(s) => updateStep(selected.id, s)}
                onMove={(by) => moveStep(selected.id, by)}
                onDelete={() => deleteStep(selected.id)}
                onBlur={setBlurring}
                onBlurred={(blob) => applyBlur(selected.id, blob)}
                onFix={() => fixOnSite(selected, steps.indexOf(selected))}
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
                <p className="text-base font-semibold text-slate-900">
                  No steps yet
                </p>
                <p className="text-sm text-slate-600">
                  Record steps on the website to start.
                </p>
              </div>
            )}
          </section>
        </div>
      </Modal>
      {check && (
        <PublishCheck
          set={set}
          hidden={check.hidden}
          askPictures={check.askPictures}
          onCancel={() => setCheck(null)}
          onBlur={() => {
            setCheck(null);
            const first = steps.find((s) => s.web?.picture);
            if (first) setSelectedId(first.id);
            setBlurring(true);
          }}
          onPublish={() =>
            void doPublish(
              check.askPictures
                ? confirmPictures(latest.current, uid)
                : latest.current
            )
          }
        />
      )}
    </PictureCache.Provider>
  );
};
