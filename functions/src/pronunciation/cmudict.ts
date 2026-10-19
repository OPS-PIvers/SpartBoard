// English cross-check against CMUDict (BSD-2-Clause, functions/data/cmudict); never a reference source, only a second opinion.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import type { StressReading } from './stressReference';

type Phone = [phone: string, stress: number];

let dict: Map<string, Phone[][]> | null = null;

export function parseCmudict(text: string): Map<string, Phone[][]> {
  const out = new Map<string, Phone[][]>();
  for (const raw of text.split('\n')) {
    const line = raw.split('#')[0].trim();
    if (!line) continue;
    const [head, ...phones] = line.split(/\s+/);
    const word = head.replace(/\(\d+\)$/, '');
    const parsed: Phone[] = phones.map((p) => {
      const m = /^([A-Z]+)(\d)?$/.exec(p);
      if (!m) throw new Error(`Unrecognised CMUDict phone ${p} in ${head}`);
      return [m[1], m[2] ? Number(m[2]) : 0];
    });
    const variants = out.get(word);
    if (variants) variants.push(parsed);
    else out.set(word, [parsed]);
  }
  return out;
}

// Resolves from both src/pronunciation (tests) and lib/pronunciation (deployed).
const DICT_PATH = join(
  __dirname,
  '..',
  '..',
  'data',
  'cmudict',
  'cmudict.dict.gz'
);

function loadDict(): Map<string, Phone[][]> {
  dict ??= parseCmudict(gunzipSync(readFileSync(DICT_PATH)).toString('utf8'));
  return dict;
}

export function lookupCmudict(word: string): Phone[][] | null {
  return loadDict().get(word.toLowerCase()) ?? null;
}

const VOWELS = new Set([
  'IY',
  'IH',
  'EH',
  'AE',
  'AA',
  'AO',
  'UH',
  'UW',
  'AH',
  'ER',
  'EY',
  'OW',
  'AY',
  'AW',
  'OY',
]);

/** CMUDict's stress readings for the spike's R1 cross-check: union of primaries over variants with espeak's syllable count. */
export function cmudictStress(
  variants: readonly Phone[][],
  syllableCount: number
): StressReading {
  const readings = variants.map((v) => {
    const vowels = v.filter(([p]) => VOWELS.has(p));
    return {
      syllableCount: vowels.length,
      primary: vowels.flatMap(([, s], i) => (s === 1 ? [i + 1] : [])),
    };
  });
  const matching = readings.filter((r) => r.syllableCount === syllableCount);
  if (matching.length === 0) return readings[0];
  return { syllableCount, primary: matching.flatMap((r) => r.primary) };
}

const DIGRAPHS: Record<string, string> = {
  tʃ: 'CH',
  dʒ: 'JH',
  eɪ: 'EY',
  aɪ: 'AY',
  aʊ: 'AW',
  ɔɪ: 'OY',
  oʊ: 'OW',
};
const SINGLE: Record<string, string> = {
  p: 'P',
  b: 'B',
  t: 'T',
  d: 'D',
  k: 'K',
  ɡ: 'G',
  f: 'F',
  v: 'V',
  θ: 'TH',
  ð: 'DH',
  s: 'S',
  z: 'Z',
  ʃ: 'SH',
  ʒ: 'ZH',
  h: 'HH',
  m: 'M',
  n: 'N',
  ŋ: 'NG',
  l: 'L',
  ɹ: 'R',
  r: 'R',
  w: 'W',
  j: 'Y',
  ɾ: 'T',
  ʔ: 'T',
  x: 'K',
  ɬ: 'L',
  i: 'IY',
  ɪ: 'IH',
  ɛ: 'EH',
  e: 'EH',
  æ: 'AE',
  ɑ: 'AA',
  ɔ: 'AO',
  ʊ: 'UH',
  u: 'UW',
  ʌ: 'AH',
  ə: 'AH',
  ɐ: 'AH',
  ɜ: 'ER',
  ɚ: 'ER',
  ᵻ: 'IH',
  a: 'AE',
  o: 'OW',
};
const DROPPED = new Set([...'ː̩̃ʲ‍']);

/** espeak IPA as ARPAbet phones (the probe's `score2.esp_phones`, stress dropped). */
function espeakPhones(ipa: string): string[] {
  const out: string[] = [];
  const chars = [...ipa];
  for (let i = 0; i < chars.length;) {
    const c = chars[i];
    if (c === 'ˈ' || c === 'ˌ' || DROPPED.has(c)) {
      i++;
      continue;
    }
    const pair = DIGRAPHS[c + (chars[i + 1] ?? '')];
    const phone = pair ?? SINGLE[c];
    i += pair ? 2 : 1;
    if (phone) out.push(phone);
  }
  return out;
}

// The probe's reduced class: unstressed-vowel quality isn't a contrast a learner is scored on.
const REDUCED = new Set(['AH', 'IH', 'IY', 'UH', 'ER']);

/** The probe's "+ vowel reduction" metric (92.7% agreement on the top 10k): notation conventions don't count. */
function practiceForm(phones: readonly string[]): string {
  const mapped = phones.map((p, i) => {
    const next = phones[i + 1] ?? '';
    if (p === 'NG' && (next === 'K' || next === 'G')) return 'N';
    if (p === 'T' || p === 'D') return 'TD';
    if ((p === 'OW' || p === 'AA' || p === 'AO') && next === 'R') return 'OHR';
    if (p === 'AA' || p === 'AO') return 'LOT';
    return p;
  });
  const collapsed: string[] = [];
  for (const p of mapped) {
    const prev = collapsed[collapsed.length - 1];
    if (prev && ((prev === 'ER' && p === 'R') || (prev === 'R' && p === 'R')))
      continue;
    collapsed.push(p);
  }
  // The ex- prefix is EH or IH by speaker, not by error.
  if (collapsed[0] === 'EH' && (collapsed[1] === 'K' || collapsed[1] === 'G'))
    collapsed[0] = 'IH';
  return collapsed.map((p) => (REDUCED.has(p) ? 'V' : p)).join(' ');
}

/** True when espeak's segments match no CMUDict variant once notation differences are normalised. */
export function disagreesWithCmudict(
  espeakIpa: string,
  variants: readonly Phone[][]
): boolean {
  const ours = practiceForm(espeakPhones(espeakIpa));
  return !variants.some((v) => practiceForm(v.map(([p]) => p)) === ours);
}
