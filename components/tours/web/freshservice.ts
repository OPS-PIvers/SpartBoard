import { useContext } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/config/firebase';
import { AuthContext } from '@/context/AuthContextValue';
import type { GuidedLearningSet } from '@/types';
import type { StepsLabels } from '@/components/tours/steps/stepsModel';
import { loadPublishedTour } from '@/components/tours/publishedTours';
import {
  articleExtrasOf,
  buildStepsArticle,
  webTourExportParts,
} from './stepsHtmlExport';
import { useTourAuthor } from './useTourAuthor';

export const FRESHSERVICE_FEATURE = 'freshservice-sync';

/** The saved site and folder, and whether the API key secret is set. */
export interface FreshserviceStatus {
  domain: string;
  folderId: string;
  hasKey: boolean;
}

/** Who can see a new folder: 1 everyone, 2 signed-in users, 3 agents only. */
export type FreshserviceVisibility = 1 | 2 | 3;

/** Where one tour's article goes and how it is labelled. */
export interface ArticleOptions {
  folderId: string;
  tags: string[];
  keywords: string[];
}

export interface FreshserviceFolder {
  id: string;
  name: string;
  visibility: number;
}

export interface FreshserviceCategory {
  id: string;
  name: string;
  folders: FreshserviceFolder[];
}

/** The site's categories and folders, plus what this tour last used. */
export interface FreshserviceCatalog {
  ready: boolean;
  categories: FreshserviceCategory[];
  defaultFolderId: string;
  saved: ArticleOptions | null;
}

type Request =
  | { action: 'status' }
  | { action: 'save'; domain: string; folderId: string }
  | { action: 'catalog'; setId: string }
  | { action: 'createCategory'; name: string }
  | {
      action: 'createFolder';
      categoryId: string;
      name: string;
      visibility: FreshserviceVisibility;
    }
  | { action: 'send'; setId: string; html: string; options?: ArticleOptions };

const call = <T>(data: Request) =>
  httpsCallable<Request, T>(functions, 'freshserviceV1', {
    timeout: 130_000,
  })(data).then((r) => r.data);

/** May this person send tours to FreshService: an admin with the flag, or a tour author while it is on. */
export function useCanFreshservice(): boolean {
  const access = useTourAuthor();
  return access.author && access.passes(FRESHSERVICE_FEATURE);
}

/** The saved site and folder stay with admins (WEB_TOUR_AUTHORS.md B5); false outside an auth provider. */
export function useCanFreshserviceSettings(): boolean {
  const auth = useContext(AuthContext);
  return !!auth?.isAdmin && auth.canAccessFeature(FRESHSERVICE_FEATURE);
}

export const loadFreshserviceStatus = () =>
  call<FreshserviceStatus>({ action: 'status' });

export const saveFreshserviceSettings = (domain: string, folderId: string) =>
  call<FreshserviceStatus>({ action: 'save', domain, folderId });

/** Comma-separated words as a list, blanks dropped. */
export const termsOf = (text: string): string[] =>
  text
    .split(',')
    .map((t) => t.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

export const loadFreshserviceCatalog = (setId: string) =>
  call<FreshserviceCatalog>({ action: 'catalog', setId });

export const createFreshserviceCategory = (name: string) =>
  call<{ id: string | null }>({ action: 'createCategory', name });

export const createFreshserviceFolder = (
  categoryId: string,
  name: string,
  visibility: FreshserviceVisibility
) =>
  call<{ id: string | null }>({
    action: 'createFolder',
    categoryId,
    name,
    visibility,
  });

export type SendResult =
  { kind: 'sent'; missing: number } | { kind: 'not-set-up' };

/** Sends the published steps to the tour's FreshService article; without options it keeps the tour's last folder and labels. */
export async function sendTourToFreshservice(
  setId: string,
  labels: StepsLabels,
  published?: GuidedLearningSet,
  options?: ArticleOptions
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
    html: buildStepsArticle(steps, pictures, labels, articleExtrasOf(set)),
    ...(options ? { options } : {}),
  });
  return res.sent ? { kind: 'sent', missing } : { kind: 'not-set-up' };
}
