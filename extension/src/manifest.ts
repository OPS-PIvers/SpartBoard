import { LISTINGS, type ListingId } from './listings.ts';

export interface Manifest {
  name: string;
  version: string;
  externally_connectable: { matches: string[] };
  [key: string]: unknown;
}

/** The base manifest with the listing's name and its exact `externally_connectable` origins. */
export function manifestFor(base: Manifest, listing: ListingId): Manifest {
  const { name, origins } = LISTINGS[listing];
  return {
    ...base,
    name,
    externally_connectable: { matches: origins.map((o) => `${o}/*`) },
  };
}
