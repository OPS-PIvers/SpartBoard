// Maps each reference token to the letters that spell it, so the player can mark letters instead of IPA (§4.5).
import { NUCLEUS_TOKENS } from './vocab';
import type { SpeakLanguage } from './types';

const NUCLEI: ReadonlySet<string> = new Set(NUCLEUS_TOKENS);
const VOWEL_LETTERS = new Set([...'aeiouyäöüáéíóúàèìòùâêîôûëïœæ']);

type Seeds = Record<string, string[]>;

// Spellings that are a sound's ordinary spelling cost nothing; anything else pays by letter class.
const SEEDS: Record<SpeakLanguage, Seeds> = {
  es: {
    p: ['p'],
    b: ['b', 'v'],
    β: ['b', 'v'],
    t: ['t'],
    d: ['d'],
    ð: ['d'],
    k: ['c', 'qu', 'k'],
    ɡ: ['g', 'gu'],
    ɣ: ['g', 'gu'],
    f: ['f'],
    θ: ['z', 'c'],
    s: ['s', 'z', 'c', 'x', 'ss'],
    x: ['j', 'g', 'x'],
    ʝ: ['y', 'll', 'hi'],
    j: ['i', 'y', 'll', 'hi'],
    ʎ: ['ll'],
    w: ['u', 'hu', 'ü', 'w'],
    tʃ: ['ch'],
    m: ['m', 'n'],
    n: ['n'],
    ɲ: ['ñ'],
    ŋ: ['n'],
    l: ['l'],
    r: ['rr', 'r'],
    ɾ: ['r'],
    i: ['y'],
  },
  de: {
    p: ['p', 'b', 'pp'],
    b: ['b', 'bb'],
    t: ['t', 'd', 'tt', 'th', 'dt'],
    d: ['d'],
    k: ['k', 'g', 'ck', 'c'],
    ɡ: ['g', 'gg'],
    f: ['f', 'v', 'ff', 'ph'],
    v: ['w', 'v'],
    s: ['s', 'ß', 'ss'],
    z: ['s'],
    ʃ: ['sch', 's'],
    ʒ: ['g', 'j'],
    ç: ['ch', 'g'],
    x: ['ch'],
    h: ['h'],
    j: ['j', 'y'],
    m: ['m', 'mm'],
    n: ['n', 'nn'],
    ŋ: ['ng', 'n'],
    l: ['l', 'll'],
    ʁ: ['r', 'rr'],
    r: ['r', 'rr'],
    ɾ: ['r', 'rr'],
    ts: ['z', 'tz', 'ts', 'c'],
    tʃ: ['tsch'],
    pf: ['pf'],
    dʒ: ['dsch', 'j', 'g'],
    ɐ: ['er', 'r'],
    ɜ: ['er'],
    aɪ: ['ei', 'ai', 'ey'],
    aʊ: ['au'],
    ɔø: ['eu', 'äu'],
    iː: ['ie', 'ieh', 'ih'],
    ɔɪ: ['eu', 'äu'],
  },
  en: {
    p: ['p', 'pp'],
    b: ['b', 'bb'],
    t: ['t', 'tt', 'th'],
    d: ['d', 'dd'],
    ɾ: ['t', 'tt', 'd', 'dd'],
    k: ['k', 'c', 'ck', 'ch', 'q', 'cc'],
    ɡ: ['g', 'gg', 'gu'],
    f: ['f', 'ff', 'ph', 'gh'],
    v: ['v'],
    θ: ['th'],
    ð: ['th'],
    s: ['s', 'ss', 'c', 'ce', 'sc'],
    z: ['s', 'z', 'zz', 'es'],
    ʃ: ['sh', 'ti', 'ci', 'ch', 's', 'ss'],
    ʒ: ['s', 'g'],
    tʃ: ['ch', 'tch', 't'],
    dʒ: ['j', 'g', 'dg', 'dge', 'ge'],
    h: ['h', 'wh'],
    m: ['m', 'mm', 'mb'],
    n: ['n', 'nn', 'kn', 'gn'],
    ŋ: ['ng', 'n'],
    l: ['l', 'll', 'le'],
    ɹ: ['r', 'rr', 'wr'],
    w: ['w', 'wh', 'u', 'o'],
    j: ['y', 'i', 'u'],
    ɚ: ['er', 'ar', 'or', 'ur', 'ir', 'r', 're', 'our', 'ure'],
    ɜː: ['er', 'ir', 'ur', 'ear', 'or'],
    ɑːɹ: ['ar', 'r'],
    ɔːɹ: ['or', 'oor', 'our', 'ar'],
    oːɹ: ['or', 'oar', 'our', 'ore'],
    ɛɹ: ['air', 'ar', 'are', 'er', 'ear'],
    ɪɹ: ['ear', 'eer', 'ere', 'ier'],
    ʊɹ: ['our', 'ure', 'oor'],
    aɪɚ: ['ire'],
    aɪə: ['ia', 'io', 'ie', 'ire'],
    aɪ: ['i', 'y', 'igh', 'ie', 'ye', 'ai', 'ei', 'uy'],
    eɪ: ['a', 'ai', 'ay', 'ei', 'ey', 'ea', 'eigh'],
    oʊ: ['o', 'oa', 'ow', 'oe', 'ou', 'ough'],
    aʊ: ['ou', 'ow', 'ough'],
    ɔɪ: ['oi', 'oy'],
    iː: ['ee', 'ea', 'e', 'ie', 'ei', 'y', 'i', 'ey'],
    uː: ['oo', 'u', 'ue', 'ew', 'o', 'ou', 'ui', 'wo'],
    əl: ['le', 'al', 'el', 'il', 'ol'],
    n̩: ['en', 'on', 'n'],
    l̩: ['le', 'l'],
  },
};

