// Server mirror of the video activity save path (hooks/useVideoActivity.ts saveActivity).
import { ToolError } from './activity';
import {
  toFriendlyQuestion,
  toStoredQuestion,
  type FriendlyQuestion,
  type StoredQuestion,
} from './quizStore';

export const MAX_VIDEO_QUESTIONS = 100;
/** Editor default for a new question (useVideoActivityEditorState.ts). */
const DEFAULT_TIME_LIMIT = 30;

export type VideoFriendlyType =
  | 'multiple_choice'
  | 'choose_all'
  | 'fill_in_blank';

export interface VideoFriendlyQuestion {
  id?: string;
  type: VideoFriendlyType;
  text: string;
  timestamp_seconds: number;
  correct_answer?: string;
  incorrect_answers?: string[];
  correct_answers?: string[];
  accepted_alternates?: string[];
  points?: number;
  time_limit_seconds?: number;
  partial_credit?: boolean;
}

export interface VideoQuestion extends StoredQuestion {
  timestamp: number;
  acceptableVariants?: string[];
}

/** VideoActivityData in types.ts, as stored on Drive. */
export interface VideoContent {
  id: string;
  title: string;
  youtubeUrl: string;
  questions: VideoQuestion[];
  createdAt: number;
  updatedAt: number;
  [extra: string]: unknown;
}

/** Mirrors extractYouTubeId in utils/youtube.ts. */
export const extractYouTubeId = (url: string): string | null => {
  const m = url.match(
    /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|shorts\/|watch\?v=|watch\?.+&v=))([A-Za-z0-9_-]{11})/
  );
  return m ? m[1] : null;
};

export function assertYouTubeUrl(url: string): string {
  const trimmed = url.trim();
  if (!extractYouTubeId(trimmed)) {
    throw new ToolError(
      'youtube_url must be a YouTube video link, e.g. https://www.youtube.com/watch?v=VIDEO_ID.'
    );
  }
  return trimmed;
}

/** Tool input → stored video question; FIB alternates live in acceptableVariants here, not alternateAnswers. */
export function toStoredVideoQuestion(
  input: VideoFriendlyQuestion,
  n: number,
  existing: VideoQuestion | undefined,
  newId: () => string
): VideoQuestion {
  let prior: StoredQuestion | undefined;
  if (existing) {
    prior = { ...existing };
    delete prior.acceptableVariants;
    delete prior.timestamp;
  }
  const stored = toStoredQuestion(
    {
      ...(input as FriendlyQuestion),
      time_limit_seconds:
        input.time_limit_seconds ?? (existing ? undefined : DEFAULT_TIME_LIMIT),
    },
    n,
    prior,
    newId
  );
  const out: VideoQuestion = {
    ...stored,
    timestamp: Math.max(0, Math.floor(input.timestamp_seconds)),
  };
  if (out.alternateAnswers) {
    out.acceptableVariants = out.alternateAnswers;
    delete out.alternateAnswers;
  }
  return out;
}

/** Sorted by timestamp with duplicates nudged +1s, as VideoActivityEditorModal does on save. */
export function orderByTimestamp(questions: VideoQuestion[]): VideoQuestion[] {
  const sorted = [...questions].sort((a, b) => a.timestamp - b.timestamp);
  let last = -1;
  return sorted.map((q) => {
    const timestamp = q.timestamp <= last ? last + 1 : q.timestamp;
    last = timestamp;
    return timestamp === q.timestamp ? q : { ...q, timestamp };
  });
}

export function toFriendlyVideoQuestion(q: VideoQuestion) {
  const base = toFriendlyQuestion({
    ...q,
    ...(q.acceptableVariants?.length
      ? { alternateAnswers: q.acceptableVariants }
      : {}),
  });
  return { ...base, timestamp_seconds: q.timestamp };
}

/** Mirrors normalizeVideoActivity in utils/videoActivityNormalize.ts. */
export function normalizeVideoContent(raw: unknown, id: string): VideoContent {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Record<
    string,
    unknown
  >;
  const questions = Array.isArray(data.questions)
    ? (data.questions as Partial<VideoQuestion>[]).map(
        (q) =>
          ({
            ...q,
            type: q.type ?? 'MC',
            points: q.points ?? 1,
            timestamp: Number(q.timestamp ?? 0),
            incorrectAnswers: q.incorrectAnswers ?? [],
            correctAnswer: q.correctAnswer ?? '',
          }) as VideoQuestion
      )
    : [];
  return {
    ...data,
    id,
    title: typeof data.title === 'string' ? data.title : '',
    youtubeUrl: typeof data.youtubeUrl === 'string' ? data.youtubeUrl : '',
    questions,
    createdAt: Number(data.createdAt ?? Date.now()),
    updatedAt: Number(data.updatedAt ?? Date.now()),
  };
}

/** Mirrors the metadata object saveActivity writes, keeping folder, sync, behavior and order. */
export function buildVideoMetadata(
  content: VideoContent,
  driveFileId: string,
  existing: Record<string, unknown> | null,
  claude: { claudeCreatedAt?: number; claudeEditedAt?: number }
): Record<string, unknown> {
  const keep: Record<string, unknown> = {};
  for (const k of [
    'folderId',
    'sync',
    'behavior',
    'order',
    'claudeCreatedAt',
  ]) {
    if (existing?.[k] !== undefined) keep[k] = existing[k];
  }
  return {
    ...keep,
    id: content.id,
    title: content.title,
    youtubeUrl: content.youtubeUrl,
    driveFileId,
    questionCount: content.questions.length,
    createdAt: content.createdAt,
    updatedAt: content.updatedAt,
    ...claude,
  };
}

/** Mirrors isVideoActivityComplete in utils/activityCompleteness.ts. */
export const videoQuestionNeedsKey = (q: VideoQuestion): boolean =>
  !q.correctAnswer?.trim();
