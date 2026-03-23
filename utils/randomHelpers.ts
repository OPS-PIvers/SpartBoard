/**
 * Generates a random integer between 0 (inclusive) and max (exclusive)
 * using the Web Crypto API, while avoiding modulo bias via rejection sampling.
 * It falls back to Math.random() in environments where crypto is unavailable.
 *
 * @param max The exclusive upper bound. Must be > 0.
 * @returns A random integer in the range [0, max).
 */
export const getRandomInt = (max: number): number => {
  if (max <= 0) {
    throw new Error('max must be greater than 0');
  }

  // Fallback for environments without crypto (e.g. some test environments)
  const cryptoAPI =
    typeof globalThis !== 'undefined' && globalThis.crypto
      ? globalThis.crypto
      : typeof window !== 'undefined' && window.crypto
        ? window.crypto
        : null;

  if (!cryptoAPI || !cryptoAPI.getRandomValues) {
    return Math.floor(Math.random() * max);
  }

  const randomBuffer = new Uint32Array(1);
  const UINT32_MAX = 0xffffffff;
  const limit = Math.floor((UINT32_MAX + 1) / max) * max - 1;

  while (true) {
    cryptoAPI.getRandomValues(randomBuffer);
    const value = randomBuffer[0];
    if (value <= limit) {
      return value % max;
    }
  }
};

/**
 * Performs an unbiased Fisher-Yates shuffle on an array in-place.
 * Returns a new array to preserve immutability where desired.
 *
 * @param array The array to shuffle.
 * @returns A new array with its elements shuffled.
 */
export const shuffleArray = <T>(array: T[]): T[] => {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = getRandomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};

/**
 * Generates a random 6-character alphanumeric code suitable for session joins.
 *
 * @returns A random 6-character string.
 */
export const generateSecureSessionCode = (): string => {
  // Use crypto.randomUUID if available, else fallback to a Math.random strategy.
  const cryptoAPI =
    typeof globalThis !== 'undefined' && globalThis.crypto
      ? globalThis.crypto
      : typeof window !== 'undefined' && window.crypto
        ? window.crypto
        : null;

  if (cryptoAPI && typeof cryptoAPI.randomUUID === 'function') {
    return cryptoAPI.randomUUID().substring(0, 6).toUpperCase();
  }

  return Math.random()
    .toString(36)
    .substring(2, 8)
    .toUpperCase()
    .padEnd(6, '0');
};
