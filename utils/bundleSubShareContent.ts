/**
 * Collects, at share time, the widget data a substitute cannot reach.
 *
 * Runs on the teacher's own client, which is the only place that can read
 * their `users/` tree. Anything that fails to read is reported rather than
 * shipped empty, so the teacher finds out at share time instead of the sub
 * finding out mid-lesson.
 */

import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { logError } from '@/utils/logError';
import { subShareContentId } from '@/utils/subShareContent';
import type {
  Dashboard,
  DrawableObject,
  DrawingPage,
  NotebookItem,
  SmartNotebookConfig,
  SubShareContentDoc,
  SubShareContentKind,
  SubShareDrawingPayload,
  SubShareNotebookPayload,
  WidgetData,
} from '@/types';

export interface SubShareBundleItem {
  id: string;
  doc: SubShareContentDoc;
}

export interface SubShareBundleFailure {
  kind: SubShareContentKind;
  itemId: string;
  /** What to call it in front of the teacher, e.g. "Drawing on Warm up". */
  label: string;
}

export interface SubShareBundle {
  items: SubShareBundleItem[];
  failures: SubShareBundleFailure[];
}

interface DrawingConfig {
  pages?: DrawingPage[];
  subcollectionMigrated?: boolean;
}

/** Drawing widgets whose strokes moved to their own subcollection. */
function migratedDrawings(board: Dashboard): WidgetData[] {
  return (board.widgets ?? []).filter((w) => {
    if (w.type !== 'drawing') return false;
    return (
      (w.config as DrawingConfig | undefined)?.subcollectionMigrated === true
    );
  });
}

async function bundleDrawing(
  hostUid: string,
  board: Dashboard,
  widget: WidgetData
): Promise<SubShareDrawingPayload> {
  const pages = (widget.config as DrawingConfig | undefined)?.pages ?? [];
  const bundled: SubShareDrawingPayload['pages'] = [];
  for (const page of pages) {
    const snap = await getDocs(
      collection(
        db,
        'users',
        hostUid,
        'dashboards',
        board.id,
        'drawings',
        widget.id,
        'pages',
        page.id,
        'objects'
      )
    );
    const objects = snap.docs
      .map((d) => d.data() as DrawableObject)
      .sort((a, b) => a.z - b.z);
    bundled.push({ pageId: page.id, objects });
  }
  return { pages: bundled };
}

/** The notebook each Smart Notebook widget on the board is open on. */
function openNotebookIds(board: Dashboard): string[] {
  const ids: string[] = [];
  for (const widget of board.widgets ?? []) {
    if (widget.type !== 'smartNotebook') continue;
    const id = (widget.config as SmartNotebookConfig | undefined)
      ?.activeNotebookId;
    if (id) ids.push(id);
  }
  return ids;
}

async function bundleNotebook(
  hostUid: string,
  notebookId: string
): Promise<SubShareNotebookPayload> {
  const snap = await getDoc(doc(db, 'users', hostUid, 'notebooks', notebookId));
  if (!snap.exists()) throw new Error('notebook not found');
  const data = snap.data();
  // Page images are Storage download URLs, which carry their own token, so the
  // sub can load them without a rule of their own.
  const notebook: NotebookItem = {
    id: snap.id,
    title: (data.title as string) ?? 'Untitled',
    pageUrls: (data.pageUrls as string[]) ?? [],
    pagePaths: (data.pagePaths as string[]) ?? [],
    assetUrls: (data.assetUrls as string[]) ?? [],
    createdAt: (data.createdAt as number) ?? 0,
    sections: data.sections as NotebookItem['sections'],
    objectLinks: data.objectLinks as NotebookItem['objectLinks'],
    hiddenPages: data.hiddenPages as number[] | undefined,
  };
  return { notebook };
}

export async function bundleSubShareContent({
  hostUid,
  boards,
}: {
  hostUid: string;
  boards: Dashboard[];
}): Promise<SubShareBundle> {
  const items: SubShareBundleItem[] = [];
  const failures: SubShareBundleFailure[] = [];
  const bundledAt = Date.now();

  // One item shared by two boards is bundled once.
  const done = new Set<string>();

  for (const board of boards) {
    for (const widget of migratedDrawings(board)) {
      try {
        const payload = await bundleDrawing(hostUid, board, widget);
        items.push({
          id: subShareContentId('drawing', widget.id),
          doc: {
            kind: 'drawing',
            itemId: widget.id,
            bundledAt,
            payload,
          },
        });
      } catch (err) {
        logError('bundleSubShareContent.drawing', err, {
          boardId: board.id,
          widgetId: widget.id,
        });
        failures.push({
          kind: 'drawing',
          itemId: widget.id,
          label: `Drawing on ${board.name}`,
        });
      }
    }

    for (const id of openNotebookIds(board)) {
      const contentId = subShareContentId('notebook', id);
      if (done.has(contentId)) continue;
      done.add(contentId);
      try {
        const payload = await bundleNotebook(hostUid, id);
        items.push({
          id: contentId,
          doc: { kind: 'notebook', itemId: id, bundledAt, payload },
        });
      } catch (err) {
        logError('bundleSubShareContent.notebook', err, {
          boardId: board.id,
          notebookId: id,
        });
        failures.push({
          kind: 'notebook',
          itemId: id,
          label: `Notebook on ${board.name}`,
        });
      }
    }
  }

  return { items, failures };
}
