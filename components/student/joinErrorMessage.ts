export const JOIN_RELOAD_MESSAGE =
  "Couldn't join this session. Reload the page and try again.";

// Turns a joinSession failure into the message shown on the /join lobby.
export const joinErrorMessage = (error: unknown): string => {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? error.code
      : undefined;
  if (code === 'permission-denied') return JOIN_RELOAD_MESSAGE;

  let message: string;
  if (error instanceof Error) {
    message = error.message;
  } else if (typeof error === 'string') {
    message = error;
  } else {
    return 'Failed to join session due to an unexpected error.';
  }

  const lower = message.toLowerCase();
  if (lower.includes('session not found')) {
    return 'Session not found. Please check your join code.';
  }
  if (lower.includes('insufficient permissions')) return JOIN_RELOAD_MESSAGE;
  if (lower.includes('network') || lower.includes('fetch')) {
    return 'Connection error. Please check your internet.';
  }
  return message;
};
