// Poll join-code alphabet and canonicalization, mirroring `utils/quizCode.ts`.

export const POLL_CODE_LENGTH = 5;

// No 0/O, 1/I/L, 5/S, 2/Z, or 8/B — a code read off a projector must be typable.
const POLL_CODE_ALPHABET = 'ACDEFGHJKMNPQRTUVWXY34679';

/** Trim, strip non-alphanumerics, uppercase — run on every code before lookup. */
export const normalizePollCode = (code: string): string =>
  code
    .trim()
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase();

/**
 * Cryptographically random join code. Rejection-samples so every character in
 * the alphabet is equally likely rather than biased by the modulo remainder.
 */
export const generatePollCode = (length: number = POLL_CODE_LENGTH): string => {
  const cryptoObj = globalThis.crypto;
  if (!cryptoObj?.getRandomValues) {
    throw new Error(
      'No secure random source available — Web Crypto API is required to generate poll join codes.'
    );
  }
  const alphabetSize = POLL_CODE_ALPHABET.length;
  const ceiling = 256 - (256 % alphabetSize);
  let code = '';
  while (code.length < length) {
    const bytes = new Uint8Array(length);
    cryptoObj.getRandomValues(bytes);
    for (const byte of bytes) {
      if (byte >= ceiling) continue;
      code += POLL_CODE_ALPHABET[byte % alphabetSize];
      if (code.length === length) break;
    }
  }
  return code;
};

/** Participant join URL for a code — short enough to read aloud or QR cleanly. */
export const buildPollJoinUrl = (code: string): string =>
  `${window.location.origin}/poll?code=${code}`;
