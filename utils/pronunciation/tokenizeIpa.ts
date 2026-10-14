// espeak IPA → the model's 392-token alphabet (#2383): validates, never passes unknown text through.
import vocab from './xlsr53EspeakVocab.json';
import { isNucleus } from './stress';

const PRIMARY_MARK = 'ˈ';
const SECONDARY_MARK = 'ˌ';
const ZWJ = '‍';
const SPECIAL = new Set(['<s>', '<pad>', '</s>', '<unk>']);
// espeak writes `?` for a phoneme with no IPA (German UR); the vocab's `??` is that sentinel, not a sound.
const UNRENDERABLE = '?';
const LANGUAGE_SWITCH = /\(([a-z]{2,3}(?:-[a-z0-9]+)?)\)/gi;

const TOKENS: readonly string[] = Object.keys(vocab)
  .filter((t) => !SPECIAL.has(t) && !t.includes(UNRENDERABLE))
  .sort((a, b) => b.length - a.length);
const MAX_TOKEN_LENGTH = TOKENS[0]?.length ?? 1;
const TOKEN_SET: ReadonlySet<string> = new Set(TOKENS);

export type TokenizeFailure =
  | { ok: false; reason: 'unrenderable' }
  | { ok: false; reason: 'untokenizable'; at: number; rest: string }
  | { ok: false; reason: 'empty' };

export interface TokenizeSuccess {
  ok: true;
  tokens: string[];
  // Syllables in the model's nucleus space, the index space stress is scored in (S2).
  syllableCount: number;
  // 1-based syllables carrying ˈ; ˌ is discarded (S1).
  primary: number[];
  // Languages espeak switched into, e.g. `en` for a loanword in a German item; the teacher confirms these.
  languageSwitches: string[];
}

export type TokenizeResult = TokenizeSuccess | TokenizeFailure;

/** Fewest tokens covering the whole string, longest-first on ties; unlike greedy matching it finds `j uː` for `juː`. */
function segment(s: string): string[] | number {
  const best = new Array<number>(s.length + 1).fill(Infinity);
  const choice = new Array<string>(s.length).fill('');
  best[s.length] = 0;
  for (let i = s.length - 1; i >= 0; i--) {
    for (let len = Math.min(MAX_TOKEN_LENGTH, s.length - i); len >= 1; len--) {
      const t = s.slice(i, i + len);
      if (TOKEN_SET.has(t) && best[i + len] + 1 < best[i]) {
        best[i] = best[i + len] + 1;
        choice[i] = t;
      }
    }
  }
  if (best[0] === Infinity) return firstUnreachable(s);
  const out: string[] = [];
  for (let i = 0; i < s.length; i += choice[i].length) out.push(choice[i]);
  return out;
}

/** Earliest index no valid tokenization can step past, for the error report. */
function firstUnreachable(s: string): number {
  const reachable = new Array<boolean>(s.length + 1).fill(false);
  reachable[0] = true;
  let furthest = 0;
  for (let i = 0; i < s.length; i++) {
    if (!reachable[i]) continue;
    for (let len = 1; len <= Math.min(MAX_TOKEN_LENGTH, s.length - i); len++) {
      if (TOKEN_SET.has(s.slice(i, i + len))) {
        reachable[i + len] = true;
        furthest = Math.max(furthest, i + len);
      }
    }
  }
  return furthest;
}

/** One word of espeak `--ipa=3` output; a failure carries no tokens so nothing partial can be stored. */
export function tokenizeIpa(ipa: string): TokenizeResult {
  const languageSwitches: string[] = [];
  let s = ipa.normalize('NFC').replaceAll(ZWJ, '').trim();
  // A marker followed by phonemes switched G2P; a trailing one (`(de)` in `(en)bˈeɪbi(de)`) only switches back.
  s = s.replace(
    LANGUAGE_SWITCH,
    (marker: string, lang: string, offset: number) => {
      const code = lang.toLowerCase();
      const switchesBack = offset + marker.length >= s.length;
      if (!switchesBack && !languageSwitches.includes(code))
        languageSwitches.push(code);
      return '';
    }
  );
  if (s.includes(UNRENDERABLE)) return { ok: false, reason: 'unrenderable' };

  // Stress marks sit on espeak's syllable boundaries, so no token may span one (`xenjˈal` is `j a`, not `ja`).
  const chunks: { text: string; primaryBefore: boolean }[] = [];
  let primaryBefore = false;
  let current = '';
  const flush = () => {
    if (current) chunks.push({ text: current, primaryBefore });
    current = '';
    primaryBefore = false;
  };
  for (const ch of s) {
    if (ch === PRIMARY_MARK || ch === SECONDARY_MARK || /\s/.test(ch)) {
      flush();
      if (ch === PRIMARY_MARK) primaryBefore = true;
    } else {
      current += ch;
    }
  }
  flush();
  if (chunks.length === 0) return { ok: false, reason: 'empty' };

  const tokens: string[] = [];
  const primary: number[] = [];
  let consumed = 0;
  let syllableCount = 0;
  let pendingPrimary = false;
  for (const chunk of chunks) {
    const chunkTokens = segment(chunk.text);
    if (typeof chunkTokens === 'number') {
      const rest = chunks
        .map((c) => c.text)
        .join('')
        .slice(consumed + chunkTokens);
      return {
        ok: false,
        reason: 'untokenizable',
        at: consumed + chunkTokens,
        rest,
      };
    }
    // A primary mark names the next nucleus; one with no nucleus after it is dropped (R1 guard).
    pendingPrimary ||= chunk.primaryBefore;
    for (const t of chunkTokens) {
      if (!isNucleus(t)) continue;
      syllableCount++;
      if (pendingPrimary && !primary.includes(syllableCount))
        primary.push(syllableCount);
      pendingPrimary = false;
    }
    tokens.push(...chunkTokens);
    consumed += chunk.text.length;
  }

  return { ok: true, tokens, syllableCount, primary, languageSwitches };
}
