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
  ArtifactArchiveEntry,
  QuizResponse,
  QuizResponseAnswer,
  QuizSession,
} from '@/types';

export const RESULTS_PLAYBACK_STATES = [
  'playable',
  'archiving',
  'failed',
  'deleted',
  'provisional',
] as const;

export type ResultsPlaybackStateKey = (typeof RESULTS_PLAYBACK_STATES)[number];

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
};

const SESSION = {
  id: 'session-dev',
  quizTitle: 'Explaining Your Thinking',
  sessionMode: 'student',
  scoreVisibility: 'score-and-responses',
  mediaResponseEnabled: true,
  publicQuestions: [
    { id: 'q1', text: 'Explain how you solved question 4.', type: 'short' },
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
