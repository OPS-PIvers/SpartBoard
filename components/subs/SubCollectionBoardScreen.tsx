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

import React, { useEffect, useState } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  useSubstituteCollectionBoard,
  useSubShareContentVersion,
} from '@/hooks/useSubstituteShares';
import { useSubstituteRosters } from '@/hooks/useSubstituteRosters';
import { SubsDashboardProvider } from './SubsDashboardProvider';
import { SubBoardScreenContent, ExpiredOrErrorPanel } from './SubBoardScreen';
import { SubBoardNav } from './SubBoardNav';
import { SubShareUpdateBanner } from './SubShareUpdateBanner';
import { buildSubShareNav, type SubShareNavSource } from './subShareNav';
import type { SubstituteShareDoc } from '@/hooks/useSubstituteShares';

interface SubCollectionBoardScreenProps {
  shareId: string;
  boardId: string;
  buildingId: string;
  onBackToDirectory: () => void;
  onChangeBuilding: () => void;
}

/** A board the sub has opened, as it looked when they opened it. */
interface ShownBoard {
  boardId: string;
  share: SubstituteShareDoc;
  navSource: SubShareNavSource | null;
}

/** Every board the sub has open, all at the content version they accepted. */
interface ShownState {
  /** The accepted version these snapshots came from. */
  version: number;
  /** The request already taken, so a re-render does not take it twice. */
  key: string | null;
  /** The board on screen. */
  current: string | null;
  boards: ReadonlyMap<string, ShownBoard>;
}

const NO_BOARDS: ReadonlyMap<string, ShownBoard> = new Map();

/**
 * Folds a completed read into what is on screen, returning the same state when
 * there is nothing to take. Pure, so the caller can hold the result in a const
 * and the React compiler can still memoize off it.
 */
function takeRead(
  state: ShownState,
  version: number,
  requestKey: string,
  board: ShownBoard | null
): ShownState {
  // Accepting drops every snapshot, so no board is left on old content.
  const base =
    state.version === version
      ? state
      : { version, key: null, current: null, boards: NO_BOARDS };
  if (!board || base.key === requestKey) return base;
  // A board already opened keeps the snapshot the sub has been working in.
  const boards = base.boards.has(board.boardId)
    ? base.boards
    : new Map(base.boards).set(board.boardId, board);
  return { version, key: requestKey, current: board.boardId, boards };
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
  // The content the sub accepted. Bumping it re-keys every board in the
  // provider, which is how accepting an update replaces what they are looking
  // at; until then their edits stand.
  const [acceptedVersion, setAcceptedVersion] = useState<number | null>(null);
  const { share, loading, error, navSource, contentVersion } =
    useSubstituteCollectionBoard(shareId, boardId, buildingId, attempt);
  const liveVersion = useSubShareContentVersion(shareId);

  // Adjusting state while rendering, per CLAUDE.md: hold on to the boards the
  // sub has opened, so a board switch neither falls back through the loading
  // branch and unmounts the provider, nor re-dresses a board they are already
  // working in. The provider keeps widgets per board, but the background,
  // display settings and viewport size come from the share doc itself, so a
  // board has to keep the whole snapshot it was opened with, not just its
  // widgets — otherwise going away and back after a push would swap the
  // chrome around the sub's own work.
  const requestKey = `${boardId}::${attempt}`;
  // The version the sub has accepted, and the one the first read sets. A board
  // opened for the first time after a push does show the new copy, because
  // there is no older one to show, but the banner stays up for the ones
  // behind it.
  const version = acceptedVersion ?? contentVersion ?? 0;
  const [state, setState] = useState<ShownState>({
    version,
    key: null,
    current: null,
    boards: NO_BOARDS,
  });

  const view = takeRead(
    state,
    version,
    requestKey,
    share ? { boardId, share, navSource } : null
  );
  if (view !== state) {
    setState(view);
    if (acceptedVersion === null && contentVersion !== null) {
      setAcceptedVersion(contentVersion);
    }
  }
  const shown = view.current ? (view.boards.get(view.current) ?? null) : null;

  const rosterState = useSubstituteRosters(
    shown?.share.sharedRosters ?? share?.sharedRosters
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

  // Grouping a handful of boards, so it is computed during render rather than
  // memoized — the snapshot it reads comes out of a map the fold rebuilds, and
  // a dependency the compiler cannot prove immutable makes useMemo here a
  // compile-skip for the whole component.
  const nav = shown?.navSource
    ? buildSubShareNav(shown.navSource, (id) =>
        t('subShare.nav.unnamedBoard', {
          defaultValue: 'Board …{{suffix}}',
          suffix: id.slice(-4),
        })
      )
    : null;

  // "Push my changes" bumps contentVersion on the parent doc. Nothing on
  // screen moves until the sub presses Reload, so a teacher updating
  // mid-lesson cannot wipe a running timer or a half-taken lunch count.
  const hasUpdate =
    liveVersion !== null &&
    acceptedVersion !== null &&
    liveVersion !== acceptedVersion;

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
      boardKey={`${shown.boardId}::${view.version}`}
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
      {hasUpdate && (
        <SubShareUpdateBanner
          teacherName={shown.share.originalAuthorName ?? 'Your teacher'}
          onReload={() => {
            setAcceptedVersion(liveVersion);
            setAttempt((n) => n + 1);
          }}
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
