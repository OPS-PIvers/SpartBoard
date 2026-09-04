/**
 * NotebookViewsDevHarness — DEV-only visual harness for the SmartNotebook
 * widget's UI states (Library / Viewer / PageEditorOverlay) against a real
 * converted mock notebook, with no Firestore or Storage — for Help Center
 * doc screenshots.
 *
 * Mounts the REAL components against a notebook produced by running a small
 * in-memory .olf through the actual convertOlfToBundle + parseNotebookFile
 * pipeline (see notebookViewsMocks.ts), so the screenshots show real
 * converted output rather than hand-drawn placeholders.
 *
 * State is selected via ?state=, with a top bar of links to switch between
 * them. Mounted at /notebook-views-dev in DEV builds only (same gating
 * pattern as SessionViewsDevHarness) — excluded from production bundles.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Library } from '@/components/widgets/SmartNotebook/components/Library';
import { Viewer } from '@/components/widgets/SmartNotebook/components/Viewer';
import { PageEditorOverlay } from '@/components/widgets/SmartNotebook/components/PageEditorOverlay';
import { Toast } from '@/components/common/Toast';
import { NotebookItem } from '@/types';
import {
  buildMockNotebook,
  makeEmptyNotebookItem,
  MockNotebook,
} from './notebookViewsMocks';

const STATES = [
  { key: 'library', label: 'Library' },
  { key: 'viewer', label: 'Viewer (page 1)' },
  { key: 'viewer-hidden', label: 'Viewer (hidden page)' },
  { key: 'jump-menu', label: 'Viewer (jump menu open)' },
  { key: 'editor', label: 'Editor (page 1)' },
  { key: 'editor-hidden', label: 'Editor (hidden page)' },
] as const;
type StateKey = (typeof STATES)[number]['key'];

const readStateFromUrl = (): StateKey => {
  const raw = new URLSearchParams(window.location.search).get('state');
  return STATES.find((s) => s.key === raw)?.key ?? 'library';
};

const noop = () => undefined;
const asyncNoop = () => Promise.resolve();

export const NotebookViewsDevHarness: React.FC = () => {
  const [state, setState] = useState<StateKey>(readStateFromUrl);
  const [mock, setMock] = useState<MockNotebook | null>(null);
  const [hiddenPages, setHiddenPages] = useState<number[] | undefined>();
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    void buildMockNotebook().then((built) => {
      if (cancelled) return;
      setMock(built);
      setHiddenPages(built.item.hiddenPages);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectState = (key: StateKey) => {
    setState(key);
    const url = new URL(window.location.href);
    url.searchParams.set('state', key);
    window.history.replaceState(null, '', url);
  };

  const toggleHiddenPage = (page: number) => {
    setHiddenPages((prev) => {
      const set = new Set(prev ?? []);
      if (set.has(page)) set.delete(page);
      else set.add(page);
      return Array.from(set).sort((a, b) => a - b);
    });
  };

  return (
    <div className="min-h-screen w-full bg-slate-900 p-8 flex flex-col items-start gap-6">
      <div className="flex flex-wrap items-center gap-2">
        {STATES.map((s) => (
          <button
            key={s.key}
            onClick={() => selectState(s.key)}
            className={`px-3 py-2 rounded text-sm font-bold transition ${
              state === s.key
                ? 'bg-blue-500 text-white'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div
        className="relative rounded-2xl border border-slate-700 bg-slate-100 shadow-xl overflow-hidden"
        style={{ width: 900, height: 640, containerType: 'size' }}
      >
        {!mock ? (
          <div className="h-full w-full flex items-center justify-center text-slate-400">
            Building mock notebook…
          </div>
        ) : (
          <NotebookViewsState
            state={state}
            mock={mock}
            hiddenPages={hiddenPages}
            onToggleHiddenPage={toggleHiddenPage}
            fileInputRef={fileInputRef}
          />
        )}
      </div>
    </div>
  );
};

const NotebookViewsState: React.FC<{
  state: StateKey;
  mock: MockNotebook;
  hiddenPages: number[] | undefined;
  onToggleHiddenPage: (page: number) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
}> = ({ state, mock, hiddenPages, onToggleHiddenPage, fileInputRef }) => {
  const activeNotebook: NotebookItem = { ...mock.item, hiddenPages };

  if (state === 'library') {
    const notebooks = [mock.item, makeEmptyNotebookItem()];
    return (
      <>
        <Library
          notebooks={notebooks}
          isImporting={false}
          handleImport={asyncNoop}
          handleSelect={noop}
          handleDelete={asyncNoop}
          handleRename={noop}
          handleShare={noop}
          displayMode="cards"
          onChangeDisplayMode={noop}
          fileInputRef={fileInputRef}
        />
        <Toast message={mock.importSummaryText} type="success" />
      </>
    );
  }

  if (state === 'viewer' || state === 'viewer-hidden') {
    return (
      <Viewer
        activeNotebook={activeNotebook}
        hasAssets={false}
        showAssets={false}
        setShowAssets={noop}
        handleClose={noop}
        currentPage={state === 'viewer-hidden' ? 1 : 0}
        setCurrentPage={noop}
        handleDragStart={noop}
        placedAssets={[]}
        onPlaceAsset={noop}
        onUpdatePlacedAsset={noop}
        onRemovePlacedAsset={noop}
        onToggleHiddenPage={() =>
          onToggleHiddenPage(state === 'viewer-hidden' ? 1 : 0)
        }
      />
    );
  }

  if (state === 'jump-menu') {
    return (
      <Viewer
        activeNotebook={activeNotebook}
        hasAssets={false}
        showAssets={false}
        setShowAssets={noop}
        handleClose={noop}
        currentPage={0}
        setCurrentPage={noop}
        handleDragStart={noop}
        placedAssets={[]}
        onPlaceAsset={noop}
        onUpdatePlacedAsset={noop}
        onRemovePlacedAsset={noop}
        onToggleHiddenPage={() => onToggleHiddenPage(0)}
        initialJumpMenuOpen
      />
    );
  }

  // editor / editor-hidden
  const page = state === 'editor-hidden' ? 1 : 0;
  return (
    <PageEditorOverlay
      title={activeNotebook.title}
      activeNotebookId={activeNotebook.id}
      pageUrls={activeNotebook.pageUrls}
      cachedSvg={null}
      currentPage={page}
      sections={activeNotebook.sections}
      objectLinks={activeNotebook.objectLinks}
      saveStatus="idle"
      onEditChange={noop}
      onPageChange={noop}
      hiddenPages={hiddenPages}
      onToggleHiddenPage={() => onToggleHiddenPage(page)}
      onPresent={noop}
      onClose={noop}
    />
  );
};
