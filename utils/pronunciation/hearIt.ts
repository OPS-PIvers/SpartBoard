// "Hear it" (F23): the device's own speech synthesis, with a voice matched to the card's dialect.

export function speechAvailable(): boolean {
  return (
    typeof window !== 'undefined' &&
    Boolean(window.speechSynthesis as SpeechSynthesis | undefined) &&
    typeof window.SpeechSynthesisUtterance === 'function'
  );
}

// Regions read as Latin American Spanish when a set accepts es-419.
const LATAM_REGIONS = new Set([
  '419',
  'us',
  'mx',
  'ar',
  'bo',
  'cl',
  'co',
  'cr',
  'cu',
  'do',
  'ec',
  'gt',
  'hn',
  'ni',
  'pa',
  'pe',
  'pr',
  'py',
  'sv',
  'uy',
  've',
]);

const normalize = (tag: string) => tag.replace(/_/g, '-').toLowerCase();

type VoiceLike = Pick<
  SpeechSynthesisVoice,
  'lang' | 'localService' | 'default'
>;

/** Exact dialect first, then es-419 by region, then the primary subtag; local voices win ties. */
export function pickVoice<V extends VoiceLike>(
  voices: readonly V[],
  dialect: string
): V | null {
  const want = normalize(dialect);
  const [primary, region] = want.split('-');
  const rank = (v: V): number => {
    const lang = normalize(v.lang);
    const [p, r] = lang.split('-');
    if (p !== primary) return -1;
    if (lang === want) return 3;
    if (primary === 'es' && region === '419' && r && LATAM_REGIONS.has(r))
      return 2;
    if (primary === 'es' && region === '419' && r === 'es') return 0;
    return 1;
  };
  let best: V | null = null;
  let bestScore = -1;
  for (const v of voices) {
    const score = rank(v) * 2 + (v.localService ? 1 : 0);
    if (rank(v) >= 0 && score > bestScore) {
      best = v;
      bestScore = score;
    }
  }
  return best;
}

/** The voice "Hear it" would use for a dialect, or null to hide the button. */
export function hearItVoice(dialect: string): SpeechSynthesisVoice | null {
  if (!speechAvailable()) return null;
  return pickVoice(window.speechSynthesis.getVoices(), dialect);
}

/** Calls back when the browser's voice list changes (Chrome fills it in after load). */
export function subscribeVoices(cb: () => void): () => void {
  if (!speechAvailable()) return () => undefined;
  const synth = window.speechSynthesis;
  synth.addEventListener('voiceschanged', cb);
  return () => synth.removeEventListener('voiceschanged', cb);
}

/** Speaks `text` in the dialect's voice; false when no voice matches. The returned stop cancels it. */
export function hearIt(
  text: string,
  dialect: string,
  opts: { onEnd?: () => void; rate?: number } = {}
): { started: boolean; stop: () => void } {
  const voice = hearItVoice(dialect);
  if (!voice || !text.trim()) return { started: false, stop: () => undefined };
  const synth = window.speechSynthesis;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.voice = voice;
  utterance.lang = voice.lang;
  utterance.rate = opts.rate ?? 0.9;
  utterance.onend = () => opts.onEnd?.();
  utterance.onerror = () => opts.onEnd?.();
  synth.cancel();
  synth.speak(utterance);
  return {
    started: true,
    stop: () => {
      utterance.onend = null;
      utterance.onerror = null;
      synth.cancel();
    },
  };
}
