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

/** The reload the sub asked for, and the read that will complete it. */
interface PendingAccept {
  version: number;
  requestKey: string;
}

/** Folds a completed read into what is on screen. Pure, so it holds in a const. */
function takeRead(
  state: ShownState,
  version: number,
  requestKey: string,
  board: ShownBoard | null,
  accepting: PendingAccept | null
): ShownState {
  if (!board || state.key === requestKey) return state;
  if (accepting && accepting.requestKey === requestKey) {
    // Accepting replaces every snapshot at once, once the content is in hand.
    return {
      version: accepting.version,
      key: requestKey,
      current: board.boardId,
      boards: new Map([[board.boardId, board]]),
    };
  }
  // A board already opened keeps the snapshot the sub has been working in.
  const boards = state.boards.has(board.boardId)
    ? state.boards
    : new Map(state.boards).set(board.boardId, board);
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
  // Bumped by "Try again": re-picking the same board would bail out.
  const [attempt, setAttempt] = useState(0);
  // The content the sub accepted; until it moves, their edits stand.
  const [acceptedVersion, setAcceptedVersion] = useState<number | null>(null);
  // Set by Reload, cleared when its read lands — never on the click itself.
  const [pendingAccept, setPendingAccept] = useState<PendingAccept | null>(
    null
  );
  const { share, loading, error, navSource, contentVersion } =
    useSubstituteCollectionBoard(shareId, boardId, buildingId, attempt);
  const liveVersion = useSubShareContentVersion(shareId);

  // Adjusting state while rendering, per CLAUDE.md. Each opened board keeps
  // its whole snapshot, not just its widgets: the rest of the board comes from
  // the share doc, which a revisit would otherwise re-dress.
  const requestKey = `${boardId}::${attempt}`;
  // The baseline the first read establishes.
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
    share ? { boardId, share, navSource } : null,
    pendingAccept
  );
  if (view !== state) {
    setState(view);
    if (acceptedVersion === null && contentVersion !== null) {
      setAcceptedVersion(contentVersion);
    }
    if (pendingAccept && pendingAccept.requestKey === requestKey) {
      setAcceptedVersion(pendingAccept.version);
      setPendingAccept(null);
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

  // Computed during render: useMemo on a value out of `boards` compile-skips.
  const nav = shown?.navSource
    ? buildSubShareNav(shown.navSource, (id) =>
        t('subShare.nav.unnamedBoard', {
          defaultValue: 'Board …{{suffix}}',
          suffix: id.slice(-4),
        })
      )
    : null;

  // Nothing on screen moves until the sub presses Reload.
  const reloading =
    !error && pendingAccept !== null && pendingAccept.requestKey === requestKey;
  const hasUpdate =
    liveVersion !== null &&
    acceptedVersion !== null &&
    liveVersion !== acceptedVersion &&
    !reloading;

  // Expiry takes the screen down; a failed read of the next board does not.
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
          onPickBoard={(id) => {
            // Walking away abandons a reload that has not landed.
            setPendingAccept(null);
            setBoardId(id);
          }}
        />
      )}
      {hasUpdate && (
        <SubShareUpdateBanner
          teacherName={shown.share.originalAuthorName ?? 'Your teacher'}
          onReload={() => {
            setPendingAccept({
              version: liveVersion,
              requestKey: `${boardId}::${attempt + 1}`,
            });
            setAttempt(attempt + 1);
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
            onClick={() => {
              setPendingAccept((p) =>
                p ? { ...p, requestKey: `${boardId}::${attempt + 1}` } : null
              );
              setAttempt(attempt + 1);
            }}
            className="shrink-0 rounded-full bg-white/20 hover:bg-white/30 px-2 py-0.5 font-bold transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
          >
            {t('subShare.nav.tryAgain', { defaultValue: 'Try again' })}
          </button>
        </div>
      )}
    </SubsDashboardProvider>
  );
};
