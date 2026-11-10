import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe, Loader2 } from 'lucide-react';
import type { GuidedLearningSet } from '@/types';
import { Modal } from '@/components/common/Modal';
import {
  focusRing,
  primaryBtn,
  secondaryBtn,
} from '@/components/common/lightChrome';
import { tourAttr } from '@/config/tourAnchors';
import { logError } from '@/utils/logError';
import { webTourStepsOf } from '@/components/widgets/GuidedLearning/utils/liveTour';
import { renderStepText } from '@/components/widgets/GuidedLearning/utils/richText';
import { loadPublishedTour } from '@/components/tours/publishedTours';
import { isWebTourPicturePath } from '@/components/tours/webTours';
import { StepsArticle } from '@/components/tours/steps/StepsArticle';
import { stepsFromLiveTour } from '@/components/tours/steps/liveSteps';
import {
  stepsFromWebTour,
  type StepPictures,
  type StepsViewStep,
} from '@/components/tours/steps/stepsModel';
import { useStepsLabels } from '@/components/tours/steps/useStepsLabels';
import {
  pictureFingerprint,
  tourKindOf,
  type PublicTourKind,
} from './publicLinkModel';
import { publicLinkDevSeed, readConfirmedPicture } from './publicLinkStore';

/** A step picture as the admin saw it: its address in the page, and the Storage object and generation it came from. */
interface SeenPicture {
  src: string;
  path?: string;
  generation?: string;
}

type Loaded =
  | { kind: 'loading' }
  | { kind: 'failed' }
  | {
      kind: 'ready';
      set: GuidedLearningSet;
      steps: StepsViewStep[];
      /** Null while the pictures load. */
      seen: Map<string, SeenPicture> | null;
    };

async function loadPublished(setId: string): Promise<GuidedLearningSet | null> {
  const seed = publicLinkDevSeed();
  if (seed?.published && setId in seed.published)
    return seed.published[setId] ?? null;
  return (await loadPublishedTour(setId))?.set ?? null;
}

/** Where each step's picture comes from: a web tour's Storage path, or a Live tour's picture address. */
function pictureSources(
  setId: string,
  set: GuidedLearningSet
): { steps: StepsViewStep[]; sources: Map<string, string>; live: boolean } {
  if (tourKindOf(set) === 'live') {
    const live = stepsFromLiveTour(set);
    return {
      steps: live.steps,
      sources: new Map(Object.entries(live.urls)),
      live: true,
    };
  }
  const steps = webTourStepsOf(set);
  const sources = new Map<string, string>();
  for (const step of steps) {
    const path = step.web.picture?.path;
    if (path && isWebTourPicturePath(setId, path)) sources.set(step.id, path);
  }
  return { steps: stepsFromWebTour(steps), sources, live: false };
}

/** What the admin confirms: the exact published copy and the exact picture files, read fresh. */
export interface PublicLinkConfirmation {
  fingerprint: string;
  kind: PublicTourKind;
  /** Each picture's Storage generation, by object path. */
  pictures: Record<string, string>;
}

