// Greedy CTC decode for the pinned wav2vec2 phoneme model (S1: own argmax + collapse, never pipeline()).

export interface CtcToken {
  symbol: string;
  startFrame: number;
  endFrame: number;
}

export interface CtcDecodeResult {
  tokens: CtcToken[];
  text: string;
  frameCount: number;
}

export function invertVocab(vocab: Record<string, number>): string[] {
  const out: string[] = [];
  for (const [symbol, id] of Object.entries(vocab)) out[id] = symbol;
  return out;
}

/** `logits` is the flat [frames × vocabSize] batch-0 slice of the model output. */
export function greedyCtcDecode(
  logits: Float32Array,
  frameCount: number,
  vocabSize: number,
  idToSymbol: readonly string[],
  padId: number
): CtcDecodeResult {
  if (logits.length < frameCount * vocabSize) {
    throw new Error(
      `logits length ${logits.length} < ${frameCount} frames × ${vocabSize}`
    );
  }
  const tokens: CtcToken[] = [];
  let prev = -1;
  let start = 0;
  const flush = (end: number) => {
    if (prev !== -1 && prev !== padId) {
      tokens.push({
        symbol: idToSymbol[prev] ?? '?',
        startFrame: start,
        endFrame: end,
      });
    }
  };
  for (let f = 0; f < frameCount; f++) {
    const base = f * vocabSize;
    let best = 0;
    let bestVal = logits[base];
    for (let k = 1; k < vocabSize; k++) {
      const v = logits[base + k];
      if (v > bestVal) {
        bestVal = v;
        best = k;
      }
    }
    if (best !== prev) {
      flush(f);
      prev = best;
      start = f;
    }
  }
  flush(frameCount);
  return { tokens, text: tokens.map((t) => t.symbol).join(''), frameCount };
}
