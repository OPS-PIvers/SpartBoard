import type { ApiFailure } from '../spartboardApi';

export const FAILURE_TEXT: Record<ApiFailure, string> = {
  'signed-out': 'Sign in to Chrome with your Orono account to see tours.',
  'no-access': "Web tours aren't available for your account yet.",
  'not-set-up': "Web tours aren't set up yet.",
  'not-found': 'That tour is no longer published.',
  offline: "Tours couldn't load. Check your connection and try again.",
};
