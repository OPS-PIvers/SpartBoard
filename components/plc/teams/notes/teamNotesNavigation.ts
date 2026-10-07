// Cross-page links from notes and the Department Hub; the landing page lives at the team's root path.

import type { TeamPageId } from '@/types';
import { buildPlcPath, spaNavigate } from '@/utils/plcPath';
import type { PlcSectionId } from '@/components/plc/sections';

const SECTION_FOR_PAGE: Partial<Record<TeamPageId, PlcSectionId>> = {
  dataOverview: 'home',
  hub: 'home',
  programHub: 'home',
  assessments: 'assessments',
  docs: 'docs',
  resources: 'resources',
};

export interface PendingNotesItem {
  kind: 'note' | 'doc';
  id: string;
}

// What the Notes & Docs page should open next; read once when the page mounts.
const pending = new Map<string, PendingNotesItem>();

export function takePendingNotesItem(plcId: string): PendingNotesItem | null {
  const item = pending.get(plcId) ?? null;
  pending.delete(plcId);
  return item;
}

export function openTeamPage(plcId: string, page: TeamPageId): void {
  spaNavigate(buildPlcPath(plcId, SECTION_FOR_PAGE[page] ?? 'home'));
}

export function openTeamNote(plcId: string, noteId: string): void {
  pending.set(plcId, { kind: 'note', id: noteId });
  openTeamPage(plcId, 'docs');
}

export function openTeamDoc(plcId: string, docId: string): void {
  pending.set(plcId, { kind: 'doc', id: docId });
  openTeamPage(plcId, 'docs');
}

/** Asks the team shell to open its layout editor, where the lead changes the hero. */
export const OPEN_LAYOUT_EDITOR_EVENT = 'teams:open-layout-editor';
export function requestLayoutEditor(plcId: string): void {
  window.dispatchEvent(
    new CustomEvent(OPEN_LAYOUT_EDITOR_EVENT, { detail: { plcId } })
  );
}
