/**
 * Derives the syllable-nucleus token set from the acoustic model's own
 * vocabulary, rather than from anyone's memory of what IPA contains.
 *
 * Re-fetch and regenerate:
 *   curl -sSL https://huggingface.co/facebook/wav2vec2-xlsr-53-espeak-cv-ft/raw/main/vocab.json \
 *     -o scripts/spikes/stress-detection/vocab.json
 *   node scripts/spikes/stress-detection/deriveNuclei.mjs
 *
 * Prints a summary and rewrites `nuclei.json`. `vocab.json` is committed
 * alongside so the derivation is reproducible without network access.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Base vowel letters of the IPA, as they appear as the FIRST character of a
 * vocabulary token. Length marks, nasalisation, tone digits and the like are
 * combining or trailing, so a token's syllabic status is decided by its head.
 */
const VOWEL_HEADS = new Set([
  ...'aeiouy',
  ...'æɑɐɒɔəɘɛɜɞɤɨɪɯɵøœɶʊʉʌʏ',
]);

/**
 * Consonants that carry a syllable on their own (U+0329 combining vertical
 * line below). English `button` /bʌtn̩/, `bottle` /bɒtl̩/, and a large share of
 * German — every `-en` ending that reduces (`gehen`, `Wagen`, `haben`).
 *
 * These are the reason "count the vowels" undercounts German systematically.
 */
const SYLLABIC_CONSONANTS = ['n̩', 'l̩', 'r̩'];

/** Special tokens and the blank/word-delimiter symbols, which are not sounds. */
const isStructural = (t) => t.startsWith('<') || t === '??' || t === '|';

const vocab = JSON.parse(readFileSync(join(here, 'vocab.json'), 'utf8'));
const tokens = Object.keys(vocab).filter((t) => !isStructural(t));

const vowelHeaded = tokens.filter((t) => VOWEL_HEADS.has(t[0]));
const syllabic = SYLLABIC_CONSONANTS.filter((t) => tokens.includes(t));

/**
 * Tokens that begin with a consonant yet contain a vowel — a whole
 * glide-initial syllable in one symbol. A head-character rule alone drops
 * these, and in this vocabulary both are ordinary German words (`ja`,
 * `Jugend`), so the omission would be silent and frequent.
 */
const glideInitial = tokens.filter(
  (t) =>
    !VOWEL_HEADS.has(t[0]) &&
    !SYLLABIC_CONSONANTS.includes(t) &&
    [...t].some((c) => VOWEL_HEADS.has(c))
);

const nuclei = [...vowelHeaded, ...syllabic, ...glideInitial].sort();

writeFileSync(
  join(here, 'nuclei.json'),
  `${JSON.stringify(
    {
      source: 'facebook/wav2vec2-xlsr-53-espeak-cv-ft vocab.json',
      vocabSize: Object.keys(vocab).length,
      soundTokens: tokens.length,
      counts: {
        vowelHeaded: vowelHeaded.length,
        syllabicConsonants: syllabic.length,
        glideInitial: glideInitial.length,
        total: nuclei.length,
      },
      syllabicConsonants: syllabic,
      glideInitial,
      nuclei,
    },
    null,
    2
  )}\n`
);

console.log(`vocab tokens          : ${Object.keys(vocab).length}`);
console.log(`sound tokens          : ${tokens.length}`);
console.log(`vowel-headed          : ${vowelHeaded.length}`);
console.log(`syllabic consonants   : ${syllabic.length} (${syllabic.join(' ')})`);
console.log(`glide-initial         : ${glideInitial.length} (${glideInitial.join(' ')})`);
console.log(`nucleus tokens (total): ${nuclei.length}`);
