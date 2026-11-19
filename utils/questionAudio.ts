// Where a recorded question prompt plays from, and how its length reads.
import type { QuestionAudio } from '@/types';
import { driveMediaUrl } from '@/utils/quizStimuli';

export function questionAudioUrl(audio: QuestionAudio): string {
  return (
    driveMediaUrl(audio.driveFileId) ??
    `https://drive.google.com/uc?id=${encodeURIComponent(audio.driveFileId)}&export=download`
  );
}

export function formatAudioDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
