import { describe, expect, it, vi } from 'vitest';
import {
  detectFlashcardLanguage,
  languageFromScript,
} from './detectFlashcardLanguage';

const detector = (detectedLanguage: string, confidence: number) => () =>
  Promise.resolve({
    detect: vi.fn(() => Promise.resolve([{ detectedLanguage, confidence }])),
  });

const spanish = ['hola', 'adiós', 'gracias', 'por favor', 'buenos días'];

describe('languageFromScript', () => {
  it('names a language from its alphabet', () => {
    expect(languageFromScript(['안녕하세요'])).toBe('ko-KR');
    expect(languageFromScript(['ありがとう', '学校'])).toBe('ja-JP');
    expect(languageFromScript(['你好'])).toBe('zh-CN');
    expect(
      languageFromScript(['学校', '先生', '電車', '日本語', '食べる'])
    ).toBe('ja-JP');
    expect(languageFromScript(['привет'])).toBe('ru-RU');
  });

  it('leaves Latin script to the detector', () => {
    expect(languageFromScript(spanish)).toBeNull();
    expect(languageFromScript(['123'])).toBeNull();
  });
});

describe('detectFlashcardLanguage', () => {
  it('waits for five filled cards', async () => {
    const chrome = vi.fn(detector('es', 0.99));
    expect(
      await detectFlashcardLanguage([...spanish.slice(0, 4), ' ', ''], chrome)
    ).toBeNull();
    expect(chrome).not.toHaveBeenCalled();
  });

  it('uses the alphabet before the detector', async () => {
    const chrome = vi.fn(detector('en', 0.99));
    expect(
      await detectFlashcardLanguage(['一', '二', '三', '四', '五'], chrome)
    ).toBe('zh-CN');
    expect(chrome).not.toHaveBeenCalled();
  });

  it('takes a confident guess and maps it to a Flashcards language', async () => {
    expect(await detectFlashcardLanguage(spanish, detector('es', 0.9))).toBe(
      'es-US'
    );
  });

  it('ignores an unsure guess, one off the menu, a missing detector and a failed one', async () => {
    expect(
      await detectFlashcardLanguage(spanish, detector('es', 0.4))
    ).toBeNull();
    expect(
      await detectFlashcardLanguage(spanish, detector('vi', 0.95))
    ).toBeNull();
    expect(
      await detectFlashcardLanguage(spanish, () => Promise.resolve(null))
    ).toBeNull();
    const failing = () =>
      Promise.resolve({ detect: () => Promise.reject(new Error('x')) });
    expect(await detectFlashcardLanguage(spanish, failing)).toBeNull();
  });
});
