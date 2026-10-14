import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { WhiteboardStartingPage } from '@/types';
import { Modal } from '@/components/common/Modal';
import {
  drawStartingPage,
  WHITEBOARD_PAGE_HEIGHT,
  WHITEBOARD_PAGE_WIDTH,
} from '@/utils/whiteboard/startingPage';

const PREVIEW_SCALE = 0.75;

export interface WhiteboardStartingPagePreviewModalProps {
  page: WhiteboardStartingPage;
  resolveImageUrl: (driveFileId: string) => string;
  onClose: () => void;
}

/** Shows the starting page at a readable size, as students will see it. */
export const WhiteboardStartingPagePreviewModal: React.FC<
  WhiteboardStartingPagePreviewModalProps
> = ({ page, resolveImageUrl, onClose }) => {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loadedImage, setLoadedImage] = useState<{
    url: string;
    el: HTMLImageElement;
  } | null>(null);

  const imageUrl = page.image
    ? resolveImageUrl(page.image.driveFileId)
    : undefined;
  useEffect(() => {
    if (!imageUrl) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    let live = true;
    img.onload = () => {
      if (live) setLoadedImage({ url: imageUrl, el: img });
    };
    img.src = imageUrl;
    return () => {
      live = false;
    };
  }, [imageUrl]);
  const previewImage =
    imageUrl && loadedImage?.url === imageUrl ? loadedImage.el : null;

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(PREVIEW_SCALE, 0, 0, PREVIEW_SCALE, 0, 0);
    drawStartingPage(ctx, page, previewImage);
  }, [page, previewImage]);

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={t('quizMediaResponse.authoring.whiteboard.startingPageLabel')}
      maxWidth="max-w-4xl"
      zIndex="z-modal-deep"
    >
      <canvas
        ref={canvasRef}
        width={WHITEBOARD_PAGE_WIDTH * PREVIEW_SCALE}
        height={WHITEBOARD_PAGE_HEIGHT * PREVIEW_SCALE}
        role="img"
        aria-label={t('quizMediaResponse.authoring.whiteboard.previewLabel')}
        className="block w-full aspect-[4/3] rounded-lg border border-slate-200 bg-white"
      />
    </Modal>
  );
};