// Several tokens spelled by one letter group (`x` is k s; an initialism's letters are their names).
const GROUP_SEEDS: Record<SpeakLanguage, Record<string, string[]>> = {
  es: {
    'k s': ['x'],
    'ɡ s': ['x'],
    'k w': ['cu', 'qu'],
    'ɡ w': ['gu'],
    'j j': ['ll'],
    'ʝ ʝ': ['ll'],
  },
  de: {
    'k s': ['x', 'chs', 'cks', 'ks'],
    'k v': ['qu'],
    't s': ['z', 'tz'],
    'ɔ ø': ['eu', 'äu'],
  },
  en: {
    'k s': ['x'],
    'ɡ z': ['x'],
    'j uː': ['u', 'ew', 'eu', 'ue', 'iew'],
    'j ʊ': ['u'],
    'k w': ['qu'],
    'w ʌ': ['o'],
    'j ʊɹ': ['ur', 'eu'],
    'b iː': ['b'],
    's iː': ['c'],
    'd iː': ['d'],
    'ɛ f': ['f'],
    'dʒ iː': ['g'],
    'eɪ tʃ': ['h'],
    'dʒ eɪ': ['j'],
    'k eɪ': ['k'],
    'ɛ l': ['l'],
    'ɛ m': ['m'],
    'ɛ n': ['n'],
    'p iː': ['p'],
    'k j uː': ['q'],
    'ɛ s': ['s'],
    't iː': ['t'],
    'v iː': ['v'],
    'ɛ k s': ['x'],
    'w aɪ': ['y'],
    'z iː': ['z'],
  },
};

// Letters a language often leaves unpronounced.
const SILENT: Record<SpeakLanguage, Record<string, number>> = {
  es: { h: 0.2, u: 0.6 },
  de: { h: 0.4, e: 0.9 },
  en: {
    e: 0.4,
    h: 0.6,
    k: 0.8,
    w: 0.8,
    b: 0.8,
    g: 0.8,
    l: 0.9,
    t: 0.9,
    u: 0.7,
    a: 0.9,
    o: 0.9,
    i: 0.9,
  },
};

// A sound with no letters: an epenthetic schwa is common, any other vowel means the alignment is wrong.
const skipTokenCost = (token: string): number =>
  token === 'ə' ? 1.2 : NUCLEI.has(token) ? Infinity : 2;
