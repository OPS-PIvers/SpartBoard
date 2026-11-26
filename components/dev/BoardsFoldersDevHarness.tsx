// Real Boards window on in-memory fixture boards and collections at /boards-folders-dev (auth-bypass only), for layout checks.

import React, { useMemo, useState } from 'react';
import {
  DashboardContext,
  type DashboardContextValue,
} from '@/context/DashboardContextValue';
import { DialogProvider } from '@/context/DialogContext';
import { DialogContainer } from '@/components/common/DialogContainer';
import { AuthProvider } from '@/context/AuthContext';
import { BoardsModal } from '@/components/boardsModal/BoardsModal';
import type { Collection, Dashboard } from '@/types';
import { withPaletteColor } from '@/components/boardsModal/collectionFolders';

const NOW = Date.UTC(2026, 10, 20);
const asyncNoop = (): Promise<void> => Promise.resolve();

const col = (
  id: string,
  name: string,
  parent: string | null,
  order: number,
  color?: string
): Collection => ({
  id,
  name,
  parentCollectionId: parent,
  order,
  createdAt: NOW,
  ...(color ? { color } : {}),
});

const INITIAL_COLLECTIONS: Collection[] = [
  col('c1', 'Period 1 - Social Studies', null, 0, '#2d3f89'),
  col('c2', 'Period 3 - Grade 7 Social Studies (Ivers)', null, 1, '#059669'),
  col('c3', 'Advisory', null, 2, '#d97706'),
  col('c4', 'Unit 1 Geography', 'c1', 0, '#7c3aed'),
  col('c5', 'Unit 2 Ancient Civilizations', 'c1', 1),
  col('c6', 'Testing week', null, 3, '#ff6b9a'),
];

const board = (
  id: string,
  name: string,
  collectionId: string | null,
  order: number
): Dashboard => ({
  id,
  name,
  background: 'bg-slate-800',
  widgets: [],
  createdAt: NOW,
  order,
  collectionId,
});

const INITIAL_BOARDS: Dashboard[] = [
  board('b1', 'Morning meeting', null, 0),
  board('b2', 'Bell work', 'c1', 0),
  board('b3', 'Map skills', 'c4', 0),
  board('b4', 'Exit ticket', 'c1', 1),
  board('b5', 'Advisory check-in', 'c3', 0),
  board('b6', 'Quiet reading', null, 1),
];

let nextId = 100;

const Harness: React.FC = () => {
  const [collections, setCollections] =
    useState<Collection[]>(INITIAL_COLLECTIONS);
  const [dashboards, setDashboards] = useState<Dashboard[]>(INITIAL_BOARDS);

  const value = useMemo(
    () =>
      ({
        dashboards,
        activeDashboard: dashboards[0],
        loadDashboard: () => undefined,
        createNewDashboard: (name: string) => {
          setDashboards((d) => [...d, board(`b${nextId++}`, name, null, 99)]);
          return Promise.resolve();
        },
        deleteDashboard: (id: string) => {
          setDashboards((d) => d.filter((b) => b.id !== id));
          return Promise.resolve();
        },
        moveBoardToCollection: (id: string, collectionId: string | null) => {
          setDashboards((d) =>
            d.map((b) => (b.id === id ? { ...b, collectionId } : b))
          );
          return Promise.resolve();
        },
        countLinkedBoardRemovals: () => 0,
        stopSharingCollection: asyncNoop,
        leaveSharedCollection: asyncNoop,
        pinBoard: asyncNoop,
        unpinBoard: asyncNoop,
        renameDashboard: asyncNoop,
        duplicateDashboard: asyncNoop,
        duplicateCollection: asyncNoop,
        setDefaultDashboard: asyncNoop,
        shareDashboard: asyncNoop,
        shareCollection: asyncNoop,
        shareLinkedCollection: asyncNoop,
        addToast: () => undefined,
        collectionsApi: {
          collections: collections.map(withPaletteColor),
          createCollection: (name: string, parent: string | null) => {
            const id = `c${nextId++}`;
            setCollections((c) => [...c, col(id, name, parent, 99)]);
            return Promise.resolve(id);
          },
          deleteCollection: (id: string) => {
            setCollections((c) => c.filter((x) => x.id !== id));
            return Promise.resolve();
          },
          renameCollection: (id: string, name: string) => {
            setCollections((c) =>
              c.map((x) => (x.id === id ? { ...x, name } : x))
            );
            return Promise.resolve();
          },
          setCollectionMetadata: (
            id: string,
            patch: Partial<Pick<Collection, 'color' | 'icon'>>
          ) => {
            setCollections((c) =>
              c.map((x) => {
                if (x.id !== id) return x;
                const next: Collection = { ...x, ...patch };
                if (patch.color === '') delete next.color;
                return next;
              })
            );
            return Promise.resolve();
          },
          moveCollection: (id: string, parent: string | null) => {
            setCollections((c) =>
              c.map((x) =>
                x.id === id ? { ...x, parentCollectionId: parent } : x
              )
            );
            return Promise.resolve();
          },
          reorderSiblings: asyncNoop,
        },
      }) as unknown as DashboardContextValue,
    [collections, dashboards]
  );

  return (
    <DashboardContext.Provider value={value}>
      <div className="h-screen w-screen bg-slate-700">
        <BoardsModal onClose={() => undefined} />
      </div>
    </DashboardContext.Provider>
  );
};

export const BoardsFoldersDevHarness: React.FC = () => (
  <DialogProvider>
    <AuthProvider>
      <Harness />
      <DialogContainer />
    </AuthProvider>
  </DialogProvider>
);
