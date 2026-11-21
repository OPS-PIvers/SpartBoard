import { useContext } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/config/firebase';
import { AuthContext } from '@/context/AuthContextValue';
import type { GuidedLearningSet } from '@/types';
import type { StepsLabels } from '@/components/tours/steps/stepsModel';
import { loadPublishedTour } from '@/components/tours/publishedTours';
import { buildStepsArticle, webTourExportParts } from './stepsHtmlExport';

export const FRESHSERVICE_FEATURE = 'freshservice-sync';

/** The saved site and folder, and whether the API key secret is set. */
export interface FreshserviceStatus {
  domain: string;
  folderId: string;
  hasKey: boolean;
}

type Request =
  | { action: 'status' }
  | { action: 'save'; domain: string; folderId: string }
  | { action: 'send'; setId: string; html: string };

const call = <T>(data: Request) =>
  httpsCallable<Request, T>(functions, 'freshserviceV1', {
    timeout: 130_000,
  })(data).then((r) => r.data);

/** The FreshService flag for this admin; false outside an auth provider. */
export function useCanFreshservice(): boolean {
  const auth = useContext(AuthContext);
  return !!auth?.isAdmin && auth.canAccessFeature(FRESHSERVICE_FEATURE);
}

export const loadFreshserviceStatus = () =>
  call<FreshserviceStatus>({ action: 'status' });

export const saveFreshserviceSettings = (domain: string, folderId: string) =>
  call<FreshserviceStatus>({ action: 'save', domain, folderId });

export type SendResult =
  { kind: 'sent'; missing: number } | { kind: 'not-set-up' };

/** Sends the published steps to the tour's FreshService article; reads the published copy when none is passed. */
export async function sendTourToFreshservice(
  setId: string,
  labels: StepsLabels,
  published?: GuidedLearningSet
): Promise<SendResult> {
  // Ask first, so a site with no FreshService setup never downloads the pictures.
  const status = await loadFreshserviceStatus();
  if (!status.hasKey || !status.domain || !status.folderId)
    return { kind: 'not-set-up' };
  const set = published ?? (await loadPublishedTour(setId))?.set;
  if (!set) throw new Error('The tour is not published');
  // JPEG keeps a long tour under the callable's 10 MB request limit.
  const { steps, pictures, missing } = await webTourExportParts(
    setId,
    set,
    true
  );
  const res = await call<{ sent: boolean }>({
    action: 'send',
    setId,
    html: buildStepsArticle(steps, pictures, labels),
  });
  return res.sent ? { kind: 'sent', missing } : { kind: 'not-set-up' };
}
