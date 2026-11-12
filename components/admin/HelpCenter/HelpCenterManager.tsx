import React, { useEffect, useRef, useState } from 'react';
import { tourAttr } from '@/config/tourAnchors';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { ExternalLink, Loader2, Plus, Search } from 'lucide-react';
import { db } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import { useDialog } from '@/context/useDialog';
import { useHelpResources } from '@/hooks/useHelpResources';
import {
  loadBuildingSet,
  useGuidedLearning,
  useLiveTourSetIds,
} from '@/hooks/useGuidedLearning';
import { useOrganization } from '@/hooks/useOrganization';
import { useOrganizations } from '@/hooks/useOrganizations';
import {
  Btn,
  CellPopover,
  Select,
} from '@/components/admin/Organization/components/primitives';
import { Modal } from '@/components/common/Modal';
import { TourStepList } from '@/components/tours/TourStepList';
import { requestRecordTour } from '@/components/tours/tourState';
import { requestEditTour } from '@/components/tours/editor/tourEditStore';
import { isLiveTourSet } from '@/components/widgets/GuidedLearning/utils/liveTour';
import type { GuidedLearningSet } from '@/types';
import {
  DEFAULT_HELP_CATEGORIES,
  HELP_PUBLISH_REFUSAL_TEXT,
  isUnfiled,
  type HelpCategory,
  type HelpPublishRefusal,
  type HelpResourceItem,
} from '@/types/helpCenter';
import {
  copyHelpItemToLibrary,
  createHiddenHelpItem,
  hideHelpItem,
  publishHelpItem,
  publishRefusalOf,
  type HelpAuthor,
} from '@/utils/helpCenterItems';
import { logError } from '@/utils/logError';
import { isSuperAdminActor } from '@/utils/superAdmin';
import { HelpCategoriesDialog } from './HelpCategoryEditor';
import { HelpItemDetail, type ScopeOption } from './HelpItemDetail';
import {
  HelpItemList,
  type HelpListSection,
  type HelpRowInfo,
} from './HelpItemList';
import { MoveFromLibraryDialog } from './MoveFromLibraryDialog';
import { PictureGuideStudio } from './PictureGuideStudio';
import { UnmappedAnchorsSection } from './UnmappedAnchorsSection';
import { useHelpCenterSelection } from './helpCenterSelection';
import { useHelpItemSets } from './useHelpItemSets';
import { tourNeedsAttention } from './tourAttention';
import {
  buildCategoriesPayload,
  buildHelpItemFieldsPayload,
  buildScopeMovePayload,
  buildSeedPayload,
  HELP_RESOURCES_COLLECTION,
  newPictureGuide,
  nextOrderInCategory,
  sortCategories,
  type HelpItemFieldPatch,
} from './helpCenterAdmin';

type ShowFilter = 'all' | 'hidden' | 'published' | 'attention' | 'unmapped';

const UNFILED_SECTION: HelpListSection = { id: '', name: 'Unfiled' };

const byOrder = (a: HelpResourceItem, b: HelpResourceItem) =>
  a.order - b.order || a.title.localeCompare(b.title);

const message = (err: unknown) =>
  err instanceof Error ? err.message : String(err);

