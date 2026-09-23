import { useCallback, useContext, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DialogContext } from '@/context/DialogContextValue';
import { useGoogleDrive } from '@/hooks/useGoogleDrive';
import { fetchSlideBlob } from '../../utils/fetchSlideBlob';
import {
  redactImage,
  type RedactMode,
  type RedactRect,
} from '../../utils/redactImage';
import type { GuidedLearningEditorController } from '../useGuidedLearningEditorState';

/** Bakes blur areas into the current slide: download, redact, upload, replace. */
export function useApplyRedaction(state: GuidedLearningEditorController) {
  const { t } = useTranslation();
  const dialog = useContext(DialogContext);
  const { driveService } = useGoogleDrive();
  const [applying, setApplying] = useState(false);
  const { imageUrls, replaceSlideImage } = state;

  const apply = useCallback(
    async (
      index: number,
      rects: RedactRect[],
      mode: RedactMode
    ): Promise<boolean> => {
      const url = imageUrls[index];
      if (!url || rects.length === 0) return false;
      const ok = dialog
        ? await dialog.showConfirm(t('glStudio.blurConfirm'), {
            title: t('glStudio.blurConfirmTitle'),
            confirmLabel: t('glStudio.blurApply'),
          })
        : true;
      if (!ok) return false;
      setApplying(true);
      try {
        const source = await fetchSlideBlob(url, driveService);
        const redacted = await redactImage(source, rects, { mode });
        return await replaceSlideImage(index, redacted);
      } catch (err) {
        console.error('[GuidedLearningStudio] Blur failed:', err);
        await dialog?.showAlert(t('glStudio.blurFailed'));
        return false;
      } finally {
        setApplying(false);
      }
    },
    [imageUrls, dialog, t, driveService, replaceSlideImage]
  );

  return { apply, applying };
}
