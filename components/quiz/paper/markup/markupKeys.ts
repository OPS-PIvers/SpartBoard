import type React from 'react';
import {
  NUDGE_FAR_MM,
  NUDGE_MM,
  type PaperMarkupEditor,
} from './usePaperMarkupEditor';

const isTextEntry = (el: EventTarget | null) =>
  el instanceof HTMLTextAreaElement ||
  el instanceof HTMLInputElement ||
  el instanceof HTMLSelectElement ||
  (el instanceof HTMLElement && el.isContentEditable);

const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

/** Keys for the markup area (toolbar and image); text fields keep their own undo and Escape. */
export function handleMarkupKey(
  editor: PaperMarkupEditor,
  e: React.KeyboardEvent
): void {
  if (isTextEntry(e.target)) return;
  const mod = e.ctrlKey || e.metaKey;
  const key = e.key.toLowerCase();
  let handled = false;
  if (mod && key === 'z') {
    if (e.shiftKey) editor.history.redo();
    else editor.history.undo();
    handled = true;
  } else if (mod && key === 'y') {
    editor.history.redo();
    handled = true;
  } else if (mod || e.altKey) {
    return;
  } else if (e.key === 'Delete' || e.key === 'Backspace') {
    if (editor.selectedId) {
      editor.deleteSelected();
      handled = true;
    }
  } else if (e.key === 'Escape') {
    handled = editor.escape();
  } else if (e.key in ARROWS) {
    const onLayer =
      e.target instanceof HTMLElement &&
      e.target.dataset.tour === 'quiz-grading.markup-canvas';
    if (onLayer && editor.selectedId) {
      const [dx, dy] = ARROWS[e.key];
      const step = e.shiftKey ? NUDGE_FAR_MM : NUDGE_MM;
      handled = editor.nudge(dx * step, dy * step);
    }
  } else if (e.key === 'Enter' || e.key === ' ') {
    const onLayer =
      e.target instanceof HTMLElement &&
      e.target.dataset.tour === 'quiz-grading.markup-canvas';
    if (onLayer) {
      if (editor.selectedId) {
        editor.openComment(editor.selectedId);
        handled = true;
      } else {
        handled = editor.placeAtCentre();
      }
    }
  }
  if (handled) {
    e.preventDefault();
    e.stopPropagation();
  }
}
