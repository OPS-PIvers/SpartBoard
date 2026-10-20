// Speak likelihood scorer (S11c, prototype gop2.mjs): CTC forward scores of each one-sound change; pure, no I/O.
import type { SpeakLanguage } from '@/types';
import {
  PRONUNCIATION_GROUPS,
  RECOGNIZER_TOLERANCE,
  type PronunciationPair,
} from '@/config/pronunciationGroups';
import {
  CHARITABLE_WINDOW,
  FORGIVEN_GROUP_CUTOFF,
  REQUIRED_GROUP_CUTOFF,
  SCORING_CANDIDATES,
  SWAP_CUTOFF,
} from '@/config/pronunciationScoring';
import { PRONUNCIATION_VARIANTS } from '@/config/pronunciationVariants';
import { PRONUNCIATION_MODEL } from '@/config/pronunciationModel';
import vocab from './xlsr53EspeakVocab.json';
import type { AlignmentEntry } from './score';

/** Per-frame log-softmax of the model output, flat [frames × vocabSize]. */
export interface SpeakLogProbs {
  data: Float32Array;
  frames: number;
  vocabSize: number;
}

/** One alternative reading of a reference sound; `spoken` null drops it. `lead` is how many nats likelier the take gets. */
export interface SoundReading {
  spoken: string | null;
  lead: number;
}

const VOCAB: Readonly<Record<string, number>> = vocab;
const BLANK = PRONUNCIATION_MODEL.padId;
const NEG = -Infinity;

const lse = (a: number, b: number): number => {
  if (a === NEG) return b;
  if (b === NEG) return a;
  return a > b
    ? a + Math.log1p(Math.exp(b - a))
    : b + Math.log1p(Math.exp(a - b));
};

/** Log-softmax over each frame of raw logits. */
export function logSoftmax(
  logits: Float32Array,
  frames: number,
  vocabSize: number
): Float32Array {
  const out = new Float32Array(frames * vocabSize);
  for (let t = 0; t < frames; t++) {
    const base = t * vocabSize;
    let max = NEG;
    for (let k = 0; k < vocabSize; k++) max = Math.max(max, logits[base + k]);
    let sum = 0;
    for (let k = 0; k < vocabSize; k++) sum += Math.exp(logits[base + k] - max);
    const logZ = max + Math.log(sum);
    for (let k = 0; k < vocabSize; k++) out[base + k] = logits[base + k] - logZ;
  }
  return out;
}

const tokenIds = (tokens: readonly string[]): number[] | null => {
  const ids: number[] = [];
  for (const t of tokens) {
    const id = VOCAB[t];
    if (id === undefined) return null;
    ids.push(id);
  }
  return ids;
};

// CTC label sequence with blanks between and around the tokens.
const extend = (ids: readonly number[]): Int32Array => {
  const ext = new Int32Array(2 * ids.length + 1).fill(BLANK);
  ids.forEach((id, i) => (ext[2 * i + 1] = id));
  return ext;
};

/** CTC forward pass from state `from` on; earlier states come from `prefix`, a pass over labels that agree there. */
function forward(
  lp: SpeakLogProbs,
  ext: Int32Array,
  from: number,
  prefix: { alpha: Float64Array; width: number } | null
): { alpha: Float64Array; score: number } {
  const { data, frames, vocabSize } = lp;
  const S = ext.length;
  const W = S - from;
  const alpha = new Float64Array(frames * W).fill(NEG);
  const at = (t: number, s: number): number =>
    s < from
      ? prefix
        ? prefix.alpha[t * prefix.width + s]
        : NEG
      : alpha[t * W + s - from];
  for (let s = from; s < Math.min(S, 2); s++) alpha[s - from] = data[ext[s]];
  for (let t = 1; t < frames; t++) {
    const row = t * vocabSize;
    for (let s = from; s < S; s++) {
      let v = at(t - 1, s);
      if (s > 0) v = lse(v, at(t - 1, s - 1));
      if (s > 1 && ext[s] !== BLANK && ext[s] !== ext[s - 2])
        v = lse(v, at(t - 1, s - 2));
      if (v !== NEG) alpha[t * W + s - from] = v + data[row + ext[s]];
    }
  }
  const last = frames - 1;
  const score = S > 1 ? lse(at(last, S - 1), at(last, S - 2)) : at(last, 0);
  return { alpha, score };
}

/** Total CTC log-likelihood of a token sequence; -Infinity when a token is outside the vocabulary. */
export function ctcLogLikelihood(
  lp: SpeakLogProbs,
  tokens: readonly string[]
): number {
  const ids = tokenIds(tokens);
  if (!ids || lp.frames === 0) return NEG;
  return forward(lp, extend(ids), 0, null).score;
}

const cache = new WeakMap<Float32Array, Map<string, SoundReading[][] | null>>();

/** Per reference sound, each candidate swap's or the drop's lead; null for an out-of-vocabulary token or empty take. */
export function scoreReference(
  lp: SpeakLogProbs,
  tokens: readonly string[],
  candidates: readonly string[]
): SoundReading[][] | null {
  const key = `${tokens.join(' ')}|${candidates.join(' ')}`;
  let memo = cache.get(lp.data);
  if (!memo) {
    memo = new Map();
    cache.set(lp.data, memo);
  }
  const hit = memo.get(key);
  if (hit !== undefined) return hit;
  const result = scoreReferenceUncached(lp, tokens, candidates);
  memo.set(key, result);
  return result;
}

