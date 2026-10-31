// The Edpuzzle Platform reader (docs/plans/IMPORT.md D30-D36): a lesson's YouTube video, trim, questions and notes.

import {
  IMPORT_MAX_BLOCK_CHARS,
  IMPORT_MAX_TITLE_CHARS,
  IMPORT_MAX_VIDEO_CHOICES,
  IMPORT_MAX_VIDEO_SECONDS,
  IMPORT_MAX_VIDEO_STOPS,
  IMPORT_MAX_VIDEO_TEXT_CHARS,
  YOUTUBE_VIDEO_ID,
  type ImportBlock,
  type ImportVideoLesson,
  type ImportVideoStop,
} from '@/utils/import/contract';

export const EDPUZZLE_PLATFORM = 'edpuzzle';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** The lesson id on an Edpuzzle lesson page (`/media/<id>`, also its editor); null elsewhere. */
export function edpuzzleLessonId(href: string): string | null {
  try {
    const u = new URL(href);
    if (u.hostname !== 'edpuzzle.com' && u.hostname !== 'www.edpuzzle.com')
      return null;
    return /^\/media\/([0-9a-f]{24})(?:\/|$)/i.exec(u.pathname)?.[1] ?? null;
  } catch {
    return null;
  }
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/** Tags dropped and entities decoded without the page's parser, for pages that enforce Trusted Types. */
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) =>
      String.fromCodePoint(parseInt(n, 16))
    )
    .replace(/&([a-z]+);/gi, (m, name: string) => ENTITIES[name] ?? m);
}

/** Edpuzzle's rich text as plain text: line breaks kept, nothing run. */
export function htmlText(html: string): string {
  let text: string;
  try {
    // Parsing never runs scripts; a block element still ends its line.
    const doc = new DOMParser().parseFromString(
      html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li)>/gi, '$&\n'),
      'text/html'
    );
    text = doc.body.textContent ?? '';
  } catch {
    text = stripHtml(html);
  }
  return text
    .replace(/[ \t\u00a0\u200b]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim()
    .slice(0, IMPORT_MAX_VIDEO_TEXT_CHARS);
}

/** Edpuzzle's `body: [{ html }]` rich text field. */
const bodyText = (v: unknown): string =>
  list(v)
    .map((part) =>
      isObj(part) && typeof part.html === 'string'
        ? htmlText(part.html)
        : isObj(part) && typeof part.text === 'string'
          ? part.text.trim()
          : ''
    )
    .filter(Boolean)
    .join('\n')
    .slice(0, IMPORT_MAX_VIDEO_TEXT_CHARS);

const seconds = (v: unknown): number | null =>
  typeof v === 'number' &&
  Number.isFinite(v) &&
  v >= 0 &&
  v <= IMPORT_MAX_VIDEO_SECONDS
    ? Math.round(v * 100) / 100
    : null;

function stopFrom(q: unknown): ImportVideoStop | null {
  if (!isObj(q)) return null;
  const time = seconds(q.time);
  const text = bodyText(q.body);
  if (time === null || !text) return null;
  if (q.type === 'open-ended') return { kind: 'open', time, text };
  if (q.type !== 'multiple-choice') return null;
  const choices = list(q.choices)
    .filter(isObj)
    .map((c) => ({ text: bodyText(c.body), correct: c.isCorrect === true }))
    .filter((c) => c.text)
    .slice(0, IMPORT_MAX_VIDEO_CHOICES);
  return choices.length ? { kind: 'choice', time, text, choices } : null;
}

export type EdpuzzleRead =
  | { ok: true; title: string; video: ImportVideoLesson; skipped: number }
  | { ok: false; why: 'not-youtube' | 'malformed' };

