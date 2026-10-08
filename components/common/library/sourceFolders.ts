// Pinned read-only folders for items the teacher doesn't own (LIBRARY_FOLDERS D21).
import type { LibraryFolder } from '@/types';
import type { PlacementSource } from '@/hooks/useLibraryPlacements';

const SOURCE_FOLDER_PREFIX = 'source:';

export const SOURCE_ORDER: readonly PlacementSource[] = [
  'building',
  'global',
  'plcbank',
];

export const SOURCE_LABELS: Record<
  PlacementSource,
  { folder: string; chip: string }
> = {
  building: { folder: 'From your building', chip: 'Building' },
  global: { folder: 'From the district', chip: 'District' },
  plcbank: { folder: 'From your PLCs', chip: 'PLC' },
};

export const sourceFolderId = (source: PlacementSource): string =>
  `${SOURCE_FOLDER_PREFIX}${source}`;

/** Real folder ids are Firestore ids and never contain ":". */
export const isSourceFolderId = (id: string | null | undefined): boolean =>
  id != null && id.startsWith(SOURCE_FOLDER_PREFIX);

export const sourceFolder = (source: PlacementSource): LibraryFolder => ({
  id: sourceFolderId(source),
  name: SOURCE_LABELS[source].folder,
  parentId: null,
  order: Number.MIN_SAFE_INTEGER + SOURCE_ORDER.indexOf(source),
  createdAt: 0,
  color: 'gray',
});
