import type { ApiFailure } from '../spartboardApi';

export const FAILURE_TEXT: Record<ApiFailure, string> = {
  'signed-out': 'Sign in to Chrome with your Orono account to see tours.',
  'no-access': "Web tours aren't available for your account yet.",
  'not-set-up': "Web tours aren't set up yet.",
  'not-found': 'That tour is no longer published.',
  offline: "Tours couldn't load. Check your connection and try again.",
  'needs-update':
    'This tour needs a newer version of the SpartBoard extension. It updates on its own within a few hours, or close and reopen Chrome to get it now.',
};