/** Maps `/api/v3/media/<id>`; a video Edpuzzle hosts itself can't play in SpartBoard (D26). */
export function lessonFromEdpuzzle(raw: unknown): EdpuzzleRead {
  if (!isObj(raw)) return { ok: false, why: 'malformed' };
  if (raw.source !== 'youtube') return { ok: false, why: 'not-youtube' };
  const youtubeId = typeof raw.videoId === 'string' ? raw.videoId : '';
  if (!YOUTUBE_VIDEO_ID.test(youtubeId)) return { ok: false, why: 'malformed' };

  // Sections are the kept pieces of the video; a cut in the middle plays through (D33).
  const sections = list(raw.sections)
    .filter(isObj)
    .map((s) => {
      const time = seconds(s.time);
      const duration = seconds(s.duration);
      return time === null || duration === null
        ? null
        : { start: time, end: time + duration };
    })
    .filter((s) => s !== null);
  const full = seconds(raw.originalVideoDuration);
  const first = sections.length ? Math.min(...sections.map((s) => s.start)) : 0;
  const last = sections.length ? Math.max(...sections.map((s) => s.end)) : null;
  const start = first > 0.5 ? first : undefined;
  const end =
    last !== null && full !== null && last < full - 0.5
      ? Math.round(last * 100) / 100
      : undefined;

  const questions = list(raw.questions);
  const kept = questions.map(stopFrom).filter((s) => s !== null);
  const notes = list(raw.notes)
    .filter(isObj)
    .map((n): ImportVideoStop | null => {
      const time = seconds(n.time);
      const text = bodyText(n.body);
      return time === null || !text ? null : { kind: 'note', time, text };
    })
    .filter((s) => s !== null);
  const stops = [...kept, ...notes]
    .sort((a, b) => a.time - b.time)
    .slice(0, IMPORT_MAX_VIDEO_STOPS);

  const title =
    (typeof raw.title === 'string' ? raw.title.trim() : '').slice(
      0,
      IMPORT_MAX_TITLE_CHARS
    ) || 'Edpuzzle lesson';
  return {
    ok: true,
    title,
    video: {
      youtubeId,
      ...(start !== undefined ? { start } : {}),
      ...(end !== undefined ? { end } : {}),
      stops,
    },
    skipped: questions.length - kept.length,
  };
}

const clock = (t: number) => {
  const s = Math.floor(t);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** The lesson as page text too, so the other Import targets can still read it. */
export function lessonBlocks(
  title: string,
  video: ImportVideoLesson
): ImportBlock[] {
  const blocks: ImportBlock[] = [{ type: 'heading', level: 1, text: title }];
  let n = 0;
  for (const stop of video.stops) {
    if (stop.kind === 'note') {
      blocks.push({ type: 'quote', text: `${clock(stop.time)} ${stop.text}` });
      continue;
    }
    n += 1;
    blocks.push({
      type: 'paragraph',
      text: `${n}. ${stop.text}`.slice(0, IMPORT_MAX_BLOCK_CHARS),
    });
    if (stop.kind === 'choice')
      for (const c of stop.choices)
        blocks.push({ type: 'listItem', text: c.text });
  }
  return blocks;
}

export type EdpuzzleSend =
  | {
      ok: true;
      title: string;
      video: ImportVideoLesson;
      blocks: ImportBlock[];
      skipped: number;
    }
  | { ok: false; why: 'not-youtube' }
  | { ok: false; why: 'unreadable'; reason: string };

/** Reads the open lesson with the teacher's own Edpuzzle sign-in; only a click calls this. */
export async function readEdpuzzleLesson(
  id: string,
  fetchJson: (url: string) => Promise<unknown> = async (url) => {
    const res = await fetch(url, {
      credentials: 'include',
      headers: { accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`Edpuzzle answered ${res.status}`);
    return res.json() as Promise<unknown>;
  }
): Promise<EdpuzzleSend> {
  let raw: unknown;
  try {
    raw = await fetchJson(`https://edpuzzle.com/api/v3/media/${id}`);
  } catch (error) {
    return {
      ok: false,
      why: 'unreadable',
      reason: error instanceof Error ? error.message : 'fetch failed',
    };
  }
  const read = lessonFromEdpuzzle(raw);
  if (!read.ok)
    return read.why === 'not-youtube'
      ? { ok: false, why: 'not-youtube' }
      : { ok: false, why: 'unreadable', reason: 'unexpected lesson data' };
  if (!read.video.stops.length)
    return { ok: false, why: 'unreadable', reason: 'no questions or notes' };
  return {
    ok: true,
    title: read.title,
    video: read.video,
    blocks: lessonBlocks(read.title, read.video),
    skipped: read.skipped,
  };
}
