/**
 * Drag-and-drop onto a file zone, alongside the click-to-browse input it
 * already has. The browser opens a dropped file as a page unless every drag
 * event over the zone is prevented, so all four handlers belong on the zone.
 */

import { useRef, useState } from 'react';
import type { DragEvent, DragEventHandler } from 'react';

export interface FileDrop {
  /** A file is hovering the zone, for the drop-target styling. */
  dragging: boolean;
  dropProps: {
    onDragEnter: DragEventHandler;
    onDragOver: DragEventHandler;
    onDragLeave: DragEventHandler;
    onDrop: DragEventHandler;
  };
}

/** Dragged text or a dragged card is not a file, and must fall through. */
const hasFiles = (e: DragEvent): boolean =>
  Array.from(e.dataTransfer?.types ?? []).includes('Files');

export function useFileDrop(
  onFile: (file: File) => void,
  disabled = false
): FileDrop {
  return useFilesDrop((files) => onFile(files[0]), disabled);
}

/** The same zone, handing over every dropped file. */
export function useFilesDrop(
  onFiles: (files: File[]) => void,
  disabled = false
): FileDrop {
  // Entering a child fires dragleave on the parent, so count depth instead of
  // clearing on the first leave.
  const depth = useRef(0);
  const [dragging, setDragging] = useState(false);

  return {
    dragging,
    dropProps: {
      // Disabled only stops the file being taken. The default is prevented
      // either way: a zone that lets the drop through navigates the tab to
      // the file, and whatever the teacher had half-filled in is gone.
      onDragEnter: (e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        if (disabled) return;
        depth.current += 1;
        setDragging(true);
      },
      onDragOver: (e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = disabled ? 'none' : 'copy';
      },
      onDragLeave: (e) => {
        if (!hasFiles(e) || disabled) return;
        e.preventDefault();
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setDragging(false);
      },
      onDrop: (e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        depth.current = 0;
        setDragging(false);
        if (disabled) return;
        const files = Array.from(e.dataTransfer.files ?? []);
        if (files.length > 0) onFiles(files);
      },
    },
  };
}
