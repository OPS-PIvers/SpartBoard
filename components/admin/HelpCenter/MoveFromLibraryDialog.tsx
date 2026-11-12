import React, { useState } from 'react';
import { tourAttr, tourFieldAttr } from '@/config/tourAnchors';
import { Loader2, Search } from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import {
  Btn,
  Checkbox,
  Select,
} from '@/components/admin/Organization/components/primitives';
import { useDialog } from '@/context/useDialog';
import type { UseGuidedLearningResult } from '@/hooks/useGuidedLearning';
import type { HelpItemKind, HelpResourceItem } from '@/types/helpCenter';
import { KIND_LABEL } from './helpCenterAdmin';
import {
  helpCopyIdFor,
  isPendingHelpCenterMove,
  moveSetToHelpCenter,
  type HelpAuthor,
  type MoveSource,
} from '@/utils/helpCenterItems';
import {
  helpCenterSetIdsOf,
  isHelpCenterSet,
} from '@/components/widgets/GuidedLearning/utils/helpCenterSets';

type Owner = 'mine' | 'building';
type TypeFilter = 'all' | HelpItemKind;

interface Row {
  key: string;
  title: string;
  kind: HelpItemKind;
  owner: Owner;
  source: MoveSource;
}

interface MoveFromLibraryDialogProps {
  library: Pick<
    UseGuidedLearningResult,
    | 'sets'
    | 'buildingSets'
    | 'loading'
    | 'buildingLoading'
    | 'loadSetData'
    | 'deleteSet'
  >;
  items: readonly HelpResourceItem[];
  author: HelpAuthor;
  onMoved: (itemIds: string[]) => void;
  onClose: () => void;
}

/** Picks library guides and moves each into the Help Center, Hidden and Unfiled (H14). */
export const MoveFromLibraryDialog: React.FC<MoveFromLibraryDialogProps> = ({
  library,
  items,
  author,
  onMoved,
  onClose,
}) => {
  const { showConfirm } = useDialog();
  const [search, setSearch] = useState('');
  const [type, setType] = useState<TypeFilter>('all');
  const [owner, setOwner] = useState<Owner>('mine');
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [moving, setMoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filed = helpCenterSetIdsOf(items);
  const rows: Row[] = [
    ...library.sets
      .filter(
        (set) =>
          !isPendingHelpCenterMove(set) && !filed.has(helpCopyIdFor(set.id))
      )
      .map((set): Row => ({
        key: `personal:${set.id}`,
        title: set.title || 'Untitled guide',
        kind: set.mode === 'tour' ? 'live-tour' : 'picture-guide',
        owner: 'mine',
        source: { kind: 'personal', set },
      })),
    // Index entries never include Web tours, which live in their own collection.
    ...library.buildingSets
      .filter((set) => !isHelpCenterSet(set) && !filed.has(set.id))
      .map((set): Row => ({
        key: `building:${set.id}`,
        title: set.title || 'Untitled guide',
        kind:
          set.hasLiveTour || set.mode === 'tour'
            ? 'live-tour'
            : 'picture-guide',
        owner: 'building',
        source: { kind: 'building', set },
      })),
  ];
  const query = search.trim().toLowerCase();
  const shown = rows.filter(
    (row) =>
      row.owner === owner &&
      (type === 'all' || row.kind === type) &&
      (!query || row.title.toLowerCase().includes(query))
  );
  const pickedRows = rows.filter((row) => picked.has(row.key));
  const loading = owner === 'mine' ? library.loading : library.buildingLoading;

  const toggle = (key: string, checked: boolean) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });

  const handleMove = async () => {
    if (pickedRows.length === 0) return;
    const building = pickedRows.filter((row) => row.owner === 'building');
    const count = pickedRows.length;
    const lines = [
      `Move ${count} ${count === 1 ? 'guide' : 'guides'} to the Help Center? ${count === 1 ? 'It starts' : 'They start'} Hidden.`,
    ];
    if (building.length > 0)
      lines.push('Building guides leave every teacher’s building library.');
    const confirmed = await showConfirm(lines.join(' '), {
      title: 'Move to Help Center',
      confirmLabel: 'Move',
    });
    if (!confirmed) return;
    setMoving(true);
    setError(null);
    const moved: HelpResourceItem[] = [];
    try {
      for (const row of pickedRows) {
        const result = await moveSetToHelpCenter(row.source, author, {
          loadSetData: library.loadSetData,
          deleteSet: library.deleteSet,
          existingItems: [...items, ...moved],
        });
        moved.push(result.item);
      }
      onMoved(moved.map((item) => item.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      if (moved.length > 0) onMoved(moved.map((item) => item.id));
    } finally {
      setMoving(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={moving ? () => undefined : onClose}
      title="Move from library"
      maxWidth="max-w-xl"
      className="max-h-[88vh]"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Btn
            variant="ghost"
            size="lg"
            className="h-11!"
            onClick={onClose}
            disabled={moving}
            {...tourAttr('admin.help-center.move-cancel')}
          >
            Cancel
          </Btn>
          <Btn
            variant="primary"
            size="lg"
            className="h-11!"
            onClick={() => void handleMove()}
            disabled={pickedRows.length === 0 || moving}
            {...tourAttr('admin.help-center.move-confirm')}
            icon={
              moving ? (
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              ) : undefined
            }
          >
            {pickedRows.length > 0 ? `Move ${pickedRows.length}` : 'Move'}
          </Btn>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="relative">
          <Search
            className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
            aria-hidden="true"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search guides"
            aria-label="Search guides"
            {...tourAttr('admin.help-center.move-search')}
            className="h-11 w-full rounded-lg border border-slate-300 pl-9 pr-3 text-sm focus:outline-hidden focus:border-brand-blue-primary focus:ring-[3px] focus:ring-brand-blue-primary/30"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1 text-xs font-semibold text-slate-600">
            Type
            <Select
              value={type}
              onChange={(e) => setType(e.target.value as TypeFilter)}
              {...tourAttr('admin.help-center.move-type')}
              className="h-11!"
            >
              <option value="all">All</option>
              <option value="live-tour">Live tour</option>
              <option value="picture-guide">Picture guide</option>
            </Select>
          </label>
          <label className="space-y-1 text-xs font-semibold text-slate-600">
            Owner
            <Select
              value={owner}
              onChange={(e) => setOwner(e.target.value as Owner)}
              {...tourAttr('admin.help-center.move-owner')}
              className="h-11!"
            >
              <option value="mine">Mine</option>
              <option value="building">Building</option>
            </Select>
          </label>
        </div>
        <ul
          aria-label="Library guides"
          className="max-h-[50vh] overflow-y-auto pb-2 divide-y divide-slate-100"
        >
          {loading && shown.length === 0 ? (
            <li className="flex items-center gap-2 py-3 text-sm text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              Loading guides...
            </li>
          ) : shown.length === 0 ? (
            <li className="py-3 text-sm text-slate-500">No guides to move.</li>
          ) : (
            shown.map((row) => (
              <li key={row.key}>
                <label className="flex min-h-11 cursor-pointer items-center gap-3 py-2">
                  <Checkbox
                    checked={picked.has(row.key)}
                    onChange={(e) => toggle(row.key, e.target.checked)}
                    disabled={moving}
                    {...tourFieldAttr(
                      'admin.help-center.move-pick',
                      'help',
                      row.key
                    )}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-800">
                    {row.title}
                  </span>
                  <span className="shrink-0 text-xs text-slate-500">
                    {KIND_LABEL[row.kind]}
                  </span>
                </label>
              </li>
            ))
          )}
        </ul>
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
};
