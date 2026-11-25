// Records a prompt and saves it link-shared in the teacher's Drive, like a quiz audio stimulus.
import { useState } from 'react';
import type { QuestionAudio } from '@/types';
import { useGoogleDrive } from '@/hooks/useGoogleDrive';
import { useDialog } from '@/context/useDialog';
import { uploadDriveAsset } from '@/utils/driveAssetUpload';
import {
  usePromptAudioRecorder,
  type PromptAudioTake,
} from './usePromptAudioRecorder';

export const QUIZ_AUDIO_FOLDER = 'Assets/QuizAudio';

const EXTENSION: Record<string, string> = {
  'audio/mp4': 'm4a',
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
};

export function usePromptAudio(
  audio: QuestionAudio | undefined,
  onChange: (audio: QuestionAudio | undefined) => void
) {
  const { driveService } = useGoogleDrive();
  const { showAlert } = useDialog();
  const [saving, setSaving] = useState(false);

  const save = async (take: PromptAudioTake) => {
    if (!driveService) {
      await showAlert('Connect Google Drive to upload files.', {
        variant: 'warning',
      });
      return;
    }
    setSaving(true);
    try {
      const ext = EXTENSION[take.mimeType] ?? 'webm';
      const file = await uploadDriveAsset(driveService, {
        blob: take.blob,
        name: `question-audio-${Date.now()}.${ext}`,
        folder: QUIZ_AUDIO_FOLDER,
        audience: 'anyone',
      });
      onChange({
        driveFileId: file.id,
        durationSec: Math.round(take.durationSec * 10) / 10,
        mimeType: take.mimeType,
        ...(audio?.playLimit ? { playLimit: audio.playLimit } : {}),
      });
    } catch (err) {
      await showAlert(
        err instanceof Error ? err.message : 'Upload failed. Try again.',
        { variant: 'error' }
      );
    } finally {
      setSaving(false);
    }
  };

  const recorder = usePromptAudioRecorder({
    onTake: (take) => void save(take),
    onMicBlocked: () =>
      void showAlert(
        'Your microphone is blocked. Allow it in the browser to record.',
        { variant: 'warning' }
      ),
  });

  return { audio, onChange, saving, recorder };
}