export const HelpCenterManager: React.FC = () => {
  const { user, userRoles, orgId, roleId, isAdmin, canAccessFeature } =
    useAuth();
  const { showConfirm } = useDialog();
  const isSuperAdmin = isSuperAdminActor(
    user?.email,
    userRoles?.superAdmins,
    roleId,
    orgId
  );
  const {
    items,
    categories,
    loading,
    error: hookError,
  } = useHelpResources({ includeHidden: true, allOrgs: isSuperAdmin });
  const { organizations } = useOrganizations();
  const { organization } = useOrganization(orgId);
  const library = useGuidedLearning(user?.uid);
  const tourSetIds = useLiveTourSetIds();
  const sets = useHelpItemSets(
    items.flatMap((item) =>
      item.kind === 'guided-learning' && item.setId ? [item.setId] : []
    ),
    library.buildingSets
  );
  const [selectedId, setSelectedId] = useHelpCenterSelection();

  const [search, setSearch] = useState('');
  const [show, setShow] = useState<ShowFilter>('all');
  const [newOpen, setNewOpen] = useState(false);
  const newButtonRef = useRef<HTMLSpanElement>(null);
  const [moveOpen, setMoveOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [phoneDetail, setPhoneDetail] = useState(false);
  const [highlighted, setHighlighted] = useState<ReadonlySet<string>>(
    new Set()
  );
  const [studio, setStudio] = useState<GuidedLearningSet | null>(null);
  const [viewing, setViewing] = useState<GuidedLearningSet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Sets filed during this Studio session, so an autosave never files one twice.
  const filedRef = useRef(new Map<string, Promise<HelpResourceItem>>());
  const seededRef = useRef(false);

  // Seed the shared category list once, so the first super admin to open the tab creates the config doc.
  useEffect(() => {
    if (!isSuperAdmin || !user || seededRef.current) return;
    seededRef.current = true;
    const seed = async () => {
      try {
        const ref = doc(db, 'help_center', 'config');
        const snap = await getDoc(ref);
        if (snap.exists()) return;
        await setDoc(ref, buildSeedPayload(DEFAULT_HELP_CATEGORIES, user.uid));
      } catch (err) {
        logError('HelpCenterManager seed', err);
      }
    };
    void seed();
  }, [isSuperAdmin, user]);

  const orgNames = new Map<string, string>();
  organizations.forEach((org) =>
    orgNames.set(org.id, org.shortName || org.name)
  );
  if (organization) {
    orgNames.set(organization.id, organization.shortName || organization.name);
  }
  const scopeLabel = (item: HelpResourceItem): string =>
    item.orgId === null ? 'Everyone' : (orgNames.get(item.orgId) ?? item.orgId);
  const scopeOptions: ScopeOption[] | null = isSuperAdmin
    ? [
        { id: '', label: 'Everyone' },
        ...[...orgNames.entries()]
          .map(([id, label]) => ({ id, label }))
          .sort((a, b) => a.label.localeCompare(b.label)),
      ]
    : null;

  const canPublish = isSuperAdmin || Boolean(orgId);
  const author: HelpAuthor | null = user
    ? {
        uid: user.uid,
        email: user.email,
        orgId: orgId ?? null,
        isSuperAdmin,
      }
    : null;
  const webToursOn = isAdmin === true && canAccessFeature('web-tours');
  const orderedCategories = sortCategories(categories);
  // Rules allow a global item only for super admins and an org item only for that org's admins.
  const canWriteItem = (item: HelpResourceItem): boolean =>
    isSuperAdmin || (item.orgId !== null && item.orgId === orgId);

  const setOf = (
    item: HelpResourceItem
  ): GuidedLearningSet | null | undefined =>
    item.setId ? (sets ? (sets.get(item.setId) ?? null) : undefined) : null;
  const refusalOf = (
    item: HelpResourceItem
  ): HelpPublishRefusal | null | undefined => {
    if (isUnfiled(item)) return 'unfiled';
    const set = setOf(item);
    return set === undefined ? undefined : publishRefusalOf(item, set);
  };
  const infoOf = (item: HelpResourceItem): HelpRowInfo => {
    const set = setOf(item);
    const tour =
      !!item.setId &&
      (tourSetIds.has(item.setId) || (!!set && isLiveTourSet(set)));
    const refusal = refusalOf(item);
    return {
      kind: tour ? 'live-tour' : 'picture-guide',
      published: item.visible,
      attention:
        (refusal !== null && refusal !== undefined) ||
        (tour && !!set && tourNeedsAttention(set)),
    };
  };

  const query = search.trim().toLowerCase();
  const filtering = query !== '' || show !== 'all';
  const shownItems = items.filter((item) => {
    if (query && !item.title.toLowerCase().includes(query)) return false;
    if (show === 'hidden') return !item.visible;
    if (show === 'published') return item.visible;
    if (show === 'attention') return infoOf(item).attention;
    return true;
  });
  const known = new Set(orderedCategories.map((c) => c.id));
  const orphanSections: HelpListSection[] = [
    ...new Set(
      items
        .map((item) => item.categoryId)
        .filter((id) => id !== '' && !known.has(id))
    ),
  ].map((id) => ({ id, name: id }));
  const sections = [
    UNFILED_SECTION,
    ...orderedCategories,
    ...orphanSections,
  ].filter((section) => {
    const count = shownItems.filter(
      (item) => item.categoryId === section.id
    ).length;
    return count > 0 || (!filtering && section.id !== '');
  });

  const selected = items.find((item) => item.id === selectedId) ?? null;

  const select = (id: string | null) => {
    setSelectedId(id);
    setHighlighted(new Set());
    setNotice(null);
    setPhoneDetail(id !== null);
  };

  const updateItem = (id: string, patch: HelpItemFieldPatch) =>
    updateDoc(
      doc(db, HELP_RESOURCES_COLLECTION, id),
      buildHelpItemFieldsPayload(patch)
    );

  const handlePatch = async (
    item: HelpResourceItem,
    patch: HelpItemFieldPatch
  ) => {
    const next = { ...patch };
    if (next.categoryId !== undefined && next.categoryId !== item.categoryId) {
      next.order = nextOrderInCategory(items, next.categoryId);
      // An Unfiled item can't be Published, so filing it away hides it.
      if (next.categoryId === '' && item.visible) next.visible = false;
    }
    await updateItem(item.id, next);
  };

  // orgId is fixed once written, so a scope change recreates the item and drops the old one.
  const handleScopeChange = async (
    item: HelpResourceItem,
    nextOrgId: string | null
  ) => {
    if (!user || nextOrgId === item.orgId) return;
    const confirmed = await showConfirm(
      `Move "${item.title}" to ${nextOrgId === null ? 'Everyone' : (orgNames.get(nextOrgId) ?? nextOrgId)}? Its open count starts again at 0.`,
      { confirmLabel: 'Move' }
    );
    if (!confirmed) return;
    const ref = doc(collection(db, HELP_RESOURCES_COLLECTION));
    const batch = writeBatch(db);
    batch.set(
      ref,
      buildScopeMovePayload(item, { id: ref.id, orgId: nextOrgId, user })
    );
    batch.delete(doc(db, HELP_RESOURCES_COLLECTION, item.id));
    await batch.commit();
    setSelectedId(ref.id);
  };

  // Order values are shared with read-only items from other scopes, so the new
  // numbers come from the merged category sequence, not the own-items index.
  const handleMove = async (
    itemId: string,
    categoryId: string,
    orderedIds: string[]
  ) => {
    const moved = items.find((item) => item.id === itemId);
    if (!moved) return;
    const byId = new Map(items.map((item) => [item.id, item]));
    const slots = items
      .filter((item) => item.categoryId === categoryId && item.id !== itemId)
      .concat(moved.categoryId === categoryId ? [moved] : [])
      .sort(byOrder);
    const queue = orderedIds.flatMap((id) => byId.get(id) ?? []);
    let cursor = 0;
    const merged = slots.map((slot) =>
      canWriteItem(slot) ? (queue[cursor++] ?? slot) : slot
    );
    merged.push(...queue.slice(cursor));
    try {
      const batch = writeBatch(db);
      let writes = 0;
      merged.forEach((item, index) => {
        if (!canWriteItem(item)) return;
        const patch: HelpItemFieldPatch = {};
        if (item.order !== index) patch.order = index;
        if (item.id === itemId && item.categoryId !== categoryId) {
          patch.categoryId = categoryId;
          if (categoryId === '' && item.visible) patch.visible = false;
        }
        if (Object.keys(patch).length === 0) return;
        batch.update(
          doc(db, HELP_RESOURCES_COLLECTION, item.id),
          buildHelpItemFieldsPayload(patch)
        );
        writes++;
      });
      if (writes > 0) await batch.commit();
    } catch (err) {
      setError(message(err));
    }
  };

  const saveCategories = async (next: HelpCategory[]) => {
    if (!user) return;
    await setDoc(
      doc(db, 'help_center', 'config'),
      buildCategoriesPayload(next, user.uid),
      { merge: true }
    );
  };

  // Its items become Unfiled first, so none is left Published under a missing category.
  const deleteCategory = async (
    category: HelpCategory,
    rest: HelpCategory[]
  ) => {
    const orphans = items.filter((item) => item.categoryId === category.id);
    if (orphans.length > 0) {
      const batch = writeBatch(db);
      let order = nextOrderInCategory(items, '');
      orphans.forEach((item) =>
        batch.update(
          doc(db, HELP_RESOURCES_COLLECTION, item.id),
          buildHelpItemFieldsPayload({
            categoryId: '',
            visible: false,
            order: order++,
          })
        )
      );
      await batch.commit();
    }
    await saveCategories(rest);
  };

  const handlePublish = async (item: HelpResourceItem) => {
    if (!user) return;
    const result = await publishHelpItem(item, user.uid);
    if (!result.ok) throw new Error(HELP_PUBLISH_REFUSAL_TEXT[result.reason]);
  };

  const handleDelete = async (item: HelpResourceItem) => {
    const confirmed = await showConfirm(`Delete "${item.title}"?`, {
      variant: 'danger',
      confirmLabel: 'Delete',
    });
    if (!confirmed) return;
    await deleteDoc(doc(db, HELP_RESOURCES_COLLECTION, item.id));
    select(null);
  };

  const handleEdit = async (item: HelpResourceItem) => {
    if (!item.setId) return;
    if (infoOf(item).kind === 'live-tour') {
      requestEditTour({ setId: item.setId, origin: 'help-center' });
      return;
    }
    try {
      const full = await loadBuildingSet(item.setId);
      if (!full) setError(HELP_PUBLISH_REFUSAL_TEXT['missing-set']);
      else setStudio({ ...full, isBuilding: true });
    } catch (err) {
      setError(message(err));
    }
  };

  const handleCopyToLibrary = async (item: HelpResourceItem) => {
    if (!user) return;
    await copyHelpItemToLibrary(item, user.uid, library.saveSet);
    setNotice('Copied to your library.');
  };

  // A new Picture guide is filed on its first save, so closing an empty one leaves nothing behind.
  const handleStudioSave = async (set: GuidedLearningSet) => {
    await library.saveBuildingSet(set);
    if (!author) return;
    if (items.some((item) => item.setId === set.id)) return;
    let filing = filedRef.current.get(set.id);
    if (!filing) {
      filing = createHiddenHelpItem(set, author);
      filedRef.current.set(set.id, filing);
      const item = await filing;
      select(item.id);
    }
  };

  const startPictureGuide = () => {
    setNewOpen(false);
    setStudio(newPictureGuide(user?.uid));
  };

  const newMenu = [
    {
      label: 'Record a Live tour',
      anchor: tourAttr('admin.help-center.new-record-tour'),
      onClick: () => {
        setNewOpen(false);
        requestRecordTour('help-center');
      },
    },
    {
      label: 'Move from library',
      anchor: tourAttr('admin.help-center.new-move'),
      onClick: () => {
        setNewOpen(false);
        setMoveOpen(true);
      },
    },
    {
      label: 'New Picture guide',
      anchor: tourAttr('admin.help-center.new-picture-guide'),
      onClick: startPictureGuide,
    },
  ];

  const handleMenuKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const buttons = [
      ...e.currentTarget.querySelectorAll<HTMLButtonElement>(
        '[role="menuitem"]'
      ),
    ];
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const step = e.key === 'ArrowDown' ? 1 : -1;
    buttons[(at + step + buttons.length) % buttons.length]?.focus();
  };

  return (
    <div className="space-y-4 pb-6">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900">Help Center</h2>
          <div className="flex flex-wrap items-center gap-2">
            {webToursOn && (
              <a
                href="/web-tours"
                target="_blank"
                rel="noopener"
                {...tourAttr('admin.help-center.web-tours-link')}
                className="flex h-11 items-center gap-1 px-2 text-sm font-semibold text-slate-600 hover:text-slate-900 hover:underline"
              >
                Web tours
                <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
              </a>
            )}
            {isSuperAdmin && (
              <Btn
                size="lg"
                className="h-11!"
                onClick={() => setCategoriesOpen(true)}
                {...tourAttr('admin.help-center.categories')}
              >
                Categories
              </Btn>
            )}
            <span ref={newButtonRef} className="inline-flex">
              <Btn
                variant="primary"
                size="lg"
                className="h-11!"
                aria-haspopup="menu"
                aria-expanded={newOpen}
                disabled={!canPublish || !author}
                onClick={() => setNewOpen((open) => !open)}
                {...tourAttr('admin.help-center.add-item')}
                icon={<Plus className="w-4 h-4" aria-hidden="true" />}
              >
                New
              </Btn>
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-48 flex-1">
            <Search
              className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
              aria-hidden="true"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search"
              aria-label="Search help items"
              {...tourAttr('admin.help-center.search')}
              className="h-11 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm focus:outline-hidden focus:border-brand-blue-primary focus:ring-[3px] focus:ring-brand-blue-primary/30"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            Show
            <Select
              aria-label="Show"
              value={show}
              onChange={(e) => setShow(e.target.value as ShowFilter)}
              {...tourAttr('admin.help-center.show')}
              className="h-11! w-auto!"
            >
              <option value="all">All</option>
              <option value="hidden">Hidden</option>
              <option value="published">Published</option>
              <option value="attention">Needs attention</option>
              <option value="unmapped">Unmapped controls</option>
            </Select>
          </label>
        </div>
      </header>

      <CellPopover
        open={newOpen}
        onClose={() => setNewOpen(false)}
        anchorRef={newButtonRef}
        className="w-56"
      >
        <div role="menu" aria-label="New" onKeyDown={handleMenuKey}>
          {newMenu.map((entry, index) => (
            <button
              key={entry.label}
              type="button"
              role="menuitem"
              autoFocus={index === 0}
              onClick={entry.onClick}
              {...entry.anchor}
              className="flex h-11 w-full items-center rounded-lg px-3 text-left text-sm text-slate-700 hover:bg-slate-50 focus:bg-slate-50 focus:outline-hidden"
            >
              {entry.label}
            </button>
          ))}
        </div>
      </CellPopover>

      {!canPublish && (
        <p className="text-sm text-amber-800">
          You must belong to an organization to add help items.
        </p>
      )}

      {(error ?? hookError) && (
        <p role="alert" className="text-sm text-red-600">
          {error ?? hookError}
        </p>
      )}

      {show === 'unmapped' ? (
        <UnmappedAnchorsSection />
      ) : loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          Loading help items...
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
          <div className={phoneDetail && selected ? 'hidden md:block' : ''}>
            {items.length === 0 ? (
              <p className="text-sm text-slate-500">
                No help items yet. Press New to add one.
              </p>
            ) : sections.length === 0 ? (
              <p className="text-sm text-slate-500">No matching items.</p>
            ) : (
              <HelpItemList
                sections={sections}
                items={shownItems}
                draggable={!filtering}
                canWrite={canWriteItem}
                infoOf={infoOf}
                selectedId={selectedId}
                highlighted={highlighted}
                onSelect={select}
                onMove={(id, categoryId, ids) =>
                  void handleMove(id, categoryId, ids)
                }
              />
            )}
          </div>
          <div
            className={`self-start md:sticky md:top-0 ${phoneDetail && selected ? '' : 'hidden md:block'}`}
          >
            {notice && (
              <p role="status" className="pb-3 text-sm text-emerald-700">
                {notice}
              </p>
            )}
            {selected ? (
              <HelpItemDetail
                key={selected.id}
                item={selected}
                info={infoOf(selected)}
                set={setOf(selected)}
                refusal={refusalOf(selected)}
                categories={orderedCategories}
                canWrite={canWriteItem(selected)}
                scopeLabel={scopeLabel(selected)}
                scopeOptions={scopeOptions}
                onBack={() => setPhoneDetail(false)}
                onPatch={(patch) => handlePatch(selected, patch)}
                onScopeChange={(next) => handleScopeChange(selected, next)}
                onEdit={() => void handleEdit(selected)}
                onViewSteps={() => setViewing(setOf(selected) ?? null)}
                onCopyToLibrary={() => handleCopyToLibrary(selected)}
                onPublish={() => handlePublish(selected)}
                onHide={() => hideHelpItem(selected)}
                onDelete={() => handleDelete(selected)}
              />
            ) : (
              items.length > 0 && (
                <p className="text-sm text-slate-500">Select an item.</p>
              )
            )}
          </div>
        </div>
      )}

      {moveOpen && author && (
        <MoveFromLibraryDialog
          library={library}
          items={items}
          author={author}
          onClose={() => setMoveOpen(false)}
          onMoved={(ids) => {
            setMoveOpen(false);
            select(ids[0] ?? null);
            setHighlighted(new Set(ids));
          }}
        />
      )}

      {categoriesOpen && isSuperAdmin && (
        <HelpCategoriesDialog
          categories={orderedCategories}
          items={items}
          onSave={saveCategories}
          onDelete={deleteCategory}
          onClose={() => setCategoriesOpen(false)}
        />
      )}

      {viewing && (
        <Modal
          isOpen
          onClose={() => setViewing(null)}
          title={viewing.title || 'Steps'}
          maxWidth="max-w-2xl"
          className="max-h-[88vh]"
          contentClassName="px-6 pb-6 overflow-y-auto"
        >
          <TourStepList set={viewing} />
        </Modal>
      )}

      {studio && (
        <PictureGuideStudio
          set={studio}
          onSave={handleStudioSave}
          onClose={() => setStudio(null)}
        />
      )}
    </div>
  );
};