function scoreReferenceUncached(
  lp: SpeakLogProbs,
  tokens: readonly string[],
  candidates: readonly string[]
): SoundReading[][] | null {
  const ids = tokenIds(tokens);
  if (!ids || ids.length === 0 || lp.frames === 0) return null;
  const ext = extend(ids);
  const base = forward(lp, ext, 0, null);
  const prefix = { alpha: base.alpha, width: ext.length };
  const lead = (score: number) =>
    base.score === NEG ? (score === NEG ? NEG : Infinity) : score - base.score;
  const candidateIds = candidates
    .map((c) => [c, VOCAB[c]] as const)
    .filter((c): c is readonly [string, number] => c[1] !== undefined);

  return ids.map((id, i) => {
    const readings: SoundReading[] = [];
    const from = 2 * i + 1;
    for (const [spoken, cid] of candidateIds) {
      if (cid === id) continue;
      const swapped = ext.slice();
      swapped[from] = cid;
      readings.push({
        spoken,
        lead: lead(forward(lp, swapped, from, prefix).score),
      });
    }
    if (ids.length > 1) {
      const dropped = extend([...ids.slice(0, i), ...ids.slice(i + 1)]);
      readings.push({
        spoken: null,
        lead: lead(forward(lp, dropped, from, prefix).score),
      });
    }
    return readings;
  });
}

/** The sounds tried in place of each reference sound: the language's inventory plus the card's own espeak sounds. */
export function scoringCandidates(
  language: SpeakLanguage,
  ownTokens: Iterable<string>
): string[] {
  const set = new Set(SCORING_CANDIDATES[language]);
  for (const t of ownTokens) set.add(t);
  return [...set].filter((t) => VOCAB[t] !== undefined);
}

const pairMatches = (
  pair: PronunciationPair,
  target: string,
  spoken: string,
  position: number,
  last: number
) =>
  pair.target === target &&
  pair.spoken === spoken &&
  (!pair.final || position === last);

type PairKind = 'tolerated' | 'forgiven' | 'required' | null;

function pairKind(
  language: SpeakLanguage,
  effective: Readonly<Record<string, 'forgive' | 'require'>>,
  target: string,
  spoken: string | null,
  position: number,
  last: number
): PairKind {
  if (spoken === null) return null;
  if (
    RECOGNIZER_TOLERANCE[language].some((p) =>
      pairMatches(p, target, spoken, position, last)
    )
  )
    return 'tolerated';
  const group = PRONUNCIATION_GROUPS[language].find((g) =>
    g.pairs.some((p) => pairMatches(p, target, spoken, position, last))
  );
  if (!group) return null;
  return effective[group.id] === 'forgive' ? 'forgiven' : 'required';
}

const variantKey = (target: string, spoken: string | null) =>
  `${target}>${spoken ?? ''}`;

const variantSets = new Map<SpeakLanguage, ReadonlySet<string>>();

/** The language's native variants, never including a sound-group pair. */
export function nativeVariants(language: SpeakLanguage): ReadonlySet<string> {
  const known = variantSets.get(language);
  if (known) return known;
  const groupPairs = new Set(
    PRONUNCIATION_GROUPS[language].flatMap((g) =>
      g.pairs.map((p) => variantKey(p.target, p.spoken))
    )
  );
  const set = new Set(
    PRONUNCIATION_VARIANTS[language]
      .map((v) => variantKey(v.target, v.spoken))
      .filter((k) => !groupPairs.has(k))
  );
  variantSets.set(language, set);
  return set;
}

/** gop2's rule per sound: wrong past the swap cut-off, partners on their own cut-offs, charitable within the window. */
export function decideSounds(
  tokens: readonly string[],
  readings: readonly (readonly SoundReading[])[],
  language: SpeakLanguage,
  effective: Readonly<Record<string, 'forgive' | 'require'>>,
  variants: ReadonlySet<string> = nativeVariants(language)
): AlignmentEntry[] {
  const last = tokens.length;
  return tokens.map((target, i) => {
    const position = i + 1;
    const open = readings[i].filter(
      (r) => !variants.has(variantKey(target, r.spoken))
    );
    let heard: string | null = target;
    let best = NEG;
    for (const r of open) {
      if (r.lead > best) {
        best = r.lead;
        heard = r.spoken;
      }
    }
    if (best <= SWAP_CUTOFF) {
      let partner: string | null = null;
      let partnerLead = NEG;
      for (const r of open) {
        const kind = pairKind(
          language,
          effective,
          target,
          r.spoken,
          position,
          last
        );
        if (!kind) continue;
        const cut =
          kind === 'required' ? REQUIRED_GROUP_CUTOFF : FORGIVEN_GROUP_CUTOFF;
        if (r.lead > cut && r.lead > partnerLead) {
          partnerLead = r.lead;
          partner = r.spoken;
        }
      }
      if (partner !== null) {
        heard = partner;
        best = SWAP_CUTOFF + 1;
      }
    }
    if (best <= SWAP_CUTOFF) {
      return {
        position,
        targetIPA: target,
        spokenIPA: target,
        status: 'correct',
      };
    }
    let charitable: string | null = null;
    let charitableRank = NEG;
    for (const r of open) {
      if (r.lead < best - CHARITABLE_WINDOW) continue;
      const kind = pairKind(
        language,
        effective,
        target,
        r.spoken,
        position,
        last
      );
      const rank = kind === 'tolerated' ? 3 : kind === 'forgiven' ? 2 : 0;
      if (rank && rank * 100 + r.lead > charitableRank) {
        charitableRank = rank * 100 + r.lead;
        charitable = r.spoken;
      }
    }
    if (charitable !== null) heard = charitable;
    return heard === null
      ? { position, targetIPA: target, spokenIPA: null, status: 'omitted' }
      : {
          position,
          targetIPA: target,
          spokenIPA: heard,
          status: 'substituted',
        };
  });
}
