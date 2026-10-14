/**
 * DEV-only fixture wrapper for the student's published-results playback
 * (Brief 3.6). Mounts the REAL `ResponsePlaybackCard` for each archive state
 * with an injected fetch, and the REAL `PublishedScoreReview` for the
 * provisional-score marker — the auth-bypass dev server cannot complete an
 * anonymous student join, so fixtures are the only way to see these.
 */
import React, { useMemo } from 'react';
import { ResponsePlaybackCard } from '@/components/quiz/recording/ResponsePlaybackCard';
import { PublishedScoreReview } from '@/components/quiz/QuizStudentApp';
import type { FetchPlayback } from '@/hooks/useQuizArtifactPlayback';
import type {
  WrittenAnswerAnnotation,
  ArtifactArchiveEntry,
  QuizResponse,
  QuizResponseAnswer,
  QuizSession,
} from '@/types';
import { type ResultsPlaybackStateKey } from './devViewStates';

/** A one-second 440 Hz WAV, so the fixture player actually plays something. */
function toneWavBase64(): string {
  const rate = 8000;
  const samples = rate;
  const bytes = new Uint8Array(44 + samples * 2);
  const view = new DataView(bytes.buffer);
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++)
      view.setUint8(offset + i, text.charCodeAt(i));
  };
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + samples * 2, true);
  ascii(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, 'data');
  view.setUint32(40, samples * 2, true);
  for (let i = 0; i < samples; i++) {
    const value = Math.round(Math.sin((i / rate) * 440 * 2 * Math.PI) * 8000);
    view.setInt16(44 + i * 2, value, true);
  }
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

const ANSWERS: QuizResponseAnswer[] = [
  {
    questionId: 'q1',
    answer: '',
    answeredAt: 1_700_000_000_000,
    takeIndex: 1,
    artifacts: [
      {
        id: 'artifact-1',
        slot: 'primary',
        kind: 'audio',
        mimeType: 'audio/webm',
        bytes: 41_000,
        durationMs: 1000,
        uploadState: 'uploaded',
      },
    ],
  },
];

const ARCHIVE: Record<ResultsPlaybackStateKey, ArtifactArchiveEntry> = {
  playable: { archiveStatus: 'archived', driveFileId: 'drive-1' },
  archiving: { archiveStatus: 'syncing' },
  failed: { archiveStatus: 'failed', archiveError: 'Drive responded 500' },
  deleted: { archiveStatus: 'deleted', deletedAt: 1_700_000_100_000 },
  provisional: { archiveStatus: 'archived', driveFileId: 'drive-1' },
  'wb-show': { archiveStatus: 'archived', driveFileId: 'drive-1' },
  'wb-ready': { archiveStatus: 'archived', driveFileId: 'drive-1' },
  'wb-archiving': { archiveStatus: 'syncing' },
  'wb-deleted': { archiveStatus: 'deleted', deletedAt: 1_700_000_100_000 },
};

const WB_ANSWERS: QuizResponseAnswer[] = [
  {
    questionId: 'q1',
    answer: '',
    answeredAt: 1_700_000_000_000,
    takeIndex: 1,
    artifacts: [
      {
        id: 'wb-audio',
        slot: 'primary',
        kind: 'audio',
        mimeType: 'audio/webm',
        durationMs: 1000,
        uploadState: 'uploaded',
      },
      {
        id: 'wb-picture',
        slot: 'primary',
        kind: 'whiteboard',
        part: 'picture',
        mimeType: 'image/png',
        uploadState: 'uploaded',
      },
      {
        id: 'wb-log',
        slot: 'primary',
        kind: 'whiteboard',
        part: 'log',
        mimeType: 'application/json',
        uploadState: 'uploaded',
      },
    ],
  },
];

/** A hand-drawn-looking 4:3 picture so the fixture shows a real image. */
const WB_PICTURE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1200"><rect width="1600" height="1200" fill="#fff"/><g stroke="#e2e8f0" stroke-width="2">${Array.from({ length: 15 }, (_, i) => `<line x1="${(i + 1) * 100}" y1="0" x2="${(i + 1) * 100}" y2="1200"/>`).join('')}${Array.from({ length: 11 }, (_, i) => `<line x1="0" y1="${(i + 1) * 100}" x2="1600" y2="${(i + 1) * 100}"/>`).join('')}</g><g stroke="#334155" stroke-width="4"><line x1="0" y1="600" x2="1600" y2="600"/><line x1="800" y1="0" x2="800" y2="1200"/></g><path d="M300 1000 L1300 200" stroke="#2d3f89" stroke-width="10" fill="none" stroke-linecap="round"/><circle cx="800" cy="600" r="16" fill="#ad2122"/><path d="M1000 900 q60 -80 140 -20 t140 -10" stroke="#ad2122" stroke-width="8" fill="none" stroke-linecap="round"/><text x="1020" y="980" font-family="Patrick Hand, cursive" font-size="64" fill="#ad2122">slope = 4/5</text></svg>`;

