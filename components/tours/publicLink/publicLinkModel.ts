import type { GuidedLearningSet } from '@/types';
import {
  freshTourPictureUrl,
  isWebTourSet,
  isLiveTourSet,
  webTourStepsOf,
} from '@/components/widgets/GuidedLearning/utils/liveTour';
import { liveTourStepsOf } from '@/components/tours/tourSession';
import { markupKey } from '@/components/tours/web/pictureChange';

// Mirrors functions/src/tourPublicLinkModel.ts; tests/tourPublicLinkParity.test.ts keeps the two equal.
export const PUBLIC_LINKS_DOC = 'admin_settings/tour_public_links';
export const PUBLIC_LINKS_SUBCOLLECTION = 'tours';
export const PUBLIC_TOUR_PATH = '/tour-steps/';
export const PUBLIC_TOUR_API = '/api/tour-steps';

export type PublicTourKind = 'web' | 'live';
export type PublicLinkOffReason =
  | 'pictures'
  | 'unpublished'
  | 'confirmer'
  /** An admin switched it off; the record stays so turning it on again keeps the address. */
  | 'admin';

/** The admin-only record that makes one tour public; only admins can write it (admin_settings rule). */
export interface PublicLinkRecord {
  token: string;
  /** Every picture the admin confirmed, as `pictureFingerprint` wrote it. */
  fingerprint: string;
  kind: PublicTourKind;
  confirmedBy: string;
  confirmedAt: number;
  /** Each confirmed picture's Storage generation, by object path; the function serves only these bytes. */
  pictures: Record<string, string>;
  off?: { reason: PublicLinkOffReason; at: number };
}

export const tourKindOf = (
  set: Pick<GuidedLearningSet, 'surface' | 'mode'> | null | undefined
): PublicTourKind | null =>
  !set ? null : isWebTourSet(set) ? 'web' : isLiveTourSet(set) ? 'live' : null;

/** Every picture a reader of this published tour sees (file and markup), as one comparable string; null when it isn't a tour. */
export function pictureFingerprint(
  set: GuidedLearningSet | null | undefined
): string | null {
  const kind = tourKindOf(set);
  if (!set || !kind) return null;
  const keys =
    kind === 'web'
      ? webTourStepsOf(set).flatMap((step) => {
          const pic = step.web.picture;
          return pic?.path ? [`w ${pic.path} ${markupKey(pic.markup)}`] : [];
        })
      : liveTourStepsOf(set).flatMap((step) => {
          const url = freshTourPictureUrl(step, set);
          return url ? [`l ${url}`] : [];
        });
  return ['v1', ...[...new Set(keys)].sort()].join('\n');
}

export type PublicLinkStatus =
  | { kind: 'off' }
  | { kind: 'on'; url: string }
  /** Switched off by a picture change (or an unpublish) since the confirm; it stays off until confirmed again. */
  | { kind: 'paused'; reason: Exclude<PublicLinkOffReason, 'admin'> };

/** The link's state against the tour as published now; a mismatch reads as paused before the server records it. */
export function publicLinkStatus(
  record: PublicLinkRecord | null,
  published: GuidedLearningSet | null,
  origin: string
): PublicLinkStatus {
  if (!record || record.off?.reason === 'admin') return { kind: 'off' };
  if (record.off) return { kind: 'paused', reason: record.off.reason };
  if (!published) return { kind: 'paused', reason: 'unpublished' };
  if (
    tourKindOf(published) !== record.kind ||
    pictureFingerprint(published) !== record.fingerprint
  )
    return { kind: 'paused', reason: 'pictures' };
  return { kind: 'on', url: publicTourUrl(record.token, origin) };
}

export const publicTourUrl = (token: string, origin: string): string =>
  `${origin}${PUBLIC_TOUR_PATH}${token}`;

/** The token in a `/tour-steps/{token}` path, or null. */
export function parsePublicTourPath(pathname: string): string | null {
  if (!pathname.startsWith(PUBLIC_TOUR_PATH)) return null;
  const token = pathname.slice(PUBLIC_TOUR_PATH.length).replace(/\/+$/, '');
  return /^[0-9a-f]{32}$/.test(token) ? token : null;
}

/** 128 random bits as hex: unguessable, and unrelated to the tour's id. */
export function newPublicToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
