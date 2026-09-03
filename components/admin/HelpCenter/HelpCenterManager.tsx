import React, { useEffect, useRef, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import {
  ChevronDown,
  ChevronRight,
  Eye,
  GraduationCap,
  GripVertical,
  Link2,
  LifeBuoy,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { db } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import { useDialog } from '@/context/useDialog';
import { useHelpResources } from '@/hooks/useHelpResources';
import { useOrganization } from '@/hooks/useOrganization';
import { useOrganizations } from '@/hooks/useOrganizations';
import {
  SortableList,
  type SortableListDragHandleProps,
} from '@/components/common/SortableList';
import { Toggle } from '@/components/common/Toggle';
import { DEFAULT_HELP_CATEGORIES } from '@/types/helpCenter';
import type { HelpCategory, HelpResourceItem } from '@/types/helpCenter';
import { logError } from '@/utils/logError';
import { HelpCategoryEditor } from './HelpCategoryEditor';
import { HelpItemForm } from './HelpItemForm';
import {
  buildHelpItemCreatePayload,
  buildHelpItemUpdatePayload,
  buildCategoriesPayload,
  buildOrderPayload,
  buildSeedPayload,
  buildVisibilityPayload,
  HELP_RESOURCES_COLLECTION,
  nextOrderInCategory,
  sortCategories,
  type HelpItemDraft,
} from './helpCenterAdmin';

const UNCATEGORIZED: HelpCategory = {
  id: '',
  name: 'Uncategorized',
  order: Number.MAX_SAFE_INTEGER,
};

export const HelpCenterManager: React.FC = () => {
  const { user, userRoles, orgId } = useAuth();
  const { showConfirm } = useDialog();
  const isSuperAdmin = Boolean(
    user?.email &&
    userRoles?.superAdmins?.some(
      (e) => e.toLowerCase() === user.email?.toLowerCase()
    )
  );
  const {
    items,
    categories,
    loading,
    error: hookError,
  } = useHelpResources({
    includeHidden: true,
    allOrgs: isSuperAdmin,
  });
  const { organizations } = useOrganizations();
  const { organization } = useOrganization(orgId);
  const seededRef = useRef(false);

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<HelpResourceItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sortByOpens, setSortByOpens] = useState(false);

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

  const canPublish = isSuperAdmin || Boolean(orgId);
  const orderedCategories = sortCategories(categories);
  const hasCategories = orderedCategories.length > 0;
  // Rules allow a global item only for super admins and an org item only for that org's admins.
  const canWriteItem = (item: HelpResourceItem): boolean =>
    isSuperAdmin || (item.orgId !== null && item.orgId === orgId);
  const sections = [...orderedCategories, UNCATEGORIZED].filter(
    (category) =>
      category.id !== '' || items.some((item) => item.categoryId === '')
  );
  const flatByOpens = [...items].sort((a, b) => b.openCount - a.openCount);

  const scopeLabel = (item: HelpResourceItem): string =>
    item.orgId === null ? 'Everyone' : (orgNames.get(item.orgId) ?? item.orgId);

  const saveCategories = async (next: HelpCategory[]) => {
    if (!user) return;
    await setDoc(
      doc(db, 'help_center', 'config'),
      buildCategoriesPayload(next, user.uid),
      { merge: true }
    );
  };

  const handleSave = async (draft: HelpItemDraft) => {
    if (!user) throw new Error('Not signed in.');
    if (editing) {
      await updateDoc(
        doc(db, HELP_RESOURCES_COLLECTION, editing.id),
        buildHelpItemUpdatePayload(draft)
      );
    } else {
      const ref = doc(collection(db, HELP_RESOURCES_COLLECTION));
      await setDoc(
        ref,
        buildHelpItemCreatePayload(draft, {
          id: ref.id,
          orgId: isSuperAdmin ? null : orgId,
          user,
          order: nextOrderInCategory(items, draft.categoryId),
        })
      );
    }
    setFormOpen(false);
    setEditing(null);
  };

  const handleDelete = async (item: HelpResourceItem) => {
    const confirmed = await showConfirm(`Delete "${item.title}"?`);
    if (!confirmed) return;
    try {
      await deleteDoc(doc(db, HELP_RESOURCES_COLLECTION, item.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleToggleVisible = async (item: HelpResourceItem) => {
    try {
      await updateDoc(
        doc(db, HELP_RESOURCES_COLLECTION, item.id),
        buildVisibilityPayload(!item.visible)
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  // Order values are shared with read-only items from other scopes, so the new
  // numbers must come from the merged section sequence, not the own-items index.
  const handleReorder = async (
    next: HelpResourceItem[],
    sectionItems: HelpResourceItem[]
  ) => {
    try {
      const slots = [...sectionItems].sort(
        (a, b) => a.order - b.order || a.title.localeCompare(b.title)
      );
      let cursor = 0;
      const merged = slots.map((slot) =>
        canWriteItem(slot) ? next[cursor++] : slot
      );
      const batch = writeBatch(db);
      merged.forEach((item, index) => {
        if (item.order === index || !canWriteItem(item)) return;
        batch.update(
          doc(db, HELP_RESOURCES_COLLECTION, item.id),
          buildOrderPayload(index)
        );
      });
      await batch.commit();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const toggleCollapsed = (categoryId: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });

  // handle is null where rows are not draggable; canWrite gates the edit controls independently.
  const renderRow = (
    item: HelpResourceItem,
    handle: SortableListDragHandleProps | null,
    canWrite: boolean
  ) => (
    <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-lg px-2 py-2">
      {handle ? (
        <button
          type="button"
          aria-label={`Reorder ${item.title}`}
          className="text-slate-400 cursor-grab"
          {...handle.attributes}
          {...handle.listeners}
        >
          <GripVertical className="w-4 h-4" />
        </button>
      ) : (
        <span className="w-4 h-4 shrink-0" aria-hidden="true" />
      )}
      {item.kind === 'embed' ? (
        <Link2 className="w-4 h-4 text-slate-500" />
      ) : (
        <GraduationCap className="w-4 h-4 text-slate-500" />
      )}
      <span className="flex-1 min-w-0">
        <span className="block text-sm text-slate-900 truncate">
          {item.title}
        </span>
        {item.description && (
          <span className="block text-xs text-slate-500 truncate">
            {item.description}
          </span>
        )}
      </span>
      <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs shrink-0">
        {scopeLabel(item)}
      </span>
      <span className="flex items-center gap-1 text-xs text-slate-500 shrink-0">
        <Eye className="w-3.5 h-3.5" />
        {item.openCount}
      </span>
      {canWrite ? (
        <>
          <Toggle
            checked={item.visible}
            onChange={() => void handleToggleVisible(item)}
            label={`Visible: ${item.title}`}
            size="sm"
            showLabels={false}
          />
          <button
            type="button"
            aria-label={`Edit ${item.title}`}
            onClick={() => {
              setEditing(item);
              setFormOpen(true);
            }}
            className="text-slate-400 hover:text-slate-900"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            type="button"
            aria-label={`Delete ${item.title}`}
            onClick={() => void handleDelete(item)}
            className="text-slate-400 hover:text-red-600"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </>
      ) : (
        <span className="text-xs text-slate-400 shrink-0">Read only</span>
      )}
    </div>
  );

  return (
    <div className="p-6 space-y-4">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <LifeBuoy className="w-5 h-5 text-brand-blue-primary" />
            Help Center
          </h2>
          <p className="text-sm text-slate-500">
            Guides teachers see in the Help modal.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-pressed={sortByOpens}
            onClick={() => setSortByOpens((prev) => !prev)}
            className={`flex items-center gap-1 px-3 py-2 rounded-lg border text-sm ${
              sortByOpens
                ? 'bg-brand-blue-primary text-white border-brand-blue-primary'
                : 'bg-white text-slate-600 border-slate-200'
            }`}
          >
            <Eye className="w-4 h-4" />
            Sort by opens
          </button>
          <button
            type="button"
            disabled={!canPublish || !hasCategories}
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
            className="flex items-center gap-1 px-3 py-2 rounded-lg bg-brand-blue-primary text-white text-sm disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            Add item
          </button>
        </div>
      </header>

      {canPublish && !hasCategories && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          No categories yet. A super admin needs to open this tab first.
        </p>
      )}

      {!canPublish && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          You must belong to an organization to publish help items.
        </p>
      )}

      {isSuperAdmin ? (
        <HelpCategoryEditor
          categories={orderedCategories}
          items={items}
          onSave={saveCategories}
        />
      ) : (
        <div className="border border-slate-200 rounded-lg p-3 bg-slate-50">
          <h3 className="text-sm font-semibold text-slate-900 mb-1">
            Categories
          </h3>
          <p className="text-sm text-slate-500">
            {orderedCategories.map((c) => c.name).join(' · ')}
          </p>
        </div>
      )}

      {(error ?? hookError) && (
        <p role="alert" className="text-sm text-red-600">
          {error ?? hookError}
        </p>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading help items...
        </div>
      ) : sortByOpens ? (
        <div className="border border-slate-200 rounded-lg p-3 space-y-1">
          {flatByOpens.length === 0 && (
            <p className="text-sm text-slate-500">No items yet.</p>
          )}
          {flatByOpens.map((item) => (
            <div key={item.id}>{renderRow(item, null, canWriteItem(item))}</div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {sections.map((category) => {
            const sectionItems = items.filter(
              (item) => item.categoryId === category.id
            );
            const isCollapsed = collapsed.has(category.id);
            const ownItems = sectionItems.filter(canWriteItem);
            const readOnlyItems = sectionItems.filter(
              (item) => !canWriteItem(item)
            );
            const categoryOpens = sectionItems.reduce(
              (sum, item) => sum + item.openCount,
              0
            );
            return (
              <section
                key={category.id || 'uncategorized'}
                className="border border-slate-200 rounded-lg"
              >
                <button
                  type="button"
                  onClick={() => toggleCollapsed(category.id)}
                  aria-expanded={!isCollapsed}
                  className="w-full flex items-center justify-between px-3 py-2 text-left"
                >
                  <span className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    {isCollapsed ? (
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-400" />
                    )}
                    {category.name}
                  </span>
                  <span className="flex items-center gap-2 text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <Eye className="w-3.5 h-3.5" />
                      {categoryOpens}
                    </span>
                    {sectionItems.length} item
                    {sectionItems.length === 1 ? '' : 's'}
                  </span>
                </button>
                {!isCollapsed && (
                  <div className="px-3 pb-3 space-y-1">
                    {sectionItems.length === 0 && (
                      <p className="text-sm text-slate-500">
                        No items in this category yet.
                      </p>
                    )}
                    {readOnlyItems.map((item) => (
                      <div key={item.id}>{renderRow(item, null, false)}</div>
                    ))}
                    {ownItems.length > 0 && (
                      <SortableList
                        items={ownItems}
                        getId={(item) => item.id}
                        onReorder={(next) =>
                          void handleReorder(next, sectionItems)
                        }
                        className="space-y-1"
                        renderItem={(item, handle) =>
                          renderRow(item, handle, true)
                        }
                      />
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {formOpen && (
        <HelpItemForm
          key={editing?.id ?? 'new'}
          isOpen={formOpen}
          editing={editing}
          categories={orderedCategories}
          onClose={() => {
            setFormOpen(false);
            setEditing(null);
          }}
          onSave={handleSave}
        />
      )}
    </div>
  );
};
