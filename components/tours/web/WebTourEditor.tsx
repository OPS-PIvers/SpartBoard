import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Copy,
  Droplets,
  ImageOff,
  Link2,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';
import type {
  GuidedLearningSet,
  GuidedLearningStep,
  WebTourCheckResult,
  WebTourSuggestion,
} from '@/types';
import { Modal } from '@/components/common/Modal';
import { DashboardContext } from '@/context/DashboardContextValue';
import { useAuth } from '@/context/useAuth';
import { useDialog } from '@/context/useDialog';
import { tourAttr, tourFieldAttr } from '@/config/tourAnchors';
import { logError } from '@/utils/logError';
import {
  focusRing,
  headerIconBtn,
  iconBtn,
} from '@/components/common/lightChrome';
import { buildNameMatcher } from '@/components/widgets/GuidedLearning/components/recorder/redaction';
import {
  deleteWebTourDraft,
  duplicateWebTourDraft,
  publishWebTour,
  saveWebTourDraft,
  uploadWebTourPicture,
  type WebTourPictureType,
} from '@/components/tours/webTours';
import { usePublishedTour } from '@/components/tours/publishedTours';
import { loadTourRuns, type TourRun } from '@/components/tours/tourRuns';
import { tourPublishStatus } from '@/components/tours/tourSnapshot';
import { isWebTourSet } from '@/components/widgets/GuidedLearning/utils/liveTour';
import {
  TourShellHeader,
  TourShellOutline,
  TourShellOutlineFoot,
} from '@/components/tours/editor/shell/TourEditorShell';
import {
  cardInput,
  cardLabel,
  focusStepTitle,
} from '@/components/tours/editor/shell/stepCardParts';
import { tourMainAction } from '@/components/tours/editor/shell/tourMainAction';
import type {
  TourShellAdapter,
  TourShellMenuItem,
  TourShellStep,
} from '@/components/tours/editor/shell/types';
import { isHardHit, toUrlPattern } from './studentData';
import { scrubLocator, toWebStep } from './recordedSteps';
import { uploadRecordedPicture } from './intakeSave';
import type { RecordedWebStep } from './recorderProtocol';
import { useWebTourRecorder, type RecorderLink } from './useWebTourRecorder';
import { buildTourUrl } from './tourLinks';
import { useCopyWebTourLink } from './useCopyWebTourLink';
import { pageUrlOf, type HubStep } from './webTourHub';
import {
  canCheckWebTours,
  pingExtension,
  REPICK_PROTOCOL,
} from './extensionClient';
import { CONDITIONS_PROTOCOL } from './extensionProtocol';
import { useWebTourCheck } from './useWebTourCheck';
import {
  applyFix,
  clearFoundSuggestion,
  dismissFix,
  recordCheckSuggestion,
  runSuggestions,
  suggestionFor,
} from './webTourFixes';
import {
  assertPublishable,
  checkPasses,
  confirmPictures,
  currentCheckResults,
  hideStudentData,
  needsFixOnSite,
  picturesNeedConfirm,
  publishBlockers,
  recordCheckResult,
  reviewEntries,
  startCheckRun,
  type HiddenText,
} from './webStepReview';
import { PublishCheck } from './webEditorParts';
import { PictureCache } from './webPictures';
import {
  CHECK_LABEL,
  webStepNeedsText,
  webTargetLabel,
  type WebStep,
} from './webEditorModel';
import { WebPictureStage } from './WebPictureStage';
import { WebStepCard } from './WebStepCard';
import { WebTourGoalField, WebWritingStrip } from './WebTourWriting';
import { useWebTourWriting } from './useWebTourWriting';
import { useWebTourDraft } from './useWebTourDraft';
import { webTourEditorDevSeed } from './webEditorDevSeed';

const LINK_COPY: Record<RecorderLink, string> = {
  off: '',
  connecting: 'Connecting to the SpartBoard extension...',
  connected:
    'Recorder ready. On the website, open the SpartBoard extension, press Record and click through. New steps go after the selected one.',
  unavailable:
    "The SpartBoard extension isn't installed, or Chrome isn't signed in with your Orono staff account.",
};

const PICTURE_TYPES: readonly string[] = [
  'image/png',
  'image/jpeg',
  'image/webp',
];

