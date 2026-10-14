import { createContext } from 'react';

/** Whether this assignment's single notice also covers whiteboard replay (D11). */
export type RecordingNoticeDrawing = 'narrated' | 'draw-only' | null;

export const RecordingNoticeDrawingContext =
  createContext<RecordingNoticeDrawing>(null);
