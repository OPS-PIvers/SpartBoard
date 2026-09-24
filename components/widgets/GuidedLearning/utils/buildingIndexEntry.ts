import type {
  GuidedLearningBuildingSetIndex,
  GuidedLearningMode,
} from '@/types';

// Client twin of functions/src/glBuildingIndex.ts buildGlBuildingIndexEntry; both run glBuildingIndex.cases.json.
export const BUILDING_INDEX_META_ID = '_meta';
export const BUILDING_INDEX_CONTROL_IDS: ReadonlySet<string> = new Set([
  BUILDING_INDEX_META_ID,
  '_lock',
]);

const MODES = new Set<string>(['structured', 'guided', 'explore']);

const num = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;

// The 400px thumbnail written beside a Storage slide, when there is one.
function storedThumbnail(
  d: Record<string, unknown>,
  url: string
): string | null {
  const thumbs = d.slideThumbnails;
  if (!thumbs || typeof thumbs !== 'object') return null;
  const thumb = (thumbs as Record<string, unknown>)[url];
  return typeof thumb === 'string' ? thumb : null;
}

function pickThumbnail(d: Record<string, unknown>): string {
  const urls = Array.isArray(d.imageUrls) ? (d.imageUrls as unknown[]) : [];
  const kinds = Array.isArray(d.imageKinds) ? (d.imageKinds as unknown[]) : [];
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    if ((kinds[i] ?? 'image') !== 'video' && typeof url === 'string') {
      return storedThumbnail(d, url) ?? url;
    }
  }
  return '';
}

export function buildBuildingIndexEntry(
  id: string,
  data: unknown
): GuidedLearningBuildingSetIndex | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  const steps = Array.isArray(d.steps) ? (d.steps as unknown[]) : [];
  const updatedAt = num(d.updatedAt, 0);
  return {
    id,
    title: typeof d.title === 'string' ? d.title : '',
    description: typeof d.description === 'string' ? d.description : null,
    stepCount: steps.length,
    mode:
      typeof d.mode === 'string' && MODES.has(d.mode)
        ? (d.mode as GuidedLearningMode)
        : 'structured',
    thumbnail: pickThumbnail(d),
    createdAt: num(d.createdAt, updatedAt),
    updatedAt,
    hasLiveTour:
      typeof d.hasLiveTour === 'boolean'
        ? d.hasLiveTour
        : steps.some(
            (s) =>
              !!s && typeof s === 'object' && !!(s as { tour?: unknown }).tour
          ),
    isHelpCenter: d.helpCenter === true,
    folderId: typeof d.folderId === 'string' ? d.folderId : null,
    order: typeof d.order === 'number' ? d.order : null,
  };
}
