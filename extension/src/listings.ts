// The two Web Store listings built from this code (docs/plans/CHROME_EXTENSION.md D5).

export type ListingId = 'prod' | 'dev';

export interface Listing {
  name: string;
  /** Exact page origins allowed to message the extension. */
  origins: readonly string[];
}

const LOCALHOST_PORTS = [3000, 3001, 3002, 3003, 3004];

export const LISTINGS: Record<ListingId, Listing> = {
  prod: {
    name: 'SpartBoard',
    origins: [
      'https://spartboard.web.app',
      'https://spartboard.firebaseapp.com',
    ],
  },
  dev: {
    name: 'SpartBoard (dev)',
    origins: [
      'https://spartboard-dev.web.app',
      'https://spartboard-dev-bailey.web.app',
      'https://spartboard-dev.firebaseapp.com',
      ...LOCALHOST_PORTS.map((port) => `http://localhost:${port}`),
    ],
  },
};

export const isListingId = (value: unknown): value is ListingId =>
  value === 'prod' || value === 'dev';
