import { LISTINGS, type ListingId } from './listings.ts';

export interface Manifest {
  name: string;
  version: string;
  externally_connectable: { matches: string[] };
  [key: string]: unknown;
}

export const OAUTH_SCOPES = ['https://www.googleapis.com/auth/userinfo.email'];

/** The base manifest with the listing's name, its exact `externally_connectable` origins and its OAuth client once it has one. */
export function manifestFor(base: Manifest, listing: ListingId): Manifest {
  const { name, origins, oauthClientId } = LISTINGS[listing];
  return {
    ...base,
    name,
    externally_connectable: { matches: origins.map((o) => `${o}/*`) },
    ...(oauthClientId
      ? { oauth2: { client_id: oauthClientId, scopes: OAUTH_SCOPES } }
      : {}),
  };
}
