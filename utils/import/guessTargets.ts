// Cheap, no-AI target guess for an Import Source (docs/plans/IMPORT.md D2 and the feasibility map).
import type { ImportBlock, ImportInboxItem, ImportTarget } from './contract';

/** What the teacher handed Import. `text` on a file is any text already read from it, for the guess only. */
export type ImportSource =
  | { kind: 'file'; fileName: string; mimeType: string; text?: string }
  | { kind: 'url'; url: string }
  | { kind: 'text'; text: string }
  | { kind: 'send'; item: ImportInboxItem };

export interface TargetGuess {
  /** Every target this Source can feasibly become, in display order. */
  targets: ImportTarget[];
  /** Preselected; always one of `targets`. */
  guess: ImportTarget;
}

const DOCUMENT: ImportTarget[] = [
  'quiz',
  'flashcards',
  'notebook',
  'guidedLearning',
  'activityWall',
  'board',
];
const SLIDES: ImportTarget[] = [
  'notebook',
  'guidedLearning',
  'quiz',
  'flashcards',
  'board',
  'embed',
];
const PAGE: ImportTarget[] = [...DOCUMENT, 'embed', 'links'];

const NUMBERED = /^\s*(?:q(?:uestion)?\s*)?\d{1,3}\s*[.):]\s+\S/i;
const OPTION = /^\s*\(?[a-e][.)]\s+\S/i;

/** Three or more numbered lines, with a question mark or lettered options among them. */
export function looksLikeQuestions(lines: readonly string[]): boolean {
  const numbered = lines.filter((l) => NUMBERED.test(l));
  if (numbered.length < 3) return false;
  return (
    numbered.some((l) => l.includes('?')) ||
    lines.filter((l) => OPTION.test(l)).length >= 2
  );
}

/** Three or more term/definition pairs: tab-separated lines or a two-column table. */
export function looksLikeTwoColumns(
  lines: readonly string[],
  blocks: readonly ImportBlock[] = []
): boolean {
  const tabbed = lines.filter((l) => {
    const cells = l.split('\t').filter((c) => c.trim());
    return cells.length === 2;
  });
  if (tabbed.length >= 3) return true;
  return blocks.some(
    (b) =>
      b.type === 'table' &&
      b.rows.length >= 3 &&
      b.rows.every((r) => r.cells.length === 2)
  );
}

const linesOf = (text: string) => text.split(/\r?\n/).filter((l) => l.trim());

const blockLines = (blocks: readonly ImportBlock[]) =>
  blocks.flatMap((b) =>
    b.type === 'table' ? b.rows.map((r) => r.cells.join('\t')) : [b.text]
  );

/** Quiz for numbered questions, Flashcards for two columns, otherwise `fallback`. */
function byContent(
  targets: ImportTarget[],
  lines: readonly string[],
  blocks: readonly ImportBlock[],
  fallback: ImportTarget
): TargetGuess {
  const guess = looksLikeQuestions(lines)
    ? 'quiz'
    : looksLikeTwoColumns(lines, blocks)
      ? 'flashcards'
      : fallback;
  return { targets, guess: targets.includes(guess) ? guess : targets[0] };
}

const extension = (name: string) => {
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
};

function guessFile(fileName: string, mimeType: string, text = ''): TargetGuess {
  const lower = fileName.toLowerCase();
  const ext = extension(lower);
  const lines = linesOf(text);
  if (lower.endsWith('.gl.json'))
    return { targets: ['guidedLearning'], guess: 'guidedLearning' };
  if (ext === 'imscc' || ext === 'zip')
    return { targets: ['quiz', 'questionBank'], guess: 'quiz' };
  if (ext === 'tst') return { targets: ['quiz'], guess: 'quiz' };
  if (ext === 'html' || ext === 'htm')
    return { targets: ['miniApp'], guess: 'miniApp' };
  if (ext === 'notebook' || ext === 'olf' || ext === 'spartnb')
    return { targets: ['notebook'], guess: 'notebook' };
  if (
    ext === 'csv' ||
    ext === 'tsv' ||
    mimeType === 'text/csv' ||
    mimeType === 'text/tab-separated-values'
  )
    return byContent(
      ['quiz', 'flashcards', 'rubric'],
      lines.map((l) => (l.split(',').length === 2 ? l.replace(',', '\t') : l)),
      [],
      'quiz'
    );
  if (mimeType.startsWith('image/'))
    return { targets: ['sticker', 'quiz', 'flashcards'], guess: 'sticker' };
  if (ext === 'pptx' || ext === 'ppt' || ext === 'key' || ext === 'odp')
    return { targets: SLIDES, guess: 'notebook' };
  if (ext === 'pdf' || mimeType === 'application/pdf')
    return byContent([...DOCUMENT, 'pdf'], lines, [], 'pdf');
  return byContent(DOCUMENT, lines, [], 'quiz');
}

const YOUTUBE = /(^|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com)$/;

function guessUrl(url: string): TargetGuess {
  let host = '';
  let path = '';
  try {
    const u = new URL(url);
    host = u.hostname.toLowerCase();
    path = u.pathname;
  } catch {
    return { targets: ['links'], guess: 'links' };
  }
  if (YOUTUBE.test(host))
    return { targets: ['embed', 'videoActivity'], guess: 'embed' };
  if (host === 'docs.google.com' && path.startsWith('/presentation/'))
    return { targets: SLIDES, guess: 'embed' };
  if (host === 'docs.google.com' && path.startsWith('/forms/'))
    return { targets: ['quiz', 'embed', 'links'], guess: 'quiz' };
  if (path.toLowerCase().endsWith('.pdf'))
    return { targets: [...DOCUMENT, 'pdf', 'embed'], guess: 'pdf' };
  return { targets: PAGE, guess: 'embed' };
}

/** The targets a Source can become and the one to preselect; never calls AI. */
export function guessTargets(source: ImportSource): TargetGuess {
  switch (source.kind) {
    case 'file':
      return guessFile(source.fileName, source.mimeType, source.text);
    case 'url':
      return guessUrl(source.url);
    case 'text': {
      const lines = linesOf(source.text);
      const prompt = lines.length === 1 && lines[0].trim().endsWith('?');
      return byContent(
        ['quiz', 'flashcards', 'activityWall', 'board'],
        lines,
        [],
        prompt ? 'activityWall' : 'flashcards'
      );
    }
    case 'send': {
      const { item } = source;
      // A reader that found a video lesson (D32) sends it as one, with its text for the rest.
      if (item.video)
        return {
          targets: ['videoActivity', ...DOCUMENT],
          guess: 'videoActivity',
        };
      // A selection is the content the teacher wants, so it isn't offered as a whole-page embed.
      if (item.selectionOnly)
        return byContent(
          DOCUMENT,
          blockLines(item.blocks),
          item.blocks,
          'flashcards'
        );
      const page = guessUrl(item.url);
      const targets = [...new Set([...page.targets, ...DOCUMENT])];
      return byContent(
        targets,
        blockLines(item.blocks),
        item.blocks,
        page.guess
      );
    }
  }
}
