import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isDeprecatedGeminiModelId } from '@/utils/geminiModelDeprecation';
import { normalizeModelName } from '@/functions/src/shared';

// The client mirror and the server predicate are duplicated (functions/ isn't resolvable
// from the client bundle), so edit one and both suites still pass — this is what fails.
const WELL_FORMED_MODEL_IDS = [
  'gemini-3.7-flash',
  'gemini-3.5-flash-lite',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-1.0-pro',
  'gemini-1.5-flash',
  'gemini-1.5-pro',
  'gemini-1.5-flash-8b',
  'gemini-1.5-pro-002',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-2.0-pro',
  'gemini-2.0-flash-thinking-exp',
  'gemini-3-flash-preview',
  'gemini-3.1-flash-lite-preview',
  'gemini-3.0-flash-preview-06-05',
  'gemini-3.0-pro-preview-11-2025',
  'gemini-12.0-flash',
  'gemini-4.0-previewer',
  'gemini-4.0-ultra',
];

beforeEach(() => {
  // normalizeModelName warns on every rejected id; keep the run quiet.
  vi.spyOn(console, 'warn').mockImplementation(vi.fn());
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('client/server deprecation parity', () => {
  it.each(WELL_FORMED_MODEL_IDS)('agrees on %s', (model) => {
    // normalizeModelName returns undefined only because of the deprecation
    // check for these ids — they all satisfy its shape pattern.
    const serverRejects = normalizeModelName(model) === undefined;
    expect(isDeprecatedGeminiModelId(model)).toBe(serverRejects);
  });

  it('covers both outcomes, so parity cannot pass vacuously', () => {
    const rejected = WELL_FORMED_MODEL_IDS.filter(isDeprecatedGeminiModelId);
    expect(rejected.length).toBeGreaterThan(0);
    expect(rejected.length).toBeLessThan(WELL_FORMED_MODEL_IDS.length);
  });
});