/** The second confirm: every published step at full size, pictures and markup included, read to the end, then the acknowledgement. */
export const PublicLinkConfirm: React.FC<{
  setId: string;
  onCancel: () => void;
  onConfirm: (confirmed: PublicLinkConfirmation) => void;
}> = ({ setId, onCancel, onConfirm }) => {
  const { t } = useTranslation();
  const labels = useStepsLabels();
  const [loaded, setLoaded] = useState<Loaded>({ kind: 'loading' });
  const [acknowledged, setAcknowledged] = useState(false);
  const [seenSteps, setSeenSteps] = useState<ReadonlySet<number>>(new Set());
  const reasonId = useId();
  const [reachedEnd, setReachedEnd] = useState(false);
  const review = useRef<HTMLDivElement>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const blobs: string[] = [];
    void (async () => {
      try {
        const set = await loadPublished(setId);
        if (cancelled) return;
        if (!set || !tourKindOf(set)) {
          setLoaded({ kind: 'failed' });
          return;
        }
        const { steps, sources, live } = pictureSources(setId, set);
        setLoaded({ kind: 'ready', set, steps, seen: null });
        const seen = new Map<string, SeenPicture>();
        await Promise.all(
          [...sources].map(async ([stepId, source]) => {
            try {
              const pic = await readConfirmedPicture(source);
              if (pic) {
                const src = URL.createObjectURL(new Blob([pic.bytes]));
                blobs.push(src);
                seen.set(stepId, {
                  src,
                  path: pic.path,
                  generation: pic.generation,
                });
              } else if (live) {
                // Not in this project's Storage (an old Drive slide): shown here, never served publicly.
                seen.set(stepId, { src: source });
              }
            } catch (err) {
              logError('PublicLinkConfirm.picture', err, { setId, stepId });
            }
          })
        );
        if (!cancelled) setLoaded({ kind: 'ready', set, steps, seen });
      } catch (err) {
        logError('PublicLinkConfirm.load', err, { setId });
        if (!cancelled) setLoaded({ kind: 'failed' });
      }
    })();
    return () => {
      cancelled = true;
      blobs.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [setId]);

  const view = useMemo(() => {
    if (loaded.kind !== 'ready') return null;
    const { steps, seen } = loaded;
    const pictures: StepPictures = Object.fromEntries(
      steps.flatMap((s) => {
        if (!s.picture) return [];
        const src = seen?.get(s.id)?.src;
        return [
          [
            s.id,
            src
              ? { status: 'ready' as const, src }
              : seen === null
                ? { status: 'loading' as const }
                : { status: 'failed' as const },
          ],
        ];
      })
    );
    const missing = seen
      ? steps.filter((s) => s.picture && !seen.has(s.id)).length
      : 0;
    return { steps, pictures, ready: seen !== null, missing };
  }, [loaded]);

  // Reading to the end is the review: count the steps seen and watch for the end of the article.
  const ready = !!view?.ready;
  useEffect(() => {
    const root = review.current?.closest<HTMLElement>('.overflow-y-auto');
    const endEl = end.current;
    if (
      !ready ||
      !root ||
      !endEl ||
      typeof IntersectionObserver === 'undefined'
    )
      return;
    // The scroller takes focus so the keyboard can page through it.
    const madeFocusable = !root.hasAttribute('tabindex');
    if (madeFocusable) root.tabIndex = 0;
    const stepEls = Array.from(
      review.current?.querySelectorAll<HTMLElement>(
        '[data-testid="steps-article-step"]'
      ) ?? []
    );
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          if (entry.target === endEl) setReachedEnd(true);
          const at = stepEls.indexOf(entry.target as HTMLElement);
          if (at >= 0)
            setSeenSteps((prev) =>
              prev.has(at) ? prev : new Set(prev).add(at)
            );
        }
      },
      { root, threshold: 0.2 }
    );
    stepEls.forEach((el) => observer.observe(el));
    observer.observe(endEl);
    return () => {
      observer.disconnect();
      if (madeFocusable) root.removeAttribute('tabindex');
    };
  }, [ready]);

  const total = view?.steps.length ?? 0;
  const reviewed = ready && reachedEnd;
  // A picture the admin couldn't see is never confirmed.
  const canConfirm =
    loaded.kind === 'ready' && reviewed && view?.missing === 0 && acknowledged;
  const confirm = () => {
    if (!canConfirm || loaded.kind !== 'ready' || !loaded.seen) return;
    const fingerprint = pictureFingerprint(loaded.set);
    const kind = tourKindOf(loaded.set);
    const pictures: Record<string, string> = {};
    for (const pic of loaded.seen.values())
      if (pic.path && pic.generation) pictures[pic.path] = pic.generation;
    if (fingerprint !== null && kind)
      onConfirm({ fingerprint, kind, pictures });
  };

  const reason =
    loaded.kind !== 'ready' || !view
      ? null
      : view.missing > 0
        ? t('tourPublicLink.confirmPictureFailed')
        : !reviewed
          ? t('tourPublicLink.reviewProgress', {
              count: total,
              seen: Math.min(seenSteps.size, total),
            })
          : !acknowledged
            ? t('tourPublicLink.confirmNeedsAck')
            : null;

  return (
    <Modal
      isOpen
      onClose={onCancel}
      title={t('tourPublicLink.confirmTitle')}
      maxWidth="max-w-4xl"
      // Above the Live editor panel, which sits over the tour layers.
      zIndex="z-dialog"
      footer={
        <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <label
              className={`flex items-start gap-2.5 text-sm ${
                reviewed ? 'text-slate-800' : 'text-slate-500'
              }`}
            >
              <input
                type="checkbox"
                checked={acknowledged}
                disabled={!reviewed}
                onChange={(e) => setAcknowledged(e.target.checked)}
                aria-describedby={reasonId}
                data-testid="public-link-ack"
                className={`mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-brand-blue-primary disabled:cursor-not-allowed ${focusRing}`}
                {...tourAttr('tour-public-link.acknowledge')}
              />
              <span>{t('tourPublicLink.confirmAck')}</span>
            </label>
            <p
              id={reasonId}
              data-testid="public-link-reason-confirm"
              aria-live="polite"
              className={`text-xs font-medium ${
                view && view.missing > 0
                  ? 'text-brand-red-primary'
                  : 'text-slate-600'
              } ${reason ? '' : 'sr-only'}`}
            >
              {reason}
            </p>
          </div>
          <div className="flex shrink-0 items-center justify-end gap-2">
            {/* no-tour-anchor: closes the one-off confirm */}
            <button type="button" className={secondaryBtn} onClick={onCancel}>
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={confirm}
              disabled={!canConfirm}
              aria-describedby={reasonId}
              data-testid="public-link-confirm"
              className={`${primaryBtn} inline-flex items-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-50`}
              {...tourAttr('tour-public-link.confirm')}
            >
              <Globe className="h-4 w-4" aria-hidden="true" />
              {t('tourPublicLink.confirmButton')}
            </button>
          </div>
        </div>
      }
    >
      <div
        ref={review}
        data-testid="public-link-review"
        aria-label={t('tourPublicLink.confirmTitle')}
        className="flex flex-col gap-6 pb-4"
      >
        <p className="text-sm text-slate-700">
          {t('tourPublicLink.confirmIntro')}
        </p>
        {loaded.kind === 'loading' ? (
          <p
            role="status"
            className="flex items-center gap-2 py-8 text-sm text-slate-500"
          >
            <Loader2
              className="h-4 w-4 animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
            {t('tourPublicLink.confirmLoading')}
          </p>
        ) : loaded.kind === 'failed' || !view ? (
          <p role="alert" className="py-8 text-sm text-brand-red-primary">
            {t('tourPublicLink.confirmFailed')}
          </p>
        ) : (
          <>
            {view.missing > 0 && (
              <p
                role="alert"
                className="text-sm font-medium text-brand-red-primary"
              >
                {t('tourPublicLink.confirmPictureFailed')}
              </p>
            )}
            <h2 className="text-2xl font-semibold text-slate-900 wrap-break-word">
              {loaded.set.title}
            </h2>
            <StepsArticle
              steps={view.steps}
              pictures={view.pictures}
              labels={labels}
              renderText={
                tourKindOf(loaded.set) === 'live' ? renderStepText : undefined
              }
            />
            <div
              ref={end}
              data-testid="public-link-review-end"
              className="border-t border-slate-200 pt-3 text-xs text-slate-500"
            >
              {t('tourPublicLink.reviewEnd', { count: total })}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
};
