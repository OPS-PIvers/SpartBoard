// A video lesson a Platform reader sent (docs/plans/IMPORT.md D32, D33) as Video Activity content.
import type {
  VideoActivityClip,
  VideoActivityNote,
  VideoActivityQuestion,
} from '@/types';
import type {
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
  return {
    youtubeUrl: `https://www.youtube.com/watch?v=${video.youtubeId}`,
    questions,
    notes,
    ...(clip ? { clip } : {}),
  };
}