/** A blank web step after `after`, on the same page, waiting for Fix on site to pick its target. */
const newWebStep = (after: WebStep | undefined): WebStep => ({
  id: crypto.randomUUID(),
  xPct: 50,
  yPct: 50,
  imageIndex: 0,
  interactionType: 'tooltip',
  label: '',
  text: '',
  web: {
    urlPattern: after?.web?.urlPattern ?? '*',
    action: 'click',
    locator: {},
  },
});

/** Inserts `added` after the step with id `afterId`, or at the end when there is none. */
const insertAfter = (
  steps: GuidedLearningStep[],
  afterId: string | null,
  added: GuidedLearningStep
): GuidedLearningStep[] => {
  const at = afterId ? steps.findIndex((s) => s.id === afterId) : -1;
  const next = [...steps];
  next.splice(at < 0 ? steps.length : at + 1, 0, added);
  return next;
};

/** Edits a web tour in the shared tour editor shell, beside a stage that previews the step as the learner sees it. */
export const WebTourEditor: React.FC<{
  initial: GuidedLearningSet;
  onClose: () => void;
}> = ({ initial, onClose }) => {
  // Duplicate swaps the editor onto the copy.
  const [current, setCurrent] = useState(initial);
  return (
    <WebTourEditorBody
      key={current.id}
      initial={current}
      onClose={onClose}
      onOpen={setCurrent}
    />
  );
};

