// The two Web Store listings built from this code (docs/plans/CHROME_EXTENSION.md D5).

export type ListingId = 'prod' | 'dev';

export interface Listing {
  name: string;
  /** Exact page origins allowed to message the extension. */
  origins: readonly string[];
  /** Where the extension's tour calls live (WEB_TOURS_HELP_PANEL.md H7). */
  functionsBase: string;
  /** The listing's "Chrome extension" OAuth client (H8); keep equal to functions/src/webTourExtension.ts. */
  oauthClientId: string;
  /** Public half of the project's focus-push VAPID key (F5); empty until FS5 sets it, so devices only poll. */
  vapidPublicKey: string;
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
    oauthClientId:
      '759666600376-3588aon892pctctjtosfpurqksup9hk5.apps.googleusercontent.com',
    vapidPublicKey: '',
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
    oauthClientId:
      '258543092004-9mfh4nls8a7edmift5dkh9l93jp7pdk1.apps.googleusercontent.com',
    vapidPublicKey: '',
  },
};

export const isListingId = (value: unknown): value is ListingId =>
  value === 'prod' || value === 'dev';
