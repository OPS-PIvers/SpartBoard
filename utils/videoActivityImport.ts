// A video lesson a Platform reader sent (docs/plans/IMPORT.md D32, D33) as Video Activity content.
import type {
  VideoActivityClip,
  VideoActivityNote,
  VideoActivityQuestion,
} from '@/types';
import type {
  ImportVideoLeftOut,
  ImportVideoLesson,
  ImportVideoStop,
} from '@/utils/import/contract';
import { normalizeClip } from './videoActivityClip';
import {
  MAX_MULTI_PER_LIST,
  MAX_SINGLE_OPTIONS,
  questionFromRows,
  type ChoiceRow,
} from './quizChoiceRows';

export interface ImportedVideoContent {
  youtubeUrl: string;
  questions: VideoActivityQuestion[];
  notes: VideoActivityNote[];
  clip?: VideoActivityClip;
  /** What didn't come over, for the editor to say once; null when everything did. */
  leftOut: string | null;
}

type LeftOutCounts = Partial<
  Record<ImportVideoLeftOut | 'shortAnswer' | 'note' | 'clip', number>
>;

const plural = (n: number, one: string, many: string) =>
  n === 1 ? `1 ${one}` : `${n} ${many}`;

const PHRASES: Record<keyof LeftOutCounts, (n: number) => string> = {
  question: (n) =>
    plural(
      n,
      'question SpartBoard has no kind for',
      'questions SpartBoard has no kind for'
    ),
  shortAnswer: (n) =>
    plural(n, 'short-answer question', 'short-answer questions'),
  note: (n) => plural(n, 'note', 'notes'),
  clip: () => 'the start and end times',
  voiceover: () => 'voiceover narration',
  feedback: () => 'answer feedback',
  choicePicture: (n) => plural(n, 'picture in a choice', 'pictures in choices'),
  cut: (n) =>
    `${plural(n, 'cut', 'cuts')} in the middle of the video (students see that part)`,
};

/** "Left out: a, b and c." in a fixed order; null when nothing was. */
export function leftOutSummary(counts: LeftOutCounts): string | null {
  const parts = (Object.keys(PHRASES) as (keyof LeftOutCounts)[])
    .filter((k) => (counts[k] ?? 0) > 0)
    .map((k) => PHRASES[k](counts[k] ?? 0));
  if (!parts.length) return null;
  const list =
    parts.length === 1
      ? parts[0]
      : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  return `Left out: ${list}.`;
}

type PictureFor = (stop: ImportVideoStop) => { imageDriveFileId?: string };

const base = (stop: ImportVideoStop) => ({
  id: crypto.randomUUID(),
  timeLimit: 0,
  text: stop.text,
  timestamp: stop.time,
});

/** Right options all stay; wrong ones past the editor's caps are dropped. */
function fitRows(rows: ChoiceRow[], multi: boolean): ChoiceRow[] {
  const wrongCap = multi
    ? MAX_MULTI_PER_LIST
    : MAX_SINGLE_OPTIONS - rows.filter((r) => r.correct).length;
  let wrong = 0;
  return rows.filter((r) => r.correct || ++wrong <= wrongCap);
}

function questionFrom(
  stop: ImportVideoStop,
  picture: PictureFor
): VideoActivityQuestion | null {
  const image = picture(stop);
  if (stop.kind !== 'choice')
    return stop.kind === 'open'
      ? {
          ...base(stop),
          type: 'SA',
          correctAnswer: '',
          incorrectAnswers: [],
          ...image,
        }
      : null;
  const marked = stop.choices.filter((c) => c.correct).length;
  const multi = marked > 1;
  const { optionOrder, correctAnswer, incorrectAnswers } = questionFromRows(
    fitRows(stop.choices, multi),
    multi
  );
  return {
    ...base(stop),
    type: multi ? 'MA' : 'MC',
    correctAnswer,
    incorrectAnswers,
    ...(optionOrder ? { optionOrder } : {}),
    ...image,
    // No key came with it: the teacher marks the answer before assigning.
    ...(marked === 0 ? { needsKey: true } : {}),
  };
}

/** Questions, notes and clip for a new activity; with `stops` off only the choice questions come over. */
export function videoContentFromLesson(
  video: ImportVideoLesson,
  {
    stops,
    pictures = new Map(),
  }: { stops: boolean; pictures?: ReadonlyMap<string, string> }
): ImportedVideoContent {
  const picture: PictureFor = (stop) => {
    const id = stop.image ? pictures.get(stop.image) : undefined;
    return id ? { imageDriveFileId: id } : {};
  };
  // Short answer, note stops and clips share one preview flag (D35).
  const questions = video.stops
    .filter((s) => stops || s.kind !== 'open')
    .map((s) => questionFrom(s, picture))
    .filter((q): q is VideoActivityQuestion => q !== null);
  const notes: VideoActivityNote[] = stops
    ? video.stops
        .filter((s) => s.kind === 'note')
        .map((s) => ({
          id: crypto.randomUUID(),
          timestamp: s.time,
          text: s.text,
          ...picture(s),
        }))
    : [];
  const clip = stops
    ? normalizeClip({ start: video.start, end: video.end })
    : undefined;
  const count = (kind: ImportVideoStop['kind']) =>
    video.stops.filter((s) => s.kind === kind).length;
  const hidden = stops
    ? {}
    : {
        shortAnswer: count('open'),
        note: count('note'),
        clip: normalizeClip({ start: video.start, end: video.end }) ? 1 : 0,
      };
  return {
    youtubeUrl: `https://www.youtube.com/watch?v=${video.youtubeId}`,
    questions,
    notes,
    ...(clip ? { clip } : {}),
    leftOut: leftOutSummary({ ...video.leftOut, ...hidden }),
  };
}
