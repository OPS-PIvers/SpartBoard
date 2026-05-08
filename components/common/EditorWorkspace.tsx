import React from 'react';
import { EditorModalShell } from './EditorModalShell';

interface EditorWorkspaceProps {
  isOpen: boolean;
  title: string;
  subtitle?: React.ReactNode;
  /** Pass-through to `EditorModalShell.onTitleChange`. */
  onTitleChange?: (next: string) => void;
  /** Pass-through to `EditorModalShell.titlePlaceholder`. */
  titlePlaceholder?: string;
  /** Pass-through to `EditorModalShell.headerExtras`. */
  headerExtras?: React.ReactNode;
  isDirty: boolean;
  isSaving?: boolean;
  saveLabel?: string;
  saveDisabled?: boolean;
  footerExtras?: React.ReactNode;
  onSave: () => void | Promise<void>;
  onClose: () => void;
  confirmDiscardMessage?: string;
  confirmDiscardTitle?: string;
  saveErrorMessage?: string | false;
  maxWidth?: string;
  className?: string;
  /**
   * Width split between context pane (left) and detail pane (right) as a
   * percentage 1–99 for the context pane. Default 56 gives the context pane
   * slightly more room — the right place for editors where the canvas (image,
   * video+timeline, question list) is the orientation point.
   */
  contextRatio?: number;
  /** Sticky context content — image canvas, video+timeline, quiz list, etc. */
  contextPane: React.ReactNode;
  /** Detail editor content for the currently-selected item. */
  detailPane: React.ReactNode;
  /** Optional className for the context pane wrapper (background, padding). */
  contextPaneClassName?: string;
  /** Optional className for the detail pane wrapper (background, padding). */
  detailPaneClassName?: string;
  /**
   * Optional content rendered absolutely over both panes — for editor-scoped
   * overlays like an AI generator prompt that should cover the workspace
   * but not the modal chrome (header/footer).
   */
  overlay?: React.ReactNode;
}

/**
 * Two-pane editor workspace built on top of `EditorModalShell`.
 *
 * Splits the modal body into a sticky context pane (left) and a scrolling
 * detail pane (right). Each pane scrolls independently, so an editor can show
 * a list/canvas + always-visible detail editor without forcing the user to
 * scroll back-and-forth.
 *
 * Used by Quiz, Video Activity, and Guided Learning editors. Mini App stays
 * single-column and uses `EditorModalShell` directly.
 */
export const EditorWorkspace: React.FC<EditorWorkspaceProps> = ({
  contextRatio = 56,
  contextPane,
  detailPane,
  contextPaneClassName = 'bg-slate-50 border-r border-slate-200',
  detailPaneClassName = 'bg-white',
  className = 'h-[85vh]',
  overlay,
  ...shellProps
}) => {
  const ctxFr = Math.max(1, Math.min(99, contextRatio));
  const detailFr = 100 - ctxFr;

  return (
    <EditorModalShell
      {...shellProps}
      className={className}
      bodyClassName="!p-0 !overflow-hidden relative"
    >
      <div
        className="grid h-full w-full"
        style={{
          gridTemplateColumns: `minmax(0, ${ctxFr}fr) minmax(0, ${detailFr}fr)`,
        }}
      >
        <div
          className={`min-h-0 overflow-y-auto custom-scrollbar ${contextPaneClassName}`}
        >
          {contextPane}
        </div>
        <div
          className={`min-h-0 overflow-y-auto custom-scrollbar ${detailPaneClassName}`}
        >
          {detailPane}
        </div>
      </div>
      {overlay}
    </EditorModalShell>
  );
};
