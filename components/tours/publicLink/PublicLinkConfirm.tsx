import React, { useEffect, useMemo, useState } from 'react';
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
import { loadWebTourPicture } from '@/components/tours/webTours';
import { loadPictures } from '@/components/tours/web/webTourHub';
import { StepsArticle } from '@/components/tours/steps/StepsArticle';
import { stepsFromLiveTour } from '@/components/tours/steps/liveSteps';
import {
  stepsFromWebTour,
  type StepPictures,
} from '@/components/tours/steps/stepsModel';
import { useStepsLabels } from '@/components/tours/steps/useStepsLabels';
import {
  pictureFingerprint,
  tourKindOf,
  type PublicTourKind,
} from './publicLinkModel';
import { publicLinkDevSeed } from './publicLinkStore';

type Loaded =
  | { kind: 'loading' }
  | { kind: 'failed' }
  | { kind: 'ready'; set: GuidedLearningSet; urls: Map<string, string> | null };

async function loadPublished(setId: string): Promise<GuidedLearningSet | null> {
  const seed = publicLinkDevSeed();
  if (seed?.published && setId in seed.published)
    return seed.published[setId] ?? null;
  return (await loadPublishedTour(setId))?.set ?? null;
}

const readPicture = async (path: string): Promise<ArrayBuffer> => {
  const blob = publicLinkDevSeed()?.pictures?.[path];
  return blob ? blob.arrayBuffer() : loadWebTourPicture(path);
};

/** What the admin confirms: the exact published copy, read fresh, so the fingerprint matches what they saw. */
export interface PublicLinkConfirmation {
  fingerprint: string;
  kind: PublicTourKind;
}

/** The second confirm: every published step at full size, pictures and markup included, then the acknowledgement. */
export const PublicLinkConfirm: React.FC<{
  setId: string;
  onCancel: () => void;
  onConfirm: (confirmed: PublicLinkConfirmation) => void;
}> = ({ setId, onCancel, onConfirm }) => {
  const { t } = useTranslation();
  const labels = useStepsLabels();
  const [loaded, setLoaded] = useState<Loaded>({ kind: 'loading' });
  const [acknowledged, setAcknowledged] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const urls = new Map<string, string>();
    void (async () => {
      try {
        const set = await loadPublished(setId);
        const kind = tourKindOf(set);
        if (cancelled) return;
        if (!set || !kind) {
          setLoaded({ kind: 'failed' });
          return;
        }
        if (kind === 'live') {
          setLoaded({ kind: 'ready', set, urls: null });
          return;
        }
        setLoaded({ kind: 'ready', set, urls: null });
        const map = await loadPictures(setId, webTourStepsOf(set), readPicture);
        if (cancelled) return;
        map.forEach((pic, id) => {
          urls.set(
            id,
            URL.createObjectURL(
              new Blob([pic.bytes as BlobPart], { type: pic.mime })
            )
          );
        });
        setLoaded({ kind: 'ready', set, urls: new Map(urls) });
      } catch (err) {
        logError('PublicLinkConfirm.load', err, { setId });
        if (!cancelled) setLoaded({ kind: 'failed' });
      }
    })();
    return () => {
      cancelled = true;
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [setId]);

  const view = useMemo(() => {
    if (loaded.kind !== 'ready') return null;
    const { set, urls } = loaded;
    if (tourKindOf(set) === 'live') {
      const live = stepsFromLiveTour(set);
      const pictures: StepPictures = Object.fromEntries(
        Object.entries(live.urls).map(([id, src]) => [
          id,
          { status: 'ready' as const, src },
        ])
      );
      return {
        steps: live.steps,
        pictures,
        ready: true,
        missing: 0,
        rich: true,
      };
    }
    const steps = stepsFromWebTour(webTourStepsOf(set));
    const pictures: StepPictures = Object.fromEntries(
      steps.flatMap((s) => {
        if (!s.picture) return [];
        const src = urls?.get(s.id);
        return [
          [
            s.id,
            src
              ? { status: 'ready' as const, src }
              : urls === null
                ? { status: 'loading' as const }
                : { status: 'failed' as const },
          ],
        ];
      })
    );
    const missing = urls
      ? steps.filter((s) => s.picture && !urls.has(s.id)).length
      : 0;
    return { steps, pictures, ready: urls !== null, missing, rich: false };
  }, [loaded]);

  // A picture the admin couldn't see is never confirmed.
  const canConfirm =
    loaded.kind === 'ready' &&
    !!view?.ready &&
    view.missing === 0 &&
    acknowledged;
  const confirm = () => {
    if (!canConfirm || loaded.kind !== 'ready') return;
    const fingerprint = pictureFingerprint(loaded.set);
    const kind = tourKindOf(loaded.set);
    if (fingerprint !== null && kind) onConfirm({ fingerprint, kind });
  };

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
          <label className="flex min-w-0 flex-1 items-start gap-2.5 text-sm text-slate-800">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              data-testid="public-link-ack"
              className={`mt-0.5 h-4 w-4 shrink-0 rounded-sm border-slate-300 text-brand-blue-primary ${focusRing}`}
              {...tourAttr('tour-public-link.acknowledge')}
            />
            <span>{t('tourPublicLink.confirmAck')}</span>
          </label>
          <div className="flex shrink-0 items-center justify-end gap-2">
            {/* no-tour-anchor: closes the one-off confirm */}
            <button type="button" className={secondaryBtn} onClick={onCancel}>
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={confirm}
              disabled={!canConfirm}
              title={
                view && view.missing > 0
                  ? t('tourPublicLink.confirmPictureFailed')
                  : acknowledged
                    ? undefined
                    : t('tourPublicLink.confirmNeedsAck')
              }
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
        data-testid="public-link-review"
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
              renderText={view.rich ? renderStepText : undefined}
            />
          </>
        )}
      </div>
    </Modal>
  );
};