const WebTourEditorBody: React.FC<{
  initial: GuidedLearningSet;
  onClose: () => void;
  onOpen: (set: GuidedLearningSet) => void;
}> = ({ initial, onClose, onOpen }) => {
  const { user } = useAuth();
  const uid = user?.uid ?? '';
  const { showConfirm } = useDialog();
  const rosters = useContext(DashboardContext)?.rosters;
  const matcher = useMemo(
    () => buildNameMatcher((rosters ?? []).flatMap((r) => r.students)),
    [rosters]
  );
  const pictureCache = useMemo(() => new Map<string, Promise<Blob>>(), []);
  const draft = useWebTourDraft(initial);
  const { set, latest, change, saveNow, saveCheck, saveFixes } = draft;
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<'steps' | 'settings'>('steps');
  const [selectedId, setSelectedId] = useState<string | null>(
    initial.steps[0]?.id ?? null
  );
  const [pictureSelected, setPictureSelected] = useState(false);
  const [blurring, setBlurring] = useState(false);
  const [check, setCheck] = useState<{
    hidden: HiddenText[];
    askPictures: boolean;
  } | null>(null);
  const [extensionCanFix, setCanFix] = useState(false);
  const [extensionCanCheck, setCanCheck] = useState(false);
  const [playsConditions, setPlaysConditions] = useState(false);
  const copyLink = useCopyWebTourLink();
  const published = usePublishedTour(initial.id);
  const live =
    published.tour && isWebTourSet(published.tour.set) ? published.tour : null;
  const [runs, setRuns] = useState<TourRun[] | null>(null);
  const publishing = useRef(false);
  // The step the next recorded step goes after; null appends.
  const recordAfter = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void pingExtension().then((s) => {
      if (cancelled) return;
      setCanFix(s.kind === 'ready' && s.protocol >= REPICK_PROTOCOL);
      setCanCheck(canCheckWebTours(s));
      setPlaysConditions(
        s.kind === 'ready' && s.protocol >= CONDITIONS_PROTOCOL
      );
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Runs of the published tour, for the fixes they suggest.
  useEffect(() => {
    let cancelled = false;
    loadTourRuns(initial.id)
      .then((r) => {
        if (!cancelled) setRuns(r);
      })
      .catch((err: unknown) =>
        logError('web tour runs', err, { setId: initial.id })
      );
    return () => {
      cancelled = true;
    };
  }, [initial.id]);

  const checker = useWebTourCheck({
    onStart: (sig) => saveCheck((s) => startCheckRun(s, uid, sig)),
    onResult: (sig, stepId, result) => {
      saveCheck((s) => recordCheckResult(s, sig, stepId, result));
      // A step this check found clearly needs no earlier check's fix.
      if (result === 'found') saveFixes((s) => clearFoundSuggestion(s, stepId));
    },
    onSuggest: (sig, stepId, locator) =>
      saveFixes((s) =>
        recordCheckSuggestion(s, sig, stepId, locator, Date.now(), matcher)
      ),
    onStatus: setStatus,
  });

  const writing = useWebTourWriting({
    set,
    change,
    flush: draft.flush,
    onStatus: setStatus,
  });

  const select = (id: string | null) => {
    setSelectedId(id);
    setPictureSelected(false);
    setBlurring(false);
  };

  const onStep = async (recorded: RecordedWebStep) => {
    if (publishing.current) throw new Error('Publishing; the step is re-sent');
    const cur = latest.current;
    // A re-sent step is already here but its save may have failed, so save again before the ack.
    if (cur.steps.some((s) => s.id === recorded.id)) {
      if (draft.deleted.current) throw new Error('Tour deleted');
      await saveWebTourDraft(cur);
      return;
    }
    const picture = await uploadRecordedPicture(recorded, cur.id);
    // A step that lands after Delete must not re-create the draft.
    if (draft.deleted.current) throw new Error('Tour deleted');
    const after = recordAfter.current;
    await saveNow({
      ...latest.current,
      steps: insertAfter(
        latest.current.steps,
        after,
        toWebStep(recorded, picture)
      ),
    });
    // Each recorded step goes after the one before it, so a run keeps its order.
    if (after) recordAfter.current = recorded.id;
    select(recorded.id);
  };

  // Fix on site: the new target and picture replace the step's; its title and tip stay.
  const onRepicked = async (recorded: RecordedWebStep) => {
    if (publishing.current) throw new Error('Publishing; the step is re-sent');
    const index = latest.current.steps.findIndex((s) => s.id === recorded.id);
    const target = latest.current.steps[index];
    if (!target?.web) return;
    const picture = await uploadRecordedPicture(recorded, latest.current.id);
    if (draft.deleted.current) throw new Error('Tour deleted');
    const web = {
      ...target.web,
      urlPattern: toUrlPattern(recorded.urlPattern) ?? '*',
      locator: scrubLocator(recorded.locator),
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
  const selectedIndex = Math.max(
    0,
    steps.findIndex((s) => s.id === selectedId)
  );
  const selected = steps[selectedIndex] as WebStep | undefined;
  const blockers = publishBlockers(set, matcher);
  const unchecked = blockers.some((b) => b.kind === 'unchecked');
  const notWeb = blockers.some((b) => b.kind === 'not-web');
  const checkResults = currentCheckResults(set);
  const fromRuns = useMemo(
    () =>
      runs && live
        ? runSuggestions(runs, live.publishedAt, live.set.steps, matcher)
        : new Map<string, WebTourSuggestion>(),
    [runs, live, matcher]
  );
  const fixes = new Map(
    steps.flatMap((s) => {
      const fix = suggestionFor(set, s, fromRuns);
      return fix ? [[s.id, fix] as const] : [];
    })
  );

  const updateStep = (id: string, step: GuidedLearningStep, field?: string) =>
    change(
      (cur) => ({
        ...cur,
        steps: cur.steps.map((s) => (s.id === id ? step : s)),
      }),
      field ? `${id}:${field}` : undefined
    );

  const moveStep = (id: string, to: number) =>
    change((cur) => {
      const from = cur.steps.findIndex((s) => s.id === id);
      const at = Math.min(Math.max(to, 0), cur.steps.length - 1);
      if (from < 0 || from === at) return cur;
      const next = [...cur.steps];
      const [moved] = next.splice(from, 1);
      next.splice(at, 0, moved);
      return { ...cur, steps: next };
    });

  const deleteStep = (id: string) => {
    const i = steps.findIndex((s) => s.id === id);
    select(steps[i + 1]?.id ?? steps[i - 1]?.id ?? null);
    change((cur) => ({
      ...cur,
      steps: cur.steps.filter((s) => s.id !== id),
    }));
  };

  const addStep = () => {
    const created = newWebStep(selected);
    change((cur) => ({
      ...cur,
      steps: insertAfter(cur.steps, selected?.id ?? null, created),
    }));
    setTab('steps');
    select(created.id);
    focusStepTitle(created.id);
  };

  const record = () => {
    if (recorder.link === 'connected') {
      recorder.disconnect();
      return;
    }
    recordAfter.current = selected?.id ?? null;
    setTab('steps');
    recorder.connect();
  };

  const applyBlur = async (stepId: string, blob: Blob) => {
    const type = (
      PICTURE_TYPES.includes(blob.type) ? blob.type : 'image/png'
    ) as WebTourPictureType;
    const path = await uploadWebTourPicture(latest.current.id, blob, type);
    const cur = latest.current;
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

  const removePicture = (step: WebStep) => {
    if (!step.web) return;
    const { picture: _picture, ...web } = step.web;
    updateStep(step.id, { ...step, web });
    setPictureSelected(false);
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
      await saveNow(toPublish, false);
      // The gate runs on the draft publishing reads, so nothing saved since slips through.
      // Pictures undo or redo can bring back stay in Storage.
      await publishWebTour(
        toPublish.id,
        uid,
        (d) => assertPublishable(d, matcher),
        draft.historyPicturePaths()
      );
      setStatus('Published.');
      void draft.sweepAfterPublish();
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
    if (!checkPasses(scrubbed)) {
      setStatus(
        'Student data was hidden in a step target. Check the tour again.'
      );
      return;
    }
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
    draft.drop();
    try {
      await deleteWebTourDraft(set.id);
    } catch (err) {
      draft.undrop();
      logError('web tour delete', err, { setId: set.id });
      setStatus("The tour couldn't be deleted.");
      return;
    }
    onClose();
  };

  const duplicate = async () => {
    setStatus('Making a copy...');
    try {
      const saved = await draft.flush();
      const copy = await duplicateWebTourDraft(saved);
      recorder.disconnect();
      onOpen(copy);
    } catch (err) {
      logError('web tour duplicate', err, { setId: set.id });
      setStatus("The tour couldn't be copied.");
    }
  };

  const copy = async () => {
    if (await copyLink(set.id, set.title)) setStatus('Link copied.');
  };

  const seed = webTourEditorDevSeed();
  const pub =
    seed?.publish ?? (published.loaded ? tourPublishStatus(set, live) : null);
  const canCheck = seed?.canCheck ?? extensionCanCheck;
  const canFix = seed?.canFix ?? extensionCanFix;
  const hasLive =
    !!live || (seed?.publish !== undefined && seed.publish !== 'draft');
  const checking = seed?.checking ?? checker.checking;
  const computed = tourMainAction({
    kind: 'web',
    stepCount: steps.length,
    stepsWithoutText: steps.filter(webStepNeedsText).length,
    publish: pub,
    checkNeeded: unchecked,
    checking,
    canCheck,
    other: notWeb ? 'A step has no website target' : null,
    busy: busy || writing.busy,
  });
  // A Check tour this browser can't run says why on the status line.
  const main =
    computed.state === 'check' && !canCheck && !checking
      ? {
          ...computed,
          blocker: {
            kind: 'other' as const,
            label: 'Checking needs the SpartBoard extension',
          },
        }
      : computed;
  const mainAnchor =
    main.state === 'write'
      ? tourAttr('web-tour-editor.write-with-claude')
      : main.state === 'check'
        ? tourAttr('web-tour-editor.check')
        : tourAttr('web-tour-editor.publish');

  const menu: TourShellMenuItem[] = [
    {
      id: 'rewrite-all',
      label: 'Rewrite all with Claude',
      icon: RefreshCw,
      disabled: writing.busy || steps.length === 0,
      onSelect: () => void writing.run('all'),
      anchor: tourAttr('web-tour-editor.rewrite-all'),
    },
    {
      id: 'copy-link',
      label: 'Copy link',
      icon: Link2,
      onSelect: () => void copy(),
      anchor: tourAttr('web-tour-editor.copy-link'),
    },
    {
      id: 'duplicate',
      label: 'Duplicate',
      icon: Copy,
      onSelect: () => void duplicate(),
      anchor: tourAttr('web-tour-editor.duplicate'),
    },
    {
      id: 'delete',
      label: 'Delete web tour',
      icon: Trash2,
      danger: true,
      onSelect: () => void remove(),
      anchor: tourAttr('web-tour-editor.delete'),
    },
  ];

  const adapter: TourShellAdapter = {
    kind: 'web',
    title: set.title,
    saveState: draft.saveState,
    publish: pub,
    publishing: busy,
    main,
    onMain: (state) => {
      if (state === 'write') {
        setTab('steps');
        const at = steps.findIndex(webStepNeedsText);
        if (at >= 0) select(steps[at].id);
        void writing.run('blanks');
      } else if (state === 'check')
        void checker.start(latest.current, playsConditions);
      else if (state === 'publish') publish();
    },
    // Play runs the published tour, so it shows once there is one.
    onPlay: hasLive
      ? () => window.open(buildTourUrl(set.id), '_blank', 'noopener,noreferrer')
      : undefined,
    playHint: 'Play the published tour on the website',
    menu,
    steps: steps.map((step, i) =>
      outlineStep(step, i, matcher, checkResults?.[step.id], fixes.has(step.id))
    ),
    selected: selectedIndex,
    onSelect: (i) => select(steps[i]?.id ?? null),
    onMove: moveStep,
    renderCard: (stepId) => {
      const step = steps.find((s) => s.id === stepId);
      if (!step) return null;
      const index = steps.indexOf(step);
      return (
        <WebStepCard
          key={step.id}
          step={step}
          matcher={matcher}
          canFix={canFix}
          fix={fixes.get(step.id) ?? null}
          result={checkResults?.[step.id] ?? null}
          onChange={(s, field) => updateStep(step.id, s, field)}
          onDelete={() => deleteStep(step.id)}
          onFix={() => fixOnSite(step, index)}
          onUseFix={() => {
            const fix = fixes.get(step.id);
            if (fix) change((s) => applyFix(s, step.id, fix));
          }}
          onDismissFix={() => {
            const fix = fixes.get(step.id);
            if (fix) saveFixes((s) => dismissFix(s, step.id, fix));
          }}
        />
      );
    },
    onAddStep: addStep,
    onRecord: record,
    recordLabel:
      recorder.link === 'connected'
        ? 'Stop receiving steps'
        : steps.length > 0
          ? 'Record from here'
          : 'Record steps',
    recording: recorder.link === 'connected',
    anchors: {
      main: mainAnchor,
      play: tourAttr('web-tour-editor.play'),
      menu: tourAttr('web-tour-editor.menu'),
      'add-step': tourAttr('web-tour-editor.add-step'),
      record: tourAttr('web-tour-editor.record'),
    },
    undo: {
      onUndo: draft.undo,
      onRedo: draft.redo,
      canUndo: draft.canUndo,
      canRedo: draft.canRedo,
    },
  };

  const pictureTools = selected?.web?.picture ? (
    <>
      {/* Slice 5 adds Crop, Mark up, Retake and Replace beside Blur. */}
      <button
        type="button"
        onClick={() => {
          setPictureSelected(false);
          setBlurring(true);
        }}
        className={`${iconBtn} flex items-center gap-1.5 px-2 text-sm font-semibold text-slate-700`}
        {...tourAttr('web-tour-editor.picture-blur')}
      >
        <Droplets className="h-4 w-4" aria-hidden="true" />
        Blur
      </button>
      <button
        type="button"
        onClick={() => removePicture(selected)}
        className={`${iconBtn} flex items-center gap-1.5 px-2 text-sm font-semibold text-slate-700`}
        {...tourAttr('web-tour-editor.picture-remove')}
      >
        <ImageOff className="h-4 w-4" aria-hidden="true" />
        Remove picture
      </button>
    </>
  ) : null;

  const notices = [
    LINK_COPY[recorder.link],
    matcher
      ? ''
      : "No class rosters are loaded, so student names can't be found automatically.",
  ].filter(Boolean);

  return (
    <PictureCache.Provider value={pictureCache}>
      <Modal
        isOpen
        onClose={onClose}
        variant="bare"
        fullscreen
        ariaLabel="Web tour"
        className="bg-slate-800"
      >
        <div data-testid="web-tour-editor" className="flex h-full min-h-0">
          <WebPictureStage
            step={selected}
            index={selectedIndex}
            total={steps.length}
            pictureSelected={pictureSelected}
            onSelectPicture={setPictureSelected}
            tools={pictureTools}
            blurring={blurring}
            onBlurred={(blob) =>
              selected ? applyBlur(selected.id, blob) : Promise.resolve()
            }
            onCancelBlur={() => setBlurring(false)}
          />
          <aside
            aria-label="Web tour editor"
            className="flex w-[360px] shrink-0 flex-col overflow-hidden border-l border-slate-900/10 bg-white xl:w-[400px]"
          >
            <TourShellHeader
              adapter={adapter}
              alert={
                draft.saveState === 'error' ? (
                  <p
                    role="alert"
                    className="flex items-start gap-1 text-xs font-semibold text-red-300"
                  >
                    <AlertTriangle
                      className="mt-px h-3.5 w-3.5 shrink-0"
                      aria-hidden="true"
                    />
                    Changes couldn&apos;t be saved. Check your connection.
                  </p>
                ) : null
              }
              chrome={
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  title="Close"
                  className={headerIconBtn}
                  {...tourFieldAttr('modal.close', 'web-tour', 'close')}
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              }
            />
            <WebWritingStrip writing={writing} />
            {status && (
              <p
                role="status"
                data-testid="web-tour-status"
                className="border-b border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700"
              >
                {status}
              </p>
            )}
            {notices.map((note) => (
              <p
                key={note}
                role="note"
                className="border-b border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-900"
              >
                {note}
              </p>
            ))}
            <div
              role="tablist"
              className="flex gap-1 border-b border-slate-200 bg-slate-50 px-2 py-1.5"
            >
              {(['steps', 'settings'] as const).map((id) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={tab === id}
                  onClick={() => setTab(id)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${focusRing} ${
                    tab === id
                      ? 'bg-white text-brand-blue-dark shadow-xs'
                      : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                  }`}
                  {...(id === 'steps'
                    ? tourAttr('web-tour-editor.tab-steps')
                    : tourAttr('web-tour-editor.tab-settings'))}
                >
                  {id === 'steps' ? 'Steps' : 'Settings'}
                </button>
              ))}
            </div>
            {tab === 'settings' ? (
              <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 pb-4 pt-3">
                <label className={cardLabel}>
                  Title
                  <input
                    className={cardInput}
                    value={set.title}
                    onChange={(e) => {
                      const title = e.target.value;
                      change((cur) => ({ ...cur, title }), 'title');
                    }}
                    {...tourAttr('web-tour-editor.title')}
                  />
                </label>
                <WebTourGoalField set={set} change={(u) => change(u, 'goal')} />
              </div>
            ) : (
              <>
                <TourShellOutline adapter={adapter} />
                <TourShellOutlineFoot adapter={adapter} />
              </>
            )}
          </aside>
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
            if (first) select(first.id);
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

/** A web step's outline row: its title, and the one thing about it that needs attention. */
const outlineStep = (
  step: WebStep,
  index: number,
  matcher: ReturnType<typeof buildNameMatcher>,
  result: WebTourCheckResult | undefined,
  hasFix: boolean
): TourShellStep => {
  const label = step.label?.trim() ?? '';
  const target = webTargetLabel(step.web?.locator);
  const studentData = reviewEntries(step, matcher).some((e) =>
    e.hits.some(isHardHit)
  );
  const subtitle: TourShellStep['subtitle'] = !step.web
    ? { text: 'No website target', tone: 'error' }
    : studentData
      ? { text: 'Student data', tone: 'warn' }
      : hasFix
        ? { text: 'Suggested fix', tone: 'warn' }
        : result === 'none'
          ? { text: CHECK_LABEL.none, tone: 'error' }
          : result && result !== 'found'
            ? { text: CHECK_LABEL[result], tone: 'warn' }
            : webStepNeedsText(step)
              ? { text: 'Needs text', tone: 'warn' }
              : needsFixOnSite(step)
                ? { text: 'Needs checking', tone: 'warn' }
                : label
                  ? { text: target, tone: 'muted' }
                  : null;
  return {
    id: step.id,
    title:
      label.length > 0 ? label : studentData ? `Step ${index + 1}` : target,
    titleIsFallback: label.length === 0,
    status: result ?? undefined,
    subtitle,
  };
};