const WB_COMMENTS: WrittenAnswerAnnotation[] = [
  {
    id: 'c1',
    from: 4000,
    to: 4000,
    comment: 'Good start: you found the intercept first.',
  },
  {
    id: 'c2',
    from: 21000,
    to: 21000,
    comment: 'Check your rise over run here.',
  },
] as unknown as WrittenAnswerAnnotation[];

const SESSION = {
  id: 'session-dev',
  quizTitle: 'Explaining Your Thinking',
  sessionMode: 'student',
  scoreVisibility: 'score-and-responses',
  mediaResponseEnabled: true,
  publicQuestions: [
    {
      id: 'q1',
      text: 'Explain how you solved question 4.',
      type: 'free-response',
    },
  ],
} as unknown as QuizSession;

const RESPONSE = {
  studentUid: 'student-dev',
  _responseKey: 'response-dev',
  answers: ANSWERS,
  score: 80,
  artifactArchive: { 'artifact-1': ARCHIVE.provisional },
} as unknown as QuizResponse;

export const ResultsPlaybackDevView: React.FC<{
  state: ResultsPlaybackStateKey;
}> = ({ state }) => {
  const fetchPlayback: FetchPlayback = useMemo(() => {
    const data = toneWavBase64();
    return () =>
      Promise.resolve({
        status: 'ready' as const,
        artifactId: 'artifact-1',
        takeIndex: 1,
        mimeType: 'audio/wav',
        data,
        durationMs: 1000,
      });
  }, []);
  const whiteboardFetch: FetchPlayback = useMemo(() => {
    const tone = toneWavBase64();
    const picture = btoa(WB_PICTURE_SVG);
    const log = btoa(
      JSON.stringify({
        v: 1,
        page: { w: 1600, h: 1200 },
        startingPageId: 'grid',
        events: [{ t: 30000, op: 'undo' }],
      })
    );
    return (req) =>
      Promise.resolve({
        status: 'ready' as const,
        artifactId: `wb-${req.part ?? 'audio'}`,
        takeIndex: 1,
        mimeType:
          req.part === 'picture'
            ? 'image/svg+xml'
            : req.part === 'log'
              ? 'application/json'
              : 'audio/wav',
        data:
          req.part === 'picture' ? picture : req.part === 'log' ? log : tone,
        durationMs: 1000,
      });
  }, []);

  if (state.startsWith('wb-')) {
    const archive = ARCHIVE[state];
    return (
      <div className="h-full w-full overflow-auto bg-slate-50 p-6">
        <article className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="mb-2 text-sm font-semibold text-slate-900">
            Graph y = 4/5x + 1 and explain how you found the slope.
          </p>
          <ResponsePlaybackCard
            key={state}
            sessionId="session-dev"
            responseKey="response-dev"
            questionId="q1"
            answers={WB_ANSWERS}
            artifactArchive={{
              'wb-audio': archive,
              'wb-picture': archive,
              'wb-log': archive,
            }}
            gradedTakeIndex={state === 'wb-ready' ? 1 : undefined}
            annotations={state === 'wb-ready' ? WB_COMMENTS : undefined}
            whiteboardEnabled
            fetchPlayback={whiteboardFetch}
          />
        </article>
      </div>
    );
  }

  if (state === 'provisional') {
    return (
      <div className="h-full w-full overflow-auto">
        <PublishedScoreReview
          session={SESSION}
          myResponse={RESPONSE}
          visibility="score-and-responses"
          pin="4821"
        />
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-auto bg-slate-50 p-6">
      <article className="rounded-xl border border-slate-200 bg-white p-4">
        <p className="mb-2 text-sm font-semibold text-slate-900">
          Explain how you solved question 4.
        </p>
        <ResponsePlaybackCard
          key={state}
          sessionId="session-dev"
          responseKey="response-dev"
          questionId="q1"
          answers={ANSWERS}
          artifactArchive={{ 'artifact-1': ARCHIVE[state] }}
          fetchPlayback={fetchPlayback}
        />
      </article>
    </div>
  );
};
