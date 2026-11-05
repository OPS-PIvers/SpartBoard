import {
  flashcardLanguageFor,
  isFlashcardLanguagePreset,
} from './flashcardLanguages';

/** Fewest filled cards in a column before its language is guessed. */
export const DETECT_MIN_CARDS = 5;
const MIN_CONFIDENCE = 0.7;

// Ordered so kana wins over the Han characters Japanese also uses.
const SCRIPTS: readonly { pattern: RegExp; tag: string }[] = [
  { pattern: /\p{Script=Hangul}/u, tag: 'ko-KR' },
  { pattern: /[\p{Script=Hiragana}\p{Script=Katakana}]/u, tag: 'ja-JP' },
  { pattern: /\p{Script=Han}/u, tag: 'zh-CN' },
  { pattern: /\p{Script=Cyrillic}/u, tag: 'ru-RU' },
];

/** A language that the column's alphabet alone settles, or null for Latin script. */
export const languageFromScript = (texts: readonly string[]): string | null => {
  const joined = texts.join(' ');
  const letters = joined.match(/\p{L}/gu)?.length ?? 0;
  if (letters === 0) return null;
  for (const { pattern, tag } of SCRIPTS) {
    const global = new RegExp(pattern.source, 'gu');
    const hits = joined.match(global)?.length ?? 0;
    if (hits / letters >= 0.5) return tag;
  }
  return null;
};

interface ChromeLanguageDetector {
  detect(
    text: string
  ): Promise<{ detectedLanguage: string; confidence: number }[]>;
}
interface ChromeLanguageDetectorFactory {
  availability(): Promise<string>;
  create(): Promise<ChromeLanguageDetector>;
}

let detectorPromise: Promise<ChromeLanguageDetector | null> | null = null;

/** Chrome's on-device detector when it is already on the device; never starts a download. */
const chromeDetector = (): Promise<ChromeLanguageDetector | null> => {
  if (detectorPromise) return detectorPromise;
  const factory = (
    globalThis as { LanguageDetector?: ChromeLanguageDetectorFactory }
  ).LanguageDetector;
  detectorPromise = !factory
    ? Promise.resolve(null)
    : factory
        .availability()
        .then((state) => (state === 'available' ? factory.create() : null))
        .catch(() => null);
  return detectorPromise;
};

/** The column's language as a Flashcards language tag, or null when there is too little text or no confident guess. */
export async function detectFlashcardLanguage(
  texts: readonly string[],
  detector: () => Promise<ChromeLanguageDetector | null> = chromeDetector
): Promise<string | null> {
  const filled = texts.map((text) => text.trim()).filter(Boolean);
  if (filled.length < DETECT_MIN_CARDS) return null;
  const byScript = languageFromScript(filled);
  if (byScript) return byScript;
  const chrome = await detector();
  if (!chrome) return null;
  try {
    const [best] = await chrome.detect(filled.join('\n'));
    if (!best || best.confidence < MIN_CONFIDENCE) return null;
    const tag = flashcardLanguageFor(best.detectedLanguage);
    // Only languages in the menu, so a guess never opens the code box.
    return tag && isFlashcardLanguagePreset(tag) ? tag : null;
  } catch {
    return null;
  }
}

/** Test reset. */
export const resetLanguageDetectorForTests = (): void => {
  detectorPromise = null;
};