const SKIP_LETTER = 1.5;
/** Average cost per token above which the alignment is a guess, so no spans are stored. */
export const MAX_COST_PER_TOKEN = 1;

interface Unit {
  key: string;
  start: number;
  end: number;
  letter: boolean;
}

function units(text: string): Unit[] {
  const out: Unit[] = [];
  const re = /\P{M}\p{M}*/gu;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const key = m[0].normalize('NFC').toLowerCase();
    out.push({
      key,
      start: m.index,
      end: m.index + m[0].length,
      letter: /\p{L}/u.test(key),
    });
  }
  return out;
}

const isVowelLetters = (s: string[]): boolean =>
  s.every((c) => VOWEL_LETTERS.has(c));
const isConsonantLetters = (s: string[]): boolean =>
  s.every((c) => !VOWEL_LETTERS.has(c));

function tokenCost(
  lang: SpeakLanguage,
  token: string,
  letters: string[]
): number {
  const spelled = letters.join('');
  if (SEEDS[lang][token]?.includes(spelled)) return 0;
  const k = letters.length;
  if (
    k === 2 &&
    letters[0] === letters[1] &&
    SEEDS[lang][token]?.includes(letters[0])
  )
    return 0.2;
  const extra = 0.3 * (k - 1);
  if (NUCLEI.has(token)) {
    if (isVowelLetters(letters)) return 0.8 + extra;
    // A vowel spelled with a trailing r or h (er, ah) is ordinary in en and de.
    if (
      isVowelLetters(letters.slice(0, -1)) &&
      'rh'.includes(letters[k - 1]) &&
      k > 1
    )
      return 1 + extra;
    return Infinity;
  }
  if (isConsonantLetters(letters)) return 1.6 + extra;
  return Infinity;
}

/** Flat [start, end) pairs per token into `text`, or null when the spelling can't be aligned confidently. */
export function computeLetterSpans(
  text: string,
  tokens: readonly string[],
  lang: SpeakLanguage
): number[] | null {
  const u = units(text);
  const n = u.length;
  const m = tokens.length;
  if (m === 0) return null;
  const cost: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(Infinity)
  );
  type Step = { di: number; dj: number };
  const step: (Step | null)[][] = Array.from({ length: n + 1 }, () =>
    new Array<Step | null>(m + 1).fill(null)
  );
  cost[0][0] = 0;
  const relax = (i: number, j: number, di: number, dj: number, c: number) => {
    const next = cost[i][j] + c;
    if (next < cost[i + di][j + dj]) {
      cost[i + di][j + dj] = next;
      step[i + di][j + dj] = { di, dj };
    }
  };
  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= m; j++) {
      if (cost[i][j] === Infinity) continue;
      if (i < n) {
        const unit = u[i];
        const silent = unit.letter
          ? (SILENT[lang][unit.key] ?? SKIP_LETTER)
          : 0;
        relax(i, j, 1, 0, silent);
      }
      if (j < m) relax(i, j, 0, 1, skipTokenCost(tokens[j]));
      const letters: string[] = [];
      for (let k = 1; k <= 4 && i + k <= n && j < m; k++) {
        if (!u[i + k - 1].letter) break;
        letters.push(u[i + k - 1].key);
        relax(i, j, k, 1, tokenCost(lang, tokens[j], letters));
        for (let g = 2; g <= 3 && j + g <= m && k <= 3; g++) {
          const group = GROUP_SEEDS[lang][tokens.slice(j, j + g).join(' ')];
          if (group?.includes(letters.join(''))) relax(i, j, k, g, 0);
        }
      }
    }
  }
  const total = cost[n][m];
  if (!Number.isFinite(total) || total / m > MAX_COST_PER_TOKEN) return null;
  const spans: number[] = new Array<number>(m * 2);
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    const s = step[i][j];
    if (!s) return null;
    const start = s.di > 0 ? u[i - s.di].start : (u[i]?.start ?? text.length);
    const end = s.di > 0 ? u[i - 1].end : start;
    for (let t = j - s.dj; t < j; t++) {
      spans[t * 2] = start;
      spans[t * 2 + 1] = end;
    }
    i -= s.di;
    j -= s.dj;
  }
  return spans;
}
