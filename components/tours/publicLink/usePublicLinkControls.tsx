import React, { useContext, useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe, Link2 } from 'lucide-react';
import type { GuidedLearningSet } from '@/types';
import { AuthContext } from '@/context/AuthContextValue';
import { Toggle } from '@/components/common/Toggle';
import { focusRing } from '@/components/common/lightChrome';
import { tourAttr } from '@/config/tourAnchors';
import { logError } from '@/utils/logError';
import {
  publicLinkStatus,
  type PublicLinkRecord,
  type PublicLinkStatus,
} from './publicLinkModel';
import {
  publicLinkDevSeed,
  turnOffPublicLink,
  turnOnPublicLink,
  watchPublicLink,
} from './publicLinkStore';
import {
  PublicLinkConfirm,
  type PublicLinkConfirmation,
} from './PublicLinkConfirm';

export interface PublicLinkControls {
  /** The ⋯ menu's footer; null when the steps-view flag is off, so nothing new shows. */
  footer: React.ReactNode | null;
  /** The second confirm; rendered outside the menu so closing the menu never closes it. */
  dialog: React.ReactNode;
  /** A short part for the editor's status line. */
  statusNote: { text: string; tone: 'public' | 'warn' } | null;
  /** The public address while the link is on, for Copy link. */
  publicUrl: string | null;
  status: PublicLinkStatus;
}

const linkBtn = `inline-flex min-h-8 items-center gap-1.5 self-start rounded-md px-1.5 text-sm font-semibold text-brand-blue-primary hover:bg-brand-blue-lighter ${focusRing}`;

/** The public-link switch (TOURS_10X.md S6) for one tour: admins only, a second confirm to turn on, one click to turn off. */
export function usePublicLinkControls({
  setId,
  published,
  menuCopies = false,
}: {
  setId: string;
  /** The editor's own Copy link item copies the public link, so the footer doesn't repeat it. */
  menuCopies?: boolean;
  /** The published copy; undefined while it loads, null when the tour isn't published. */
  published: GuidedLearningSet | null | undefined;
}): PublicLinkControls {
  const { t } = useTranslation();
  // Read without throwing: a screen without auth simply has no switch.
  const auth = useContext(AuthContext);
  const seed = publicLinkDevSeed();
  const admin = seed ? seed.admin !== false : auth?.isAdmin === true;
  const enabled = auth?.canAccessFeature?.('tour-steps-view') ?? false;
  const [watched, setWatched] = useState<{
    setId: string;
    record: PublicLinkRecord | null;
  } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const reasonId = useId();

  useEffect(() => {
    if (!admin || !enabled) return;
    return watchPublicLink(
      setId,
      (record) => setWatched({ setId, record }),
      () => setWatched({ setId, record: null })
    );
  }, [setId, admin, enabled]);

  const record = watched?.setId === setId ? watched.record : null;
  const loaded = watched?.setId === setId;
  const publishedNow =
    seed?.published && setId in seed.published
      ? seed.published[setId]
      : published;
  const status = publicLinkStatus(
    record,
    publishedNow ?? null,
    window.location.origin
  );
  const on = status.kind === 'on';

  const turnOff = async () => {
    setBusy(true);
    try {
      await turnOffPublicLink(setId);
      setMessage(t('tourPublicLink.turnedOff'));
    } catch (err) {
      logError('publicLink.off', err, { setId });
      setMessage(t('tourPublicLink.failed'));
    } finally {
      setBusy(false);
    }
  };

  const turnOn = async (confirmed: PublicLinkConfirmation) => {
    setConfirming(false);
    setBusy(true);
    try {
      await turnOnPublicLink(setId, {
        ...confirmed,
        email: auth?.user?.email ?? '',
        previous: record,
      });
      setMessage(t('tourPublicLink.turnedOn'));
    } catch (err) {
      logError('publicLink.on', err, { setId });
      setMessage(t('tourPublicLink.failed'));
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (status.kind !== 'on') return;
    try {
      await navigator.clipboard.writeText(status.url);
      setMessage(t('tourPublicLink.copied'));
    } catch (err) {
      logError('publicLink.copy', err, { setId });
    }
  };

  if (!enabled)
    return {
      footer: null,
      dialog: null,
      statusNote: null,
      publicUrl: null,
      status,
    };

  const reason = !admin
    ? t('tourPublicLink.notAdmin')
    : status.kind === 'paused'
      ? null
      : publishedNow === null
        ? t('tourPublicLink.unpublished')
        : null;
  const canSwitch = admin && loaded && !busy && !!publishedNow;
  const label = t('tourPublicLink.label');

  const footer = (
    <div
      data-testid="public-link"
      data-status={status.kind}
      className="flex flex-col gap-1.5"
    >
      <div className="flex min-h-8 items-center gap-2">
        <Globe className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
        <span className="min-w-0 flex-1 text-sm font-medium text-slate-800">
          {label}
        </span>
        <Toggle
          checked={on}
          onChange={(next) => (next ? setConfirming(true) : void turnOff())}
          disabled={!canSwitch}
          size="sm"
          showLabels={false}
          label={label}
          describedBy={reason ? reasonId : undefined}
          anchor={tourAttr('tour-public-link.switch')}
        />
      </div>
      {reason && (
        <p
          id={reasonId}
          data-testid="public-link-reason"
          className="text-xs text-slate-600"
        >
          {reason}
        </p>
      )}
      {status.kind === 'paused' && admin && (
        <>
          <p
            data-testid="public-link-paused"
            className="text-xs font-medium text-amber-800"
          >
            {t(
              status.reason === 'pictures'
                ? 'tourPublicLink.pausedPictures'
                : 'tourPublicLink.pausedUnpublished'
            )}
          </p>
          {publishedNow && (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className={linkBtn}
              {...tourAttr('tour-public-link.review')}
            >
              {t('tourPublicLink.review')}
            </button>
          )}
        </>
      )}
      {on && !menuCopies && (
        <button
          type="button"
          onClick={() => void copy()}
          className={linkBtn}
          {...tourAttr('tour-public-link.copy')}
        >
          <Link2 className="h-4 w-4" aria-hidden="true" />
          {t('tourPublicLink.copy')}
        </button>
      )}
      <p aria-live="polite" className="sr-only">
        {message}
      </p>
    </div>
  );

  return {
    footer,
    dialog: confirming ? (
      <PublicLinkConfirm
        setId={setId}
        onCancel={() => setConfirming(false)}
        onConfirm={(c) => void turnOn(c)}
      />
    ) : null,
    statusNote:
      status.kind === 'on'
        ? { text: t('tourPublicLink.statusOn'), tone: 'public' }
        : status.kind === 'paused' && admin
          ? { text: t('tourPublicLink.statusPaused'), tone: 'warn' }
          : null,
    publicUrl: on ? status.url : null,
    status,
  };
}
