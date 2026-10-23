// The two Web Store listings built from this code (docs/plans/CHROME_EXTENSION.md D5).

export type ListingId = 'prod' | 'dev';

export interface Listing {
  name: string;
  /** Exact page origins allowed to message the extension. */
  origins: readonly string[];
  /** Where the extension's tour calls live (WEB_TOURS_HELP_PANEL.md H7). */
  functionsBase: string;
  /** The listing's "Chrome extension" OAuth client (H8); empty until created, and no Google token until then. Keep equal to functions/src/webTourExtension.ts. */
  oauthClientId: string;
}

const LOCALHOST_PORTS = [3000, 3001, 3002, 3003, 3004];

export const LISTINGS: Record<ListingId, Listing> = {
  prod: {
    name: 'SpartBoard',
    origins: [
      'https://spartboard.web.app',
      'https://spartboard.firebaseapp.com',
    ],
    functionsBase: 'https://us-central1-spartboard.cloudfunctions.net',
    oauthClientId: '',
  },
  dev: {
    name: 'SpartBoard (dev)',
    origins: [
      'https://spartboard-dev.web.app',
      'https://spartboard-dev-bailey.web.app',
      'https://spartboard-dev.firebaseapp.com',
      ...LOCALHOST_PORTS.map((port) => `http://localhost:${port}`),
    ],
    functionsBase: 'https://us-central1-spartboard-dev.cloudfunctions.net',
    oauthClientId: '',
  },
};

export const isListingId = (value: unknown): value is ListingId =>
  value === 'prod' || value === 'dev';
