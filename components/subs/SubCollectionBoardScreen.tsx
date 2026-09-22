/**
 * SubCollectionBoardScreen — frozen, read-only-but-content-interactive view of
 * the boards inside a substitute-mode shared Collection.
 *
 * This is the Collection sibling of `SubBoardScreen`. The differences are the
 * data source and the navigation: a single-board substitute share lives at
 * `/shared_boards/{shareId}`, whereas a Collection board lives at
 * `/shared_collections/{shareId}/boards/{boardId}` (with share-level metadata
 * on the parent `/shared_collections/{shareId}` doc), and the sub walks
 * between those boards in place via `SubBoardNav`.
 * `useSubstituteCollectionBoard` splices the two reads into the same
 * `SubstituteShareDoc` shape, so once loaded we render the exact same
 * `SubsDashboardProvider` + toolbar + canvas chrome via the shared
 * `SubBoardScreenContent`.
 *
 * The board on screen is held here rather than lifted to `SubsApp` so the
 * provider is never unmounted mid-walk — unmounting it would throw away every
 * board's session state (plan D3).
 */

import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSubstituteCollectionBoard } from '@/hooks/useSubstituteShares';
import { useSubstituteRosters } from '@/hooks/useSubstituteRosters';
import { SubsDashboardProvider } from './SubsDashboardProvider';
import { SubBoardScreenContent, ExpiredOrErrorPanel } from './SubBoardScreen';
import { SubBoardNav } from './SubBoardNav';
import { buildSubShareNav, type SubShareNavSource } from './subShareNav';
import type { SubstituteShareDoc } from '@/hooks/useSubstituteShares';

interface SubCollectionBoardScreenProps {
  shareId: string;
  boardId: string;
  buildingId: string;
  onBackToDirectory: () => void;
  onChangeBuilding: () => void;
}

/** The board currently on screen, kept while the next one is being read. */
interface ShownBoard {
  boardId: string;
  share: SubstituteShareDoc;
  navSource: SubShareNavSource | null;
}

export const SubCollectionBoardScreen: React.FC<
  SubCollectionBoardScreenProps
> = ({
  shareId,
  boardId: initialBoardId,
  buildingId,
  onBackToDirectory,
  onChangeBuilding,
}) => {
  const { t } = useTranslation();
  const [boardId, setBoardId] = useState(initialBoardId);
  // Bumped by "Try again". Picking the board that just failed sets state to
  // the value it already holds, so React bails out and nothing re-reads —
  // this is what makes a retry of the same board actually fire.
  const [attempt, setAttempt] = useState(0);
  const { share, loading, error, navSource } = useSubstituteCollectionBoard(
    shareId,
    boardId,
    buildingId,
    attempt
  );

  // Adjusting state while rendering, per CLAUDE.md: hold on to the board that
  // is on screen so a board switch does not fall back through the loading
  // branch and unmount the provider.
  const [shown, setShown] = useState<ShownBoard | null>(null);
  if (share && (!shown || shown.boardId !== boardId)) {
    setShown({ boardId, share, navSource });
  }

  const rosterState = useSubstituteRosters(
    share?.sharedRosters ?? shown?.share.sharedRosters
  );
  const [expired, setExpired] = useState(false);

  // Mirror SubBoardScreen: imperative 60s tick so an idle sub gets bounced
  // back when the share lapses while a board is open. Date.now() stays inside
  // the effect, never in render.
  const expiresAt = shown?.share.expiresAt ?? share?.expiresAt;
  useEffect(() => {
    if (!expiresAt) return;
    const check = () => {
      if (expiresAt <= Date.now()) setExpired(true);
    };
    check();
    const id = window.setInterval(check, 60_000);
    return () => window.clearInterval(id);
  }, [expiresAt]);

  useEffect(() => {
    if (!expired) return;
    const id = window.setTimeout(onBackToDirectory, 1500);
    return () => window.clearTimeout(id);
  }, [expired, onBackToDirectory]);

  const shownNavSource = shown?.navSource ?? null;
  const nav = useMemo(() => {
    if (!shownNavSource) return null;
    return buildSubShareNav(shownNavSource, (id) =>
      t('subShare.nav.unnamedBoard', {
        defaultValue: 'Board …{{suffix}}',
        suffix: id.slice(-4),
      })
    );
  }, [shownNavSource, t]);

  // Expiry is terminal for the whole share, so it takes the screen down. A
  // failed read of the *next* board is not: tearing the provider down here
  // would throw away every board's session state over a network blip, so the
  // board the sub is on stays put and the failure is reported beside it.
  if (expired || (!!error && !shown)) {
    return (
      <div className="min-h-screen bg-slate-900">
        <ExpiredOrErrorPanel
          message={
            expired ? 'This share has expired.' : (error ?? 'Board not found.')
          }
          onBack={onBackToDirectory}
        />
      </div>
    );
  }

  if (!shown) {
    if (loading) {
      return (
        <div className="min-h-screen flex items-center justify-center text-white/60 bg-slate-900">
          <Loader2 className="w-8 h-8 animate-spin" />
        </div>
      );
    }
    return (
      <div className="min-h-screen bg-slate-900">
        <ExpiredOrErrorPanel
          message="Board not found."
          onBack={onBackToDirectory}
        />
      </div>
    );
  }

  return (
    <SubsDashboardProvider
      share={shown.share}
      boardKey={shown.boardId}
      rosterState={rosterState}
    >
      <SubBoardScreenContent
        share={shown.share}
        onBackToDirectory={onBackToDirectory}
        onChangeBuilding={onChangeBuilding}
      />
      {nav && (
        <SubBoardNav
          nav={nav}
          currentBoardId={shown.boardId}
          onPickBoard={setBoardId}
        />
      )}
      {loading && (
        <div
          role="status"
          className="fixed bottom-6 right-4 z-dock flex items-center gap-2 rounded-full bg-slate-900/70 backdrop-blur-sm border border-white/15 px-3 py-1.5 text-xs text-slate-200"
        >
          <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
          {t('subShare.nav.opening', { defaultValue: 'Opening…' })}
        </div>
      )}
      {!!error && (
        <div
          role="alert"
          className="fixed bottom-6 right-4 z-dock flex max-w-sm items-center gap-2 rounded-full bg-amber-500/25 backdrop-blur-sm border border-amber-300/40 px-3 py-1.5 text-xs text-white"
        >
          <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden />
          <span className="font-bold">
            {t('subShare.nav.openFailed', {
              defaultValue: '{{reason}} You are still on “{{board}}”.',
              reason: error,
              board: shown.share.name ?? '',
            })}
          </span>
          <button
            type="button"
            onClick={() => setAttempt((n) => n + 1)}
            className="shrink-0 rounded-full bg-white/20 hover:bg-white/30 px-2 py-0.5 font-bold transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
          >
            {t('subShare.nav.tryAgain', { defaultValue: 'Try again' })}
          </button>
        </div>
      )}
    </SubsDashboardProvider>
  );
};
